/**
 * What is wrong with a site, read off one visit to it.
 *
 * This is the first of the trigger-based chains, and the reason it is first is
 * that its signal is the strongest one available and the cheapest to get: an
 * expired certificate, a home page that errors, a domain about to lapse.
 * Nobody argues with a screenshot of their own expired certificate, and none
 * of it needs an account anywhere.
 *
 * The judging is here and the visiting is next door, because the judging is
 * what has to be right and the visiting is what has to be bounded. A fault is
 * a value this answers, so a whole table of sites can be judged in a test
 * without a network.
 *
 * ## What counts as a fault
 *
 * Only something the owner would recognise as broken, and only something that
 * is still broken now. A site that was slow last week is the audit's business;
 * a site that answers 500 today is this one's.
 *
 * A fault carries what the letter has to name - which it is, what the figure
 * is, and when it happened - because a letter about a named defect is the whole
 * difference between this chain and a generic score.
 *
 * ## What is deliberately not a fault
 *
 * A redirect is not a fault: a site moving to a new address is a site somebody
 * is looking after. A slow answer is not a fault either - a visit from one
 * machine at one moment says nothing a reader would accept - and neither is a
 * page that refuses a robot, because a site that blocks crawlers is a decision
 * rather than a fault. Each of those read as faults in the obvious version of
 * this and each would have produced a letter telling somebody their working
 * site was broken.
 */

/** How close to expiry a certificate has to be before it is worth a letter. */
export const CERT_WARNS_WITHIN_DAYS = 14

/** How close to expiry a domain has to be before it is worth a letter. */
export const DOMAIN_WARNS_WITHIN_DAYS = 60

/** The faults, in the order they are reported when a site has more than one. */
export const FAULTS = Object.freeze([
  'certificate-expired',
  'certificate-expiring',
  'server-error',
  'not-found',
  'unreachable',
  'domain-expiring',
])

const DAY_MS = 24 * 60 * 60 * 1000

const instantOf = value => {
  const at = value instanceof Date ? value.getTime() : Date.parse(value ?? '')
  return Number.isFinite(at) ? at : null
}

const daysBetween = (from, to) => Math.floor((to - from) / DAY_MS)

/**
 * A page that refuses a robot rather than being broken.
 *
 * A site behind a bot check answers 403 or 429 to anything that is not a
 * browser. Reading that as a fault would mean writing to the owner of a
 * working site to say it is down, which is the one letter on this chain that
 * would cost a reputation rather than an afternoon.
 */
const REFUSES_ROBOTS = new Set([401, 403, 405, 406, 429])

/**
 * What is wrong with one site, or null where nothing is.
 *
 * @param {object} visit
 * @param {number|null} visit.status What the home page answered, or null where
 *   nothing answered at all.
 * @param {string|null} [visit.error] Why nothing answered.
 * @param {{expiresAt?: string|Date|null, host?: string}|null} [visit.certificate]
 *   What the handshake said, or null where there was none - a site served over
 *   plain HTTP has no certificate to have expired.
 * @param {string|Date|null} [visit.domainExpiresAt] When the name lapses, where
 *   that is known.
 * @param {Date} visit.now
 * @returns {{fault: string, says: string, at: string|null, days: number|null}|null}
 */
export function faultOf({ status, error = null, certificate = null, domainExpiresAt = null, now }) {
  const at = instantOf(now)
  if (at === null) throw new TypeError('faultOf needs the moment it is being asked about')

  const certAt = instantOf(certificate?.expiresAt)
  if (certAt !== null) {
    if (certAt <= at) {
      return {
        fault: 'certificate-expired',
        says: `the security certificate expired ${daysBetween(certAt, at)} days ago`,
        at: new Date(certAt).toISOString(),
        days: -daysBetween(certAt, at),
      }
    }
    const left = daysBetween(at, certAt)
    if (left <= CERT_WARNS_WITHIN_DAYS) {
      return {
        fault: 'certificate-expiring',
        says: `the security certificate expires in ${left} days`,
        at: new Date(certAt).toISOString(),
        days: left,
      }
    }
  }

  if (status === null) {
    return {
      fault: 'unreachable',
      says: error ? `the site did not answer: ${error}` : 'the site did not answer',
      at: null,
      days: null,
    }
  }
  if (REFUSES_ROBOTS.has(status)) return null
  if (status >= 500) {
    return {
      fault: 'server-error',
      says: `the home page answers ${status}`,
      at: null,
      days: null,
    }
  }
  if (status === 404 || status === 410) {
    return {
      fault: 'not-found',
      says: `the home page answers ${status}`,
      at: null,
      days: null,
    }
  }

  const domainAt = instantOf(domainExpiresAt)
  if (domainAt !== null && domainAt > at) {
    const left = daysBetween(at, domainAt)
    if (left <= DOMAIN_WARNS_WITHIN_DAYS) {
      return {
        fault: 'domain-expiring',
        says: `the domain name lapses in ${left} days`,
        at: new Date(domainAt).toISOString(),
        days: left,
      }
    }
  }

  return null
}

/**
 * Whether a fault is one a letter should be written about straight away.
 *
 * An expired certificate and a home page that errors are what a customer is
 * meeting right now, so they do not wait. A certificate or a domain that is
 * about to lapse is a warning, which is worth a letter but not worth jumping
 * the queue for.
 */
export const urgent = fault =>
  ['certificate-expired', 'server-error', 'not-found'].includes(fault?.fault)
