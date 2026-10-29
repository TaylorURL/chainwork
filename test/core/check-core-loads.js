/**
 * Every core module loads, and the barrel stays browser-safe.
 *
 * The console bundles the core beside the table it draws, so a Node built-in
 * imported into it is a build that fails on the site rather than here. One
 * module is allowed one: `prospects/address.js` asks DNS whether a domain can
 * take mail, which is why it is kept out of the barrel and named here rather
 * than left to be discovered.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cases, check, finish, ok, same } from '../harness/checks.js'

const root = new URL('../../src/', import.meta.url).pathname

/** Every .js file under a folder, deepest last, as repo-relative paths. */
function filesUnder(folder) {
  const found = []
  for (const name of readdirSync(folder).sort()) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) found.push(...filesUnder(path))
    else if (name.endsWith('.js')) found.push(path)
  }
  return found
}

/** The one module that may reach a Node built-in, and what it reaches for. */
const SERVER_ONLY = new Map([['core/prospects/address.js', 'node:dns/promises']])

const core = filesUnder(join(root, 'core'))
const engine = filesUnder(join(root, 'engine'))

check('there is a core to check', core.length > 10)

for (const path of [...core, ...engine]) {
  const relative = path.slice(root.length)
  check(`${relative} loads`, async () => {
    const loaded = await import(path)
    ok(loaded, `${relative} imported as nothing`)
  })
}

for (const path of [...core, ...engine]) {
  const relative = path.slice(root.length)
  const source = readFileSync(path, 'utf8')
  const builtins = [...source.matchAll(/from '(node:[^']+)'/g)].map(one => one[1])
  const allowed = SERVER_ONLY.get(relative)
  check(`${relative} imports no Node built-in it is not allowed`, () => {
    const wrong = builtins.filter(one => one !== allowed)
    same(wrong.join(', '), '', `${relative} reaches for`)
  })
}

check('the core barrel leaves the one server-only module out', async () => {
  const source = readFileSync(join(root, 'core/index.js'), 'utf8')
  for (const module of SERVER_ONLY.keys()) {
    const name = module.replace(/^core\//, './')
    ok(!source.includes(name), `the barrel exports ${module}, which is not browser-safe`)
  }
})

check('no core module reaches outside the package', () => {
  const faults = []
  for (const path of [...core, ...engine]) {
    const source = readFileSync(path, 'utf8')
    for (const [, where] of source.matchAll(/from '([^']+)'/g)) {
      if (where.startsWith('node:')) continue
      if (where.startsWith('.')) {
        if (where.includes('../../../')) faults.push(`${path.slice(root.length)} imports ${where}`)
        continue
      }
      faults.push(`${path.slice(root.length)} imports the package ${where}`)
    }
  }
  same(faults.join('\n'), '', 'imports that leave the package')
})

await finish({ hint: 'src/core and src/engine must load standing alone, with no host behind them.' })

console.log(`core loads: ${cases.length} checks passed`)
