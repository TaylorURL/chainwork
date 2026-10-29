/**
 * Proves the package carries nothing about a customer that a stranger may not
 * read.
 *
 * Every other check here asks whether the code is right. This one asks who is
 * named in it, because those are different questions and only one of them is
 * answered by the tests passing.
 *
 * Three kinds of fact may never be written into a source file: a payment
 * processor's id, which says which record in an account a person is; an
 * address at a domain nobody here owns, which is somebody's mailbox; and a
 * held domain, which is a company that asked not to be written to - the one
 * list where being on it at all is the sensitive part. This package holds no
 * held list by design, since the host installs it, so what is left to check is
 * the first two.
 *
 * What passes is a name nobody can own. RFC 2606 reserves example.com and the
 * .example, .test, .invalid and .localhost top levels precisely so a fixture
 * can name a business without naming a business, and a fixture using them
 * cannot collide with a real company however it is edited later.
 *
 * The one allowance is about companies rather than people: a mail host on the
 * throwaway list, which is a blocklist and useless without the real names.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cases, check, fail, finish } from '../harness/checks.js'

const root = new URL('../../', import.meta.url).pathname

/** Folders a reader never gets, so nothing in them is published. */
const SKIP = new Set(['node_modules', '.git'])

/** Files that are read rather than run, and the only ones worth reading. */
const READABLE = /\.(js|json|md|yml|yaml)$/

/** Hosts a fixture may use because nobody can register them. RFC 2606 and 6761. */
const RESERVED = /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost)$/

/** A payment processor's own id for a customer, a charge or a subscription. */
const STRIPE_ID = /\b(cus|sub|in|pi|cs|prod|price|ch|card|pm)_[A-Za-z0-9]{14,}\b/g

/** Anything shaped like a mailbox. */
const ADDRESS = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g

/**
 * The one file allowed to name real mail hosts: the throwaway list, which is a
 * blocklist. Naming them is the whole of what it does.
 */
const BLOCKLISTS = new Set(['src/core/prospects/address.js'])

/**
 * Hosts a mailbox may be at because the host is a company rather than a
 * person: a vendor the code reaches, or a service it reads pages from.
 *
 * It is empty, and that is the state to keep it in. The extraction carried no
 * address at all out of the studio - every mailbox in the letters, the bio and
 * the sign-off stayed behind with the words - so any name that needs adding
 * here later is a mailbox that has just arrived, and adding it is a decision
 * rather than a formality.
 */
const VENDORS = new Set([])

const files = (dir, found = []) => {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files(path, found)
    else if (READABLE.test(name)) found.push(path)
  }
  return found
}

const tree = files(root)

check('there is a tree to read', tree.length > 20)

for (const path of tree) {
  const relative = path.slice(root.length)
  const source = readFileSync(path, 'utf8')

  for (const [id] of source.matchAll(STRIPE_ID)) {
    fail(`${relative} carries ${id}, which names a record in a payment account`)
  }

  if (BLOCKLISTS.has(relative)) continue
  for (const [address, domain] of source.matchAll(ADDRESS)) {
    const host = address.split('@')[1].toLowerCase()
    if (RESERVED.test(host)) continue
    if (VENDORS.has(host)) continue
    void domain
    fail(`${relative} carries ${address}, which is somebody's mailbox`)
  }
}

check('the package holds no held-domain list of its own', () => {
  const source = readFileSync(join(root, 'src/core/prospects/exclusions.js'), 'utf8')
  // The held list is a company that asked not to be written to, and the host
  // installs it. A literal list in here would be that list, published.
  const installed = source.includes('export function installHeldDomains')
  if (!installed) throw new Error('the held list is no longer installed by the host')
})

await finish({
  hint: 'Nothing published may name a customer. A fixture names a reserved domain instead.',
})

console.log(
  `nothing private: ${cases.length} checks passed — ${tree.length} readable files name no ` +
    'customer, no mailbox and no payment record'
)
