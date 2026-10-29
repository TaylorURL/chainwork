/**
 * The addresses a cold letter may leave from, and which one a letter takes.
 *
 * Every cold letter used to leave from one address, and Google judges the
 * domain on a letter's From line and its DKIM signature, so one domain carried
 * every letter's reputation. A domain Google has started rejecting letters
 * from stays rejected while it keeps sending. So there are several, and each
 * letter asks `pickSender` which of them it goes from.
 *
 * An address is either a mailbox of its own or an alias on the studio's
 * Workspace user. A mailbox of its own logs in as itself, with the app password
 * the deployment holds for it under `loginKeyOf(address)`, and so carries its
 * own Gmail sending limit and its own outbound filter; api/outreach/watch.js
 * reads its inbox beside the studio's. An address with no password of its own
 * is an alias, sent under the studio's login and sharing its limit. Either way
 * the From line, the links a letter carries, how many letters it may send in
 * a day and whether it is sending at all are per address. A mailbox of its own
 * may instead send through the Workspace relay; see RELAY.
 *
 * The first address is the one `outreach_settings` names, as it always was.
 * The rest are set on the deployment, so an alias goes live once Google is
 * signing for it and not before:
 *
 *   OUTREACH_SENDERS  Entries split by `;`, each `address|from name|YYYY-MM-DD`,
 *                     the date being the day the address started sending.
 *                     `resting` in place of the date keeps an address on the
 *                     roster for the threads it began and sends no first
 *                     letter from it. An entry naming the first address
 *                     sets its name and day in place of the row's.
 *
 * A letter's choice is settled in this order:
 *
 *   1. A business keeps the address that first wrote to it, so a follow-up
 *      threads under the letter it follows and a reply lands where it is read.
 *      That is the caller's to hold; only a first letter is picked here.
 *   2. An address whose letters bounce is skipped. Over the trailing week, more
 *      than SENDER_BOUNCE_MAX per cent of its letters coming back as hard
 *      bounces or as Google refusing them on the way out - rests it until the
 *      week behind it is clean again.
 *   3. An address keeps to its own day. A new one warms up on WARM_UP, a figure
 *      a week, and the first one sends SENDER_DAILY a day from the start.
 *   4. A business near Baytown is written to from a Baytown name first, and
 *      everybody else from the others, while the preferred ones have room.
 *      Between two that fit equally, the one with more room left goes.
 *
 * Nothing open means nothing is sent, and the letter waits in the queue the
 * way it waits when the mailbox rests.
 */

import { readAll } from '../rows.js'
import { localDay } from './schedule.js'

/** The most letters an address sends a day once it is warm. */
export const SENDER_DAILY = 30

/** A new address's day, by the week it is in, counted from the first. */
export const WARM_UP = [10, 15, 20, SENDER_DAILY]

/** Days an address's health is read over. */
export const SENDER_HEALTH_DAYS = 7

/** The bounce rate, per cent, above which an address rests. */
export const SENDER_BOUNCE_MAX = 5

/**
 * The fewest letters a week's rate is judged on. Two bounces out of ten is a
 * fifth of a small number, and resting an address on it would rest every new
 * one in its first week.
 */
export const SENDER_HEALTH_MIN_SENT = 20

/** Towns whose businesses are written to from a Baytown name first. */
export const BAYTOWN_AREA = [
  'baytown',
  'mont belvieu',
  'highlands',
  'channelview',
  'crosby',
  'la porte',
]

/**
 * What an OUTREACH_SENDERS entry says after its date for a mailbox of its own
 * that sends through the Workspace SMTP relay, under the studio's login, rather
 * than logging in with a password of its own. Google counts its letters
 * against the mailbox on the From line, so it keeps its own limit, and the
 * Workspace routes a copy of its post to the studio's inbox, which is where
 * api/outreach/watch.js reads it.
 */
export const RELAY = 'relay'

/** What OUTREACH_SENDERS says in place of a date for an address set to rest. */
export const RESTING = 'resting'

const DAY_MS = 24 * 60 * 60 * 1000

const domainOf = address => String(address).split('@')[1]?.toLowerCase() ?? ''

/**
 * The deployment's added addresses, read from OUTREACH_SENDERS.
 *
 * An entry that does not read as an address, a name and a date is left out
 * rather than guessed at, since a guessed sender is a letter from somewhere
 * Google is not signing for.
 *
 * @param {string} [value]
 * @returns {{address: string, name: string, since: string}[]}
 */
export function sendersOf(value = process.env.OUTREACH_SENDERS || '') {
  return value
    .split(';')
    .map(entry => entry.split('|').map(part => part.trim()))
    .filter(
      ([address, name, since]) =>
        /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address ?? '') &&
        Boolean(name) &&
        (/^\d{4}-\d{2}-\d{2}$/.test(since ?? '') || since === RESTING)
    )
    .map(([address, name, since, how]) => ({
      address: address.toLowerCase(),
      name,
      since,
      ...(how === RELAY ? { relay: true } : {}),
    }))
}

/**
 * The deployment variable holding an address's own app password:
 * OUTREACH_SMTP_PASSWORD_ and the address's domain, upper-cased, with every
 * character that is not a letter or a digit written as an underscore.
 */
export const loginKeyOf = address =>
  `OUTREACH_SMTP_PASSWORD_${domainOf(address)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')}`

/**
 * The login an address sends under when it is a mailbox of its own, or null
 * when it is an alias on the studio's.
 *
 * @returns {{user: string, pass: string}|null}
 */
export function loginOf(address, env = process.env) {
  const pass = env[loginKeyOf(address)]
  return pass ? { user: String(address).toLowerCase(), pass } : null
}

/**
 * The logins of every added address that is a mailbox of its own, which are the
 * inboxes beside the studio's that replies and bounces arrive in.
 */
export function ownLogins(value = process.env.OUTREACH_SENDERS || '', env = process.env) {
  return sendersOf(value)
    .map(one => loginOf(one.address, env))
    .filter(Boolean)
}

/**
 * Whether any added address sends on its own, by a login of its own or the
 * relay, and is not set to rest; such an address can carry a first letter
 * while the studio's mailbox rests.
 */
export function hasOwnSenders(value = process.env.OUTREACH_SENDERS || '', env = process.env) {
  return sendersOf(value).some(
    one => one.since !== RESTING && (one.relay || loginOf(one.address, env))
  )
}

/**
 * Whether a domain reads as a Baytown name, which is what a business near
 * Baytown is written to from first.
 */
const baytownName = domain => domain.startsWith('baytown')

/**
 * What an address may send on a given day.
 *
 * @param {string|null} since The day it started, or null for the first address.
 * @param {Date} now
 */
export function dailyFor(since, now = new Date()) {
  if (since === RESTING) return 0
  if (!since) return SENDER_DAILY
  const started = Date.parse(`${since}T12:00:00Z`)
  const today = Date.parse(`${localDay(now).date}T12:00:00Z`)
  if (Number.isNaN(started) || today < started) return 0
  const week = Math.floor((today - started) / (7 * DAY_MS))
  return WARM_UP[Math.min(week, WARM_UP.length - 1)]
}

/**
 * Every address a letter may leave from, before anything is read about them.
 *
 * @param {object} settings The `outreach_settings` row.
 * @param {{primary: string, origin: string}} fallback The mail login, which is
 *   the first address where the row names none, and the link host it uses.
 */
export function rosterOf(settings, { primary, origin }, value) {
  const first = String(settings.from_address || primary || '').toLowerCase()
  const roster = []
  if (first) {
    roster.push({
      address: first,
      name: settings.from_name || 'TaylorURL',
      domain: domainOf(first),
      origin,
      since: null,
    })
  }
  for (const added of sendersOf(value)) {
    const known = roster.find(one => one.address === added.address)
    if (known) {
      Object.assign(known, { name: added.name, since: added.since })
      continue
    }
    roster.push({
      ...added,
      domain: domainOf(added.address),
      origin: `https://${domainOf(added.address)}`,
      login: added.relay ? null : loginOf(added.address),
    })
  }
  return roster
}

/**
 * The trailing week of each address: letters sent, bounced, and sent today.
 *
 * A bounce is counted against the address the business was last written from
 * inside the week, which is the letter the notice is about. A business that
 * bounces twice bounces once. A refusal at source - Google declining to carry
 * the letter, filed by api/outreach/watch.js as a failed notice - is counted
 * against the address it was sent to, which is the address the letter left
 * from, and as a letter sent as well, since watch.js takes the letter itself
 * back as failed.
 *
 * @param {object} db A service-role client.
 * @param {Date} now
 * @returns {Promise<Map<string, {sent: number, bounced: number, today: number}>>}
 */
export async function senderRecord(db, now = new Date()) {
  const from = new Date(now.getTime() - SENDER_HEALTH_DAYS * DAY_MS).toISOString()
  const today = localDay(now).date
  const sent = await readAll(() =>
    db
      .from('outreach_messages')
      .select('prospect_id, from_address, sent_at, step')
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .gte('sent_at', from)
      .order('sent_at', { ascending: true })
  )
  const notices = await readAll(() =>
    db
      .from('outreach_messages')
      .select('prospect_id')
      .eq('direction', 'inbound')
      .eq('status', 'bounced')
      .gte('created_at', from)
      .order('id')
  )

  const refusals = await readAll(() =>
    db
      .from('outreach_messages')
      .select('to_address')
      .eq('direction', 'inbound')
      .eq('status', 'failed')
      .gte('created_at', from)
      .order('id')
  )

  const record = new Map()
  const entry = address => {
    if (!record.has(address)) record.set(address, { sent: 0, bounced: 0, today: 0 })
    return record.get(address)
  }
  const lastFrom = new Map()
  for (const row of sent.rows) {
    const address = String(row.from_address ?? '').toLowerCase()
    if (!address) continue
    const one = entry(address)
    one.sent += 1
    // The day's count is of first letters, as the day's cap is.
    if ((row.step ?? 1) === 1 && localDay(new Date(row.sent_at)).date === today) one.today += 1
    lastFrom.set(row.prospect_id, address)
  }
  const bounced = new Set()
  for (const row of notices.rows) {
    const address = lastFrom.get(row.prospect_id)
    if (!address || bounced.has(row.prospect_id)) continue
    bounced.add(row.prospect_id)
    entry(address).bounced += 1
  }
  for (const row of refusals.rows) {
    const address = String(row.to_address ?? '').toLowerCase()
    if (!address) continue
    const one = entry(address)
    one.sent += 1
    one.bounced += 1
  }
  return record
}

/**
 * Whether an address is resting on its week, and why.
 *
 * @returns {string|null} The reason, or null when it may send.
 */
export function restOf({ sent, bounced }) {
  if (sent < SENDER_HEALTH_MIN_SENT) return null
  const rate = (bounced / sent) * 100
  return rate > SENDER_BOUNCE_MAX
    ? `${bounced} of ${sent} letters bounced in the last ${SENDER_HEALTH_DAYS} days (${rate.toFixed(1)}%)`
    : null
}

/**
 * The roster as it stands right now, with each address's room for the day.
 *
 * @returns {Promise<{senders: object[], capacity: number}>} `capacity` is the
 *   day's letters across every open address, which bounds the day's cap.
 */
export async function readSenders(db, settings, fallback, now = new Date(), value) {
  const record = await senderRecord(db, now)
  const senders = rosterOf(settings, fallback, value).map(one => {
    const week = record.get(one.address) ?? { sent: 0, bounced: 0, today: 0 }
    const daily = dailyFor(one.since, now)
    const rest = one.since === RESTING ? 'set to rest on the deployment' : restOf(week)
    return {
      ...one,
      daily,
      week,
      today: week.today,
      rest,
      open: !rest && daily > 0,
    }
  })
  const capacity = senders
    .filter(one => one.open)
    .reduce((sum, one) => sum + Math.max(one.daily - one.today, 0), 0)
  return { senders, capacity }
}

/**
 * The address a first letter to one business leaves from.
 *
 * @param {object[]} senders `readSenders(...).senders`, whose `today` this
 *   reads; the caller counts a sent letter onto it with `noteSent`.
 * @param {object} prospect Row from `outreach_prospects`.
 * @returns {object|null} The sender, or null when none has room.
 */
export function pickSender(senders, prospect) {
  const room = one => one.daily - one.today
  const open = senders.filter(one => one.open && room(one) > 0)
  if (!open.length) return null
  const near = BAYTOWN_AREA.includes(String(prospect?.town ?? '').toLowerCase())
  const preferred = open.filter(one => baytownName(one.domain) === near)
  const from = preferred.length ? preferred : open
  return from.reduce((best, one) => (room(one) > room(best) ? one : best))
}

/** Counts one letter onto the address it left from. */
export function noteSent(sender) {
  if (sender) sender.today += 1
}

/**
 * The address a business has already been written from, where it is one the
 * roster still knows.
 *
 * @returns {object|null}
 */
export function senderFor(senders, address) {
  const wanted = String(address ?? '').toLowerCase()
  return senders.find(one => one.address === wanted) ?? null
}

/**
 * Whether a sender goes under the studio's own login, which is the mailbox
 * lib/outreach/sending/mailbox.js rests and counts. A sender with a login of
 * its own, or one the relay carries, answers to its own day instead.
 */
export const studioSender = sender => !sender.login && !sender.relay

/**
 * The roster with the studio's addresses shut while its mailbox is closed, so
 * the others go on carrying their own day.
 *
 * @param {{senders: object[]}} roster `readSenders(...)`.
 * @param {{open: boolean}} mailbox `readMailbox(...)`.
 */
export function withMailbox(roster, mailbox) {
  if (mailbox.open) return roster
  const senders = roster.senders.map(one =>
    studioSender(one) ? { ...one, open: false, rest: one.rest ?? 'the mailbox is closed' } : one
  )
  const capacity = senders
    .filter(one => one.open)
    .reduce((sum, one) => sum + Math.max(one.daily - one.today, 0), 0)
  return { senders, capacity }
}

/** What the transport is handed as the From line. */
export const envelopeOf = sender => ({ name: sender.name, address: sender.address })
