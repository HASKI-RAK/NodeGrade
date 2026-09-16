import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const compose = ['compose', '-f', 'docker-compose.debug.yml']

function run(args) {
  const result = spawnSync('docker', [...compose, ...args], {
    cwd: root,
    stdio: 'inherit'
  })
  process.exitCode = result.status ?? 1
  return result.status === 0
}

function printEndpoints() {
  console.log('NodeGrade debug endpoints:')
  console.log(
    `  UI:        http://localhost:${process.env.NODEGRADE_DEBUG_FRONTEND_PORT ?? '15173'}/workshop/WAVE-2026`
  )
  console.log(
    `  Backend:   http://localhost:${process.env.NODEGRADE_DEBUG_BACKEND_PORT ?? '15000'}/health`
  )
  console.log(
    `  Model:     http://localhost:${process.env.NODEGRADE_DEBUG_MODEL_PORT ?? '18000'}/health`
  )
  console.log(
    `  Inspector: localhost:${process.env.NODEGRADE_DEBUG_INSPECTOR_PORT ?? '19229'}`
  )
}

const command = process.argv[2]

switch (command) {
  case 'up':
    if (run(['up', '--build', '--detach', '--wait', '--remove-orphans'])) {
      printEndpoints()
    }
    break
  case 'serve':
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
    if (run(['down', '--volumes', '--remove-orphans'])) {
      if (run(['up', '--build', '--detach', '--wait', '--remove-orphans'])) {
        printEndpoints()
      }
    }
    break
  default:
    console.error('Usage: node tools/debug/stack.mjs <up|serve|down|status|logs|reset>')
    process.exitCode = 1
}
