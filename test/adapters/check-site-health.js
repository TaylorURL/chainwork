/**
 * What the broken-site chain fires on.
 *
 * The checks that matter are the ones about what is *not* a fault. The obvious
 * version of this reads a redirect, a slow answer and a page that refuses a
 * robot as sites being down, and each of those would produce a letter telling
 * somebody their working site was broken - which is the one letter on this
 * chain that costs a reputation rather than an afternoon.
 */

import {
  CERT_WARNS_WITHIN_DAYS,
  DOMAIN_WARNS_WITHIN_DAYS,
  faultOf,
  urgent,
} from '../../src/adapters/site-health/judge.js'
import { certificateFor, siteHealthSource, visit } from '../../src/adapters/site-health/visit.js'
import { createSources, sweep } from '../../src/engine/sources.js'
import { cases, check, finish, ok, refusal, same } from '../harness/checks.js'

const NOW = new Date('2026-10-28T12:00:00Z')
const day = n => new Date(Date.UTC(2026, 9, n, 12, 0, 0)).toISOString()

// ── What is a fault ─────────────────────────────────────────────────────

check('an expired certificate is a fault, and says how long ago', () => {
  const fault = faultOf({ status: 200, certificate: { expiresAt: day(1) }, now: NOW })
  same(fault.fault, 'certificate-expired', 'the fault')
  same(fault.says, 'the security certificate expired 27 days ago', 'what it says')
  same(fault.days, -27, 'the days')
})

check('a certificate about to expire is a fault, and says how long is left', () => {
  const soon = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const fault = faultOf({ status: 200, certificate: { expiresAt: soon }, now: NOW })
  same(fault.fault, 'certificate-expiring', 'the fault')
  same(fault.days, 7, 'the days')
})

check('a certificate with longer left than the warning is no fault', () => {
  const later = new Date(
    NOW.getTime() + (CERT_WARNS_WITHIN_DAYS + 5) * 24 * 60 * 60 * 1000
  ).toISOString()
  same(faultOf({ status: 200, certificate: { expiresAt: later }, now: NOW }), null, 'the fault')
})

check('a home page that errors is a fault', () => {
  same(faultOf({ status: 500, now: NOW }).fault, 'server-error', '500')
  same(faultOf({ status: 503, now: NOW }).fault, 'server-error', '503')
})

check('a home page that is gone is a fault', () => {
  same(faultOf({ status: 404, now: NOW }).fault, 'not-found', '404')
  same(faultOf({ status: 410, now: NOW }).fault, 'not-found', '410')
})

check('a site that did not answer at all is a fault, and says what happened', () => {
  const fault = faultOf({ status: null, error: 'getaddrinfo ENOTFOUND', now: NOW })
  same(fault.fault, 'unreachable', 'the fault')
  ok(fault.says.includes('ENOTFOUND'), `it says ${JSON.stringify(fault.says)}`)
})

check('a domain about to lapse is a fault', () => {
  const soon = new Date(NOW.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString()
  const fault = faultOf({ status: 200, domainExpiresAt: soon, now: NOW })
  same(fault.fault, 'domain-expiring', 'the fault')
  same(fault.days, 20, 'the days')
})

check('a domain with longer left than the warning is no fault', () => {
  const later = new Date(
    NOW.getTime() + (DOMAIN_WARNS_WITHIN_DAYS + 10) * 24 * 60 * 60 * 1000
  ).toISOString()
  same(faultOf({ status: 200, domainExpiresAt: later, now: NOW }), null, 'the fault')
})

// ── What is deliberately not a fault ────────────────────────────────────

check('a working site is no fault', () =>
  same(faultOf({ status: 200, now: NOW }), null, 'the fault')
)

check('a page that refuses a robot is no fault', () => {
  for (const status of [401, 403, 405, 406, 429]) {
    same(faultOf({ status, now: NOW }), null, `${status}`)
  }
})

check('a site with no certificate at all is no fault', () =>
  same(faultOf({ status: 200, certificate: null, now: NOW }), null, 'the fault')
)

check('a redirect is no fault, since it is followed before it is judged', () =>
  same(faultOf({ status: 200, now: NOW }), null, 'the fault')
)

check('a certificate that refuses a robot is still judged on the certificate', () => {
  // The order matters: a site behind a bot check with an expired certificate is
  // broken, and reading the status first would have passed it as healthy.
  const fault = faultOf({ status: 403, certificate: { expiresAt: day(1) }, now: NOW })
  same(fault.fault, 'certificate-expired', 'the fault')
})

check('faultOf refuses to work without the moment it is asked about', async () =>
  ok(await refusal(() => faultOf({ status: 500 })), 'it answered anyway')
)

// ── Which faults jump the queue ─────────────────────────────────────────

check('what a customer is meeting now does not wait', () => {
  same(urgent({ fault: 'certificate-expired' }), true, 'an expired certificate')
  same(urgent({ fault: 'server-error' }), true, 'a page that errors')
  same(urgent({ fault: 'not-found' }), true, 'a page that is gone')
})

check('a warning is worth a letter but does not jump the queue', () => {
  same(urgent({ fault: 'certificate-expiring' }), false, 'a certificate about to expire')
  same(urgent({ fault: 'domain-expiring' }), false, 'a domain about to lapse')
  same(urgent(null), false, 'nothing wrong')
})

// ── A visit ─────────────────────────────────────────────────────────────

check('a visit reads the status and the handshake', async () => {
  const seen = await visit('example.test', {
    fetch: async () => ({ status: 200 }),
    certificate: async () => ({ expiresAt: day(1), host: 'example.test' }),
  })
  same(seen.status, 200, 'the status')
  same(seen.url, 'https://example.test', 'the address')
  same(seen.certificate.expiresAt, day(1), 'the certificate')
})

check('a visit that throws is a visit with no status, not a run that failed', async () => {
  const seen = await visit('example.test', {
    fetch: async () => {
      throw new Error('socket hang up')
    },
    certificate: async () => null,
  })
  same(seen.status, null, 'the status')
  ok(seen.error.includes('socket hang up'), `it recorded ${JSON.stringify(seen.error)}`)
})

check('a site on plain HTTP is not asked for a handshake', async () => {
  let asked = false
  const seen = await visit('http://example.test', {
    fetch: async () => ({ status: 200 }),
    certificate: async () => {
      asked = true
      return null
    },
  })
  same(asked, false, 'whether a handshake was asked for')
  same(seen.certificate, null, 'the certificate')
})

check('a handshake that will not open answers nothing rather than throwing', async () => {
  const answer = await certificateFor('example.test', {
    connect: () => {
      throw new Error('ECONNREFUSED')
    },
  })
  same(answer, null, 'the certificate')
})

check('a host that does not read as one is not dialled', async () =>
  same(
    await certificateFor('   ', {
      connect: () => {
        throw new Error('should not be dialled')
      },
    }),
    null,
    'the certificate'
  )
)

// ── The source ──────────────────────────────────────────────────────────

const sites = [
  { id: 'broken', website: 'broken.test' },
  { id: 'fine', website: 'fine.test' },
  { id: 'gone', website: 'gone.test' },
  { id: 'nothing', website: null },
]

const how = {
  fetch: async url => ({ status: url.includes('gone') ? 404 : 200 }),
  certificate: async url =>
    url.includes('broken') ? { expiresAt: day(1) } : { expiresAt: day(90) },
}

check('the source files only the sites that are actually broken', async () => {
  const source = siteHealthSource({ rows: async () => sites, how })
  const found = await source.find({ now: NOW })
  same(found.map(one => one.ref).join(' '), 'broken gone', 'the sites filed')
})

check('a filed row carries what the letter has to name', async () => {
  const source = siteHealthSource({ rows: async () => sites, how })
  const [first] = await source.find({ now: NOW })
  same(first.source, 'broken-site', 'the source')
  same(first.payload.fault, 'certificate-expired', 'the fault')
  same(first.payload.urgent, true, 'whether it waits')
  ok(first.payload.says.includes('expired'), `it says ${JSON.stringify(first.payload.says)}`)
  same(first.payload.checked_at, NOW.toISOString(), 'when it was checked')
})

check('a row is filed under its own id, so next week it is the same row', async () => {
  const source = siteHealthSource({ rows: async () => sites, how })
  const once = await source.find({ now: NOW })
  const twice = await source.find({ now: NOW })
  same(once.map(one => one.ref).join(' '), twice.map(one => one.ref).join(' '), 'the refs')
})

check('the source plugs into a sweep like any other', async () => {
  const sources = createSources([siteHealthSource({ rows: async () => sites, how })])
  const swept = await sweep({ sources, context: { now: NOW } })
  same(swept.found.length, 2, 'the rows')
  same(swept.ran[0].error, null, 'the error')
  same(swept.ran[0].found, 2, 'what it found')
})

check('the source needs to be told where its sites come from', async () =>
  ok(await refusal(() => siteHealthSource({})), 'it was built with no rows')
)

check('a sweep stops with a visit’s worth of time in hand rather than being killed', async () => {
  const many = Array.from({ length: 50 }, (_, n) => ({ id: `s${n}`, website: `s${n}.test` }))
  const slow = {
    fetch: async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      return { status: 500 }
    },
    certificate: async () => null,
  }
  const source = siteHealthSource({ rows: async () => many, how: slow, budgetMs: 10_100 })
  const began = Date.now()
  const found = await source.find({ now: NOW })
  ok(found.length < many.length, `it visited all ${many.length} rather than stopping short`)
  ok(Date.now() - began < 2000, 'it ran past its own budget')
})

await finish({ hint: 'src/adapters/site-health judges a site; the chain writes the letter.' })

console.log(`site health: ${cases.length} checks passed`)
