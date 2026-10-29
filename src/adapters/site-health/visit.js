/**
 * One visit to a site, bounded, and the source that walks a table of them.
 *
 * The visiting is separated from the judging next door because the two have
 * different jobs: the judging has to be right, and the visiting has to be
 * bounded. A sweep over a few hundred sites that waits on one of them is a
 * sweep that never finishes, and a run killed partway leaves a table half
 * re-checked with nothing saying which half.
 *
 * So every visit has a deadline of its own, the sweep has a deadline of its
 * own, and the sweep stops taking sites with one site's worth of time still in
 * hand rather than being killed at the ceiling. What it did not reach is still
 * in front of the next run.
 *
 * The handshake is read with Node's own TLS, because a certificate's expiry is
 * not in an HTTP answer and no third party is needed to see it. A site served
 * over plain HTTP has no handshake and no certificate to have expired, which
 * is a different thing from a certificate that has.
 */

import { faultOf, urgent } from './judge.js'

/** How long one visit may take. */
export const VISIT_TIMEOUT_MS = 10_000

/** How long one handshake may take. */
export const HANDSHAKE_TIMEOUT_MS = 8_000

/** What the sweep tells a site it is, so an owner reading a log knows who called. */
export const USER_AGENT =
  'Mozilla/5.0 (compatible; chainwork site check; +https://github.com/TaylorURL/chainwork)'

const hostOf = url => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname
  } catch {
    return null
  }
}

/**
 * When the certificate a host serves expires, read off the handshake.
 *
 * Answers null rather than throwing, because a host that will not shake hands
 * is a fact about the visit rather than an error in the sweep - and a site on
 * plain HTTP has no certificate at all, which `faultOf` treats as nothing
 * wrong rather than as something expired.
 *
 * @param {string} host
 * @param {{connect?: Function, timeout?: number}} [how] `connect` is Node's
 *   `tls.connect` unless a caller hands in its own, which is what lets this be
 *   exercised without a network.
 * @returns {Promise<{expiresAt: string, host: string}|null>}
 */
export async function certificateFor(
  host,
  { connect = null, timeout = HANDSHAKE_TIMEOUT_MS } = {}
) {
  const name = hostOf(host)
  if (!name) return null
  const open = connect ?? (await import('node:tls')).connect
  return new Promise(resolve => {
    let settled = false
    const done = answer => {
      if (settled) return
      settled = true
      resolve(answer)
    }
    let socket
    try {
      socket = open({ host: name, port: 443, servername: name, timeout }, () => {
        const cert = socket.getPeerCertificate?.()
        const until = cert?.valid_to ? Date.parse(cert.valid_to) : Number.NaN
        socket.destroy()
        done(
          Number.isFinite(until) ? { expiresAt: new Date(until).toISOString(), host: name } : null
        )
      })
    } catch {
      done(null)
      return
    }
    socket.on('error', () => {
      socket.destroy()
      done(null)
    })
    socket.on('timeout', () => {
      socket.destroy()
      done(null)
    })
  })
}

/**
 * One visit: what the home page answered, and what the handshake said.
 *
 * A redirect is followed, because a site that has moved is a site somebody is
 * looking after and the address it moved to is the one worth judging.
 *
 * @param {string} url
 * @param {{fetch?: Function, certificate?: Function, timeout?: number}} [how]
 * @returns {Promise<{status: number|null, error: string|null, certificate: object|null, url: string}>}
 */
export async function visit(
  url,
  { fetch: get = fetch, certificate = certificateFor, timeout = VISIT_TIMEOUT_MS } = {}
) {
  const address = /^https?:\/\//i.test(url) ? url : `https://${url}`
  const stop = AbortSignal.timeout(timeout)
  let status = null
  let error = null
  try {
    const answer = await get(address, {
      redirect: 'follow',
      signal: stop,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    })
    status = answer.status
  } catch (cause) {
    error = String(cause?.message ?? cause).slice(0, 200)
  }
  const cert = address.startsWith('https://') ? await certificate(address) : null
  return { status, error, certificate: cert, url: address }
}

/**
 * The source that re-checks sites already on file and files the broken ones.
 *
 * It takes the rows rather than reading them, so the host decides which table
 * they come from and in what order - and so a sweep of three hundred sites can
 * be walked through in a test with no network at all.
 *
 * @param {object} what
 * @param {string} [what.id] What the sweep records this source as.
 * @param {string} [what.source] What a filed row is filed under, which is what
 *   the broken-site chain claims.
 * @param {() => Promise<object[]>} what.rows Answers `{ id, website }` rows.
 * @param {object} [what.how] Handed to `visit`, which is where a test puts its
 *   own fetch and handshake.
 * @param {number} [what.budgetMs] How long the whole sweep may take.
 * @returns {{id: string, find: Function}} A source, as createSources takes one.
 */
export function siteHealthSource({
  id = 'broken-site',
  source = 'broken-site',
  rows,
  how = {},
  budgetMs = 240_000,
}) {
  if (typeof rows !== 'function') {
    throw new TypeError('siteHealthSource needs `rows`, which answers the sites to re-check')
  }
  return {
    id,
    async find(context = {}) {
      const now = context.now instanceof Date ? context.now : new Date()
      const began = Date.now()
      const found = []
      const sites = (await rows(context)) ?? []
      for (const site of sites) {
        // Stopped with one visit's worth of time still in hand, so the run
        // ends itself rather than being killed with the table half swept.
        if (Date.now() - began > budgetMs - VISIT_TIMEOUT_MS) break
        if (!site?.website) continue
        const seen = await visit(site.website, how)
        const fault = faultOf({ ...seen, now })
        if (!fault) continue
        found.push({
          source,
          // The row's own id, so the same site found next week is the same row
          // rather than a second one.
          ref: String(site.id ?? seen.url),
          payload: {
            website: seen.url,
            status: seen.status,
            fault: fault.fault,
            says: fault.says,
            fault_at: fault.at,
            fault_days: fault.days,
            urgent: urgent(fault),
            checked_at: now.toISOString(),
          },
        })
      }
      return found
    },
  }
}
