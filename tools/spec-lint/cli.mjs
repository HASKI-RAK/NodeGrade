#!/usr/bin/env node
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { lintSpecs } from './lint.mjs'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const specsDir = resolve(process.argv[2] ?? resolve(repoRoot, 'specs'))

const started = performance.now()
const errors = lintSpecs(specsDir)
const duration = performance.now() - started

for (const error of errors) {
  console.error(`${relative(repoRoot, error.file)}:${error.line}  [${error.rule}] ${error.message}`)
}

if (errors.length > 0) {
  console.error(`\n${errors.length} specification lint error${errors.length === 1 ? '' : 's'} (${duration.toFixed(0)} ms)`)
  process.exit(1)
}

console.log(`Specifications are consistent (${duration.toFixed(0)} ms)`)
