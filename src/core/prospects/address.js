/**
 * Whether an address can be written to at all, decided before anything is.
 *
 * Outreach addresses are scraped off a stranger's website rather than typed in
 * by the person who owns them, so a share of them are wrong: a mailbox that
 * was closed years ago, a domain that has lapsed, a pattern lifted out of a
 * page that was never an address. Writing to one is a hard bounce, and a hard
 * bounce is charged against the sending domain rather than against the
 * message, which puts the newsletter and the client mail on the same reputation
 * as the guess that failed.
 *
 * Three questions are asked in order, cheapest first. The shape of the address:
 * whether it parses, whether the mailbox is one that reaches a person rather
 * than a machine or a department, whether the domain is a throwaway, belongs
 * to a platform rather than to the business, or has been held off outreach by
 * hand. Then the domain's mail servers, which is the only one that costs a
 * network round trip and the only one that settles whether mail can be
 * delivered there at all.
 *
 * A check answers with one of three verdicts, and the third is what keeps a
 * real business from being written off by a bad afternoon on a resolver. A
 * domain that answers with no mail server is 'undeliverable' and stops being a
 * prospect. A resolver that times out is 'unknown': nothing is sent, nothing is
 * concluded, and the address is asked about again on the next run.
 *
 * Results are held in two places so a domain is resolved once rather than once
 * per address. The process map covers a single invocation, where the same
 * domain is asked about twice for every message: once before the draft is
 * written and again in front of the transport. The `outreach_domains` table
 * covers the next invocation, which on a serverless deployment is a fresh
 * process with an empty map, and the day's runs share their readings through
 * it.
 */

import { Resolver } from 'node:dns/promises'
import { hostOf, platformOf } from './platforms.js'
import { heldDomainOf } from './exclusions.js'

/** The longest address any mail server accepts, from RFC 5321. */
const ADDRESS_MAX = 254

/**
 * Mailboxes that reach nobody. A machine sends from these and nothing arrives
 * at one, so an address at a business's real domain can still be a dead end.
 */
const UNREACHABLE_BOXES = new Set([
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'postmaster',
  'mailer-daemon',
  'abuse',
  'bounce',
  'bounces',
  'unsubscribe',
  'root',
])

/**
 * Mailboxes that reach a department rather than a person.
 *
 * Sales, support and the front desk are read by whoever is on shift. That is a
 * reason to prefer a name where the site prints one, and it is not a reason to
 * refuse the address: at the size of business this writes to the shift and the
 * owner are usually the same person. So these are ranked rather than held out,
 * and a site that prints nothing but a department has an address after all.
 *
 * A box is read by its parts, split on dots, dashes and underscores and
 * compared whole, so 'dispatch.corpuschristi' is dispatch and
 * 'csi-customer-service' is customer service. A box with no separators is
 * compared against its opening as well, which is how 'serviceusa' and
 * 'salesteam' read; the stems are long enough that no first name opens with
 * one.
 */
const DEPARTMENT_BOXES = new Set([
  'admin',
  'administrator',
  'administration',
  'admissions',
  'accounting',
  'accounts',
  'ap',
  'appointments',
  'ar',
  'assist',
  'assistant',
  'bids',
  'billing',
  'bookings',
  'business',
  'careers',
  'claims',
  'collections',
  'company',
  'compliance',
  'complaints',
  'construction',
  'contracts',
  'corporate',
  'credit',
  'customercare',
  'customerservice',
  'design',
  'dispatch',
  'dispatcher',
  'donations',
  'employment',
  'engineering',
  'enrollment',
  'estimates',
  'estimating',
  'events',
  'facilities',
  'feedback',
  'finance',
  'fleet',
  'frontdesk',
  'help',
  'helpdesk',
  'hostmaster',
  'hr',
  'hse',
  'humanresources',
  'intake',
  'invoices',
  'ir',
  'it',
  'jobs',
  'leasing',
  'legal',
  'logistics',
  'maintenance',
  'marketing',
  'media',
  'membership',
  'news',
  'newsletter',
  'operations',
  'ops',
  'orders',
  'parts',
  'payroll',
  'pr',
  'press',
  'privacy',
  'procurement',
  'projects',
  'proposals',
  'purchasing',
  'qa',
  'qc',
  'quality',
  'quotes',
  'receiving',
  'reception',
  'recruiting',
  'referrals',
  'registrar',
  'rentals',
  'reservations',
  'retail',
  'returns',
  'safety',
  'sales',
  'scheduling',
  'secretary',
  'security',
  'service',
  'services',
  'shipping',
  'staff',
  'support',
  'team',
  'tech',
  'techsupport',
  'training',
  'volunteer',
  'volunteers',
  'warranty',
  'webmaster',
  'wholesale',
])

/** How a department box opens when it is written without a separator. */
const DEPARTMENT_STEMS = [
  'accounting',
  'accounts',
  'appointment',
  'billing',
  'booking',
  'careers',
  'customer',
  'dispatch',
  'estimat',
  'frontdesk',
  'helpdesk',
  'invoice',
  'marketing',
  'newsletter',
  'orders',
  'patient',
  'payroll',
  'purchasing',
  'quotes',
  'reception',
  'recruit',
  'reserv',
  'sales',
  'schedul',
  'service',
  'support',
  'techsupport',
  'warranty',
  'webmaster',
]

/**
 * Mailboxes a business publishes for anybody to write to. Whoever reads one
 * reads it as the shop's mail rather than their own, and a message meant for
 * the person who decides is not sent to a box that everybody opens, so these
 * are refused the same way a department's is.
 */
const GENERAL_BOXES = new Set([
  'info',
  'hello',
  'contact',
  'contactus',
  'office',
  'mail',
  'email',
  'enquiries',
  'enquiry',
  'inquiries',
  'inquiry',
  'general',
])

/**
 * Who a mailbox reaches: 'unreachable' for a machine, 'department' for a desk,
 * 'general' for the business's open inbox, and 'person' for everything else,
 * which is where a name lands. Only the machine is refused; the other three
 * are written to, in that order of preference.
 *
 * @param {string} box The part before the at sign, in any casing.
 * @returns {'unreachable'|'department'|'general'|'person'}
 */
export function mailboxKind(box) {
  const value = String(box ?? '')
    .trim()
    .toLowerCase()
  if (UNREACHABLE_BOXES.has(value)) return 'unreachable'

  const parts = value.split(/[._-]+/).filter(Boolean)
  if (parts.some(part => DEPARTMENT_BOXES.has(part))) return 'department'
  if (DEPARTMENT_STEMS.some(stem => value.startsWith(stem))) return 'department'
  if (parts.some(part => GENERAL_BOXES.has(part))) return 'general'
  return 'person'
}

/**
 * Domains handing out mailboxes that are thrown away within the hour.
 *
 * A business does not publish one of these, so an address at one came from a
 * form-filler or a scraped comment rather than from the company. The list is
 * the handful that turn up in practice; it is a filter on obvious rubbish and
 * not a register of every such service.
 */
export const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'discard.email',
  'dispostable.com',
  'fakeinbox.com',
  'getairmail.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mintemail.com',
  'mohmal.com',
  'sharklasers.com',
  'spam4.me',
  'temp-mail.org',
  'tempmail.com',
  'tempmailo.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
  'yopmail.fr',
])

/**
 * The address shape a mail server will route. Deliberately close to the one
 * the console and the contact form already hold each other to, with the
 * addition that a domain must carry a label after its last dot.
 */
const SHAPE = /^[^\s@]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

/** A domain whose last label is letters, which every mail-carrying suffix is. */
const TLD = /\.[a-z]{2,}$/

/** How long a settled domain reading stands before it is taken again. */
const SETTLED_MS = 30 * 24 * 60 * 60 * 1000
/** How long an unsettled one stands, which is short enough to retry the same day. */
const UNSETTLED_MS = 60 * 60 * 1000
/** How long one resolver query is given, and how many times it is asked. */
const DNS_TIMEOUT_MS = 4000
const DNS_TRIES = 2

/** The refusal raised when a message is handed an address that may not be written to. */
export class Undeliverable extends Error {
  constructor(address, check) {
    super(`${address} did not pass verification: ${check.reason}`)
    this.name = 'Undeliverable'
    this.address = address
    this.verdict = check.verdict
    this.reason = check.reason
  }
}

/** Domain readings taken by this process, which is one invocation's worth. */
const seen = new Map()

/** Drops the process cache, so a check is taken again from scratch. */
export function forgetDomains() {
  seen.clear()
}

/** The address as it is compared and stored: trimmed, lowercased. */
export function normalise(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/** The part after the at sign, or an empty string where there is not one. */
export function domainOf(address) {
  const at = normalise(address).lastIndexOf('@')
  return at === -1 ? '' : normalise(address).slice(at + 1)
}

/** The part before the at sign, with any plus-tag dropped. */
function mailboxOf(address) {
  const at = normalise(address).lastIndexOf('@')
  const box = at === -1 ? '' : normalise(address).slice(0, at)
  const plus = box.indexOf('+')
  return plus === -1 ? box : box.slice(0, plus)
}

/**
 * Everything that can be decided about an address without asking the network.
 *
 * Answers null when nothing here refuses it, which is what lets the caller read
 * a returned object as a refusal.
 *
 * @param {string} value An address, in any casing.
 * @returns {{verdict: string, reason: string}|null}
 */
export function shapeOf(value) {
  const address = normalise(value)
  const refuse = reason => ({ verdict: 'undeliverable', reason })

  if (!address || address.length > ADDRESS_MAX) return refuse('malformed')
  if (!SHAPE.test(address)) return refuse('malformed')

  const domain = domainOf(address)
  if (!TLD.test(domain)) return refuse('malformed')
  if (domain.includes('..')) return refuse('malformed')

  const kind = mailboxKind(mailboxOf(address))
  if (kind === 'unreachable') return refuse('role_box')
  if (DISPOSABLE_DOMAINS.has(domain)) return refuse('disposable')

  // An address at a booking platform, a directory or a delivery service
  // belongs to that company's support desk rather than to the business the
  // listing is about, and writing to it is writing to the wrong company.
  if (platformOf(hostOf(`https://${domain}`))) return refuse('platform')

  // A domain a person has held off outreach is refused here, in front of the
  // queue and the transport both, so no mailbox at it is written to however
  // it was found.
  if (heldDomainOf(domain)) return refuse('held_domain')

  // A department's box is written to. At the size of business this writes to,
  // sales@ and admin@ and the owner are usually the same person reading the
  // same inbox, and holding out for a published name discards most of the
  // trade sites on the map: they print one address, and it is that one.
  //
  // Only a machine's box is refused on its name, above, because nobody reads
  // it at all. Everything a person could open is written to, and which of them
  // is preferred where a site prints several is the enricher's decision rather
  // than a refusal here: `mailboxKind` still tells them apart, and
  // api/outreach/enrich.js takes a name over an open inbox over a desk.
  return null
}

/** Whether a stored reading is still current, by verdict and by age. */
function fresh(row, now) {
  if (!row?.checked_at) return false
  const age = now - new Date(row.checked_at).getTime()
  return age < (row.verdict === 'unknown' ? UNSETTLED_MS : SETTLED_MS)
}

let resolver = null

/** The resolver, built once per process and bounded so a query cannot hang. */
function dns() {
  if (!resolver) resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: DNS_TRIES })
  return resolver
}

/**
 * Whether a domain has a mail server, asked of DNS.
 *
 * A name that does not exist and a name with no mail server are both settled
 * answers, and neither can receive mail. Everything else a resolver says is a
 * resolver having a bad moment, which is not a fact about the domain.
 *
 * @param {string} domain
 * @param {(name: string) => Promise<object[]>} [resolveMx] The lookup to use.
 * @returns {Promise<{verdict: string, reason: string|null}>}
 */
export async function mxFor(domain, resolveMx) {
  const lookup = resolveMx ?? (name => dns().resolveMx(name))
  try {
    const records = await lookup(domain)
    const usable = (records ?? []).filter(record => String(record?.exchange ?? '').trim())
    if (!usable.length) return { verdict: 'undeliverable', reason: 'no_mx' }
    return { verdict: 'deliverable', reason: null }
  } catch (cause) {
    const code = cause?.code || ''
    if (code === 'ENOTFOUND' || code === 'ENOENT' || code === 'NXDOMAIN') {
      return { verdict: 'undeliverable', reason: 'no_domain' }
    }
    if (code === 'ENODATA') return { verdict: 'undeliverable', reason: 'no_mx' }
    return { verdict: 'unknown', reason: 'dns_unavailable' }
  }
}

/** The stored reading for a domain, or null where there is not a current one. */
async function storedFor(db, domain, now) {
  if (!db) return null
  const { data, error } = await db
    .from('outreach_domains')
    .select('domain, verdict, reason, checked_at')
    .eq('domain', domain)
    .maybeSingle()
  // A cache that cannot be read is a slower check rather than a failed one.
  if (error) return null
  return fresh(data, now) ? data : null
}

/** Files a domain reading so the next invocation does not resolve it again. */
async function store(db, domain, result, now) {
  if (!db) return
  const { error } = await db.from('outreach_domains').upsert(
    {
      domain,
      verdict: result.verdict,
      reason: result.reason,
      checked_at: new Date(now).toISOString(),
    },
    { onConflict: 'domain' }
  )
  if (error) console.error('outreach address: caching %s: %s', domain, error.message)
}

/**
 * Whether one address may be written to.
 *
 * The shape is settled first and costs nothing, so a mailbox that reaches
 * nobody never becomes a DNS query. The domain reading is taken once and shared
 * by every address at it, from the process map where this invocation has
 * already asked and from `outreach_domains` where an earlier one did.
 *
 * @param {object|null} db A service-role client, or null to check without a cache.
 * @param {string} value The address, in any casing.
 * @param {object} [options]
 * @param {number} [options.now] The instant readings are aged against.
 * @param {(name: string) => Promise<object[]>} [options.resolveMx] The lookup to use.
 * @returns {Promise<{verdict: string, reason: string|null, domain: string}>}
 */
export async function checkAddress(db, value, options = {}) {
  const now = options.now ?? Date.now()
  const address = normalise(value)
  const domain = domainOf(address)

  const shape = shapeOf(address)
  if (shape) return { ...shape, domain }

  const held = seen.get(domain)
  if (held && now - held.at < (held.verdict === 'unknown' ? UNSETTLED_MS : SETTLED_MS)) {
    return { verdict: held.verdict, reason: held.reason, domain }
  }

  const stored = await storedFor(db, domain, now)
  if (stored) {
    seen.set(domain, { verdict: stored.verdict, reason: stored.reason, at: now })
    return { verdict: stored.verdict, reason: stored.reason, domain }
  }

  const result = await mxFor(domain, options.resolveMx)
  seen.set(domain, { verdict: result.verdict, reason: result.reason, at: now })
  await store(db, domain, result, now)
  return { ...result, domain }
}

/**
 * The same check, raising rather than answering.
 *
 * This is what stands in front of the transport. A send path that calls it
 * first cannot write to an address that has not passed, whatever the caller
 * did or did not do beforehand.
 *
 * @throws {Undeliverable} When the address is refused or cannot be settled.
 */
export async function assertDeliverable(db, value, options = {}) {
  const check = await checkAddress(db, value, options)
  if (check.verdict !== 'deliverable') throw new Undeliverable(normalise(value), check)
  return check
}
