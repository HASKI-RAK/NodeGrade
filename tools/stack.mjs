import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Drives `docker-compose.yml` — the real stack, with the real embedding and
 * entailment models, as opposed to `tools/debug/stack.mjs` and its deterministic
 * stand-in.
 *
 * It exists because several ways of getting this wrong all look like a working
 * stack:
 *
 *   - `docker compose up` without `--build` reuses whatever image already carries
 *     the tag, so a pull can leave you serving last month's routes, templates and
 *     migrations with no error anywhere. `--build` is always on here.
 *   - `PROVIDER_ENCRYPTION_KEY` passed per command changes on the next start, and
 *     the new key cannot decrypt the provider credentials the old one wrote. This
 *     writes one into `.env` once and never touches it again.
 *   - The first boot downloads 2.3 GB of model weights before `/health` answers,
 *     which looks like a hang rather than progress.
 *   - Without `ADMIN_USERNAME` and `ADMIN_PASSWORD` the stack comes up perfectly
 *     and has no way to create the workshop it exists to serve.
 */

const root = fileURLToPath(new URL('..', import.meta.url))
const compose = ['compose', '-f', 'docker-compose.yml']
const envPath = fileURLToPath(new URL('../.env', import.meta.url))

function run(args) {
  const result = spawnSync('docker', [...compose, ...args], {
    cwd: root,
    stdio: 'inherit'
  })
  process.exitCode = result.status ?? 1
  return result.status === 0
}

/**
 * Reads `.env` the way Compose does for variable substitution: `KEY=value`, with
 * optional surrounding quotes, comments ignored. Only used to report what is
 * configured, never to pass values on — Compose reads the same file itself.
 */
function readEnvFile() {
  const values = new Map()
  if (!existsSync(envPath)) return values
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    values.set(match[1], match[2].trim().replace(/^["']|["']$/g, ''))
  }
  return values
}

const configured = (env, name) => Boolean(process.env[name] || env.get(name))

// Deliberately stops before the line ending: `.` matches `\r`, and eating it
// would leave a CRLF file with one LF line in the middle.
const KEY_LINE = /^[ \t]*PROVIDER_ENCRYPTION_KEY[ \t]*=[^\r\n]*/m

/**
 * Makes sure `.env` carries an encryption key, generating one only when there is
 * nothing to lose: an existing value is never replaced, because a new key cannot
 * decrypt the provider credentials written under the old one.
 */
function ensureEncryptionKey(env) {
  if (env.get('PROVIDER_ENCRYPTION_KEY')) return
  const key = randomBytes(32).toString('base64url')
  if (!existsSync(envPath)) {
    writeFileSync(
      envPath,
      [
        '# Local configuration for docker-compose.yml. Not in git.',
        '# See .env_template for everything else this stack reads.',
        '',
        '# Encrypts provider API keys at rest. Keep it: a new key cannot decrypt',
        '# the credentials the old one wrote.',
        `PROVIDER_ENCRYPTION_KEY="${key}"`,
        ''
      ].join('\n')
    )
    console.log('Wrote .env with a generated PROVIDER_ENCRYPTION_KEY.')
  } else if (KEY_LINE.test(readFileSync(envPath, 'utf8'))) {
    const contents = readFileSync(envPath, 'utf8')
    writeFileSync(
      envPath,
      contents.replace(KEY_LINE, `PROVIDER_ENCRYPTION_KEY="${key}"`)
    )
    console.log('Filled the empty PROVIDER_ENCRYPTION_KEY in .env.')
  } else {
    appendFileSync(envPath, `\nPROVIDER_ENCRYPTION_KEY="${key}"\n`)
    console.log('Appended a generated PROVIDER_ENCRYPTION_KEY to .env.')
  }
  env.set('PROVIDER_ENCRYPTION_KEY', key)
}

const port = (env, name, fallback) =>
  process.env[name] || env.get(name) || fallback

function printEndpoints(env) {
  const ui = port(env, 'NODEGRADE_FRONTEND_PORT', '8080')
  console.log('\nNodeGrade:')
  console.log(`  UI        http://localhost:${ui}`)
  console.log(`  Admin     http://localhost:${ui}/admin`)
  console.log(
    `  Backend   http://localhost:${port(env, 'NODEGRADE_BACKEND_PORT', '5000')}/health`
  )
  console.log(
    `  NLP       http://localhost:${port(env, 'NODEGRADE_MODELS_PORT', '8002')}/health`
  )
  console.log(
    `  Database  localhost:${port(env, 'NODEGRADE_DATABASE_PORT', '5432')}\n`
  )

  if (!configured(env, 'ADMIN_USERNAME') || !configured(env, 'ADMIN_PASSWORD'))
    console.log(
      'ADMIN_USERNAME and ADMIN_PASSWORD are not both set, so /admin stays\n' +
        'disabled and no workshop can be created. Set both in .env, then run\n' +
        '`yarn dev:up` again.\n'
    )

  if (
    ui !== '8080' &&
    !configured(env, 'CORS_ORIGIN') &&
    !configured(env, 'FRONTEND_URL')
  )
    console.log(
      `The UI is on ${ui} but CORS_ORIGIN and FRONTEND_URL still say 8080, so the\n` +
        'browser will be refused. Set both to http://localhost:' +
        `${ui} in .env.\n`
    )

  const provider = ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'KATALYST_API_KEY']
  if (
    !provider.some((name) => configured(env, name)) &&
    !configured(env, 'MODEL_WORKER_URL')
  )
    console.log(
      'No language-model credential is configured, so nodes that prompt a model\n' +
        `cannot run. Set one of ${provider.join(', ')} or\n` +
        'MODEL_WORKER_URL in .env. Embedding, keyword and equivalence nodes work\n' +
        'without one.'
    )
}

function announceStart(env) {
  console.log(
    `Building and starting with ${env.get('EMBEDDING_MODEL') || process.env.EMBEDDING_MODEL || 'BAAI/bge-m3'}. ` +
      'The first run downloads the\n' +
      'embedding model (~2.3 GB) before the NLP worker reports healthy, so it can\n' +
      'take several minutes. The entailment model is fetched later, on the first\n' +
      'equivalence run.\n'
  )
}

const UP = ['up', '--build', '--detach', '--wait', '--remove-orphans']
const command = process.argv[2]
const env = readEnvFile()

switch (command) {
  case 'up':
    ensureEncryptionKey(env)
    announceStart(env)
    if (run(UP)) printEndpoints(env)
    break
  case 'serve':
    ensureEncryptionKey(env)
    announceStart(env)
    run(['up', '--build', '--remove-orphans'])
    break
  case 'down':
    run(['down', '--remove-orphans'])
    break
  case 'status':
    run(['ps'])
    break
  case 'logs':
    run(['logs', '--follow', '--tail', '200'])
    break
  case 'reset':
    // Drops both volumes: the database, which is the point, and the model cache,
    // which means the next start downloads the weights again.
    console.log(
      'Deleting the database and the model cache. Workshops, workspaces and\n' +
        'provider credentials go with them, and the next start re-downloads the\n' +
        'models. Ctrl-C now if that is not what you meant.\n'
    )
    if (run(['down', '--volumes', '--remove-orphans'])) {
      ensureEncryptionKey(env)
      announceStart(env)
      if (run(UP)) printEndpoints(env)
    }
    break
  default:
    console.error('Usage: node tools/stack.mjs <up|serve|down|status|logs|reset>')
    process.exitCode = 1
}
