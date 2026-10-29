/**
 * The whole suite, in one process per check.
 *
 * Each check is its own file and its own process, because several of them
 * install something at module level - a zone, a held-domain list - and a check
 * that runs after one of those in the same process is reading a module
 * somebody else configured. Separate processes is the cheap way to make every
 * check start from the state the package ships in.
 *
 * The first failing check stops the run, and its own output has already said
 * which case failed and why.
 */

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname
const folders = ['core', 'engine', 'adapters']

const checks = folders.flatMap(folder =>
  readdirSync(join(here, folder))
    .filter(name => name.startsWith('check-') && name.endsWith('.js'))
    .sort()
    .map(name => join(folder, name))
)

if (!checks.length) {
  console.error('test/run.js found no checks')
  process.exit(1)
}

for (const check of checks) {
  const ran = spawnSync(process.execPath, [join(here, check)], { stdio: 'inherit' })
  if (ran.status !== 0) {
    console.error(`\n${check} failed; the run stops here`)
    process.exit(ran.status ?? 1)
  }
}

console.log(`\nchainwork: ${checks.length} check files passed`)
