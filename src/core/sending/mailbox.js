/**
 * The cold mailbox itself: whether Gmail is letting it send, and how much more
 * it may carry in the day Gmail counts.
 *
 * Every cold letter leaves from one Gmail mailbox, through `deliver` in
 * api/outreach/send.js, whichever pipeline wrote it: the first letters and the
 * follow-ups, the preview letters, and the letters to new businesses. Gmail
 * judges that mailbox as one sender, so its limits are the mailbox's and not
 * any one pipeline's. Each pipeline keeps a cap of its own, and none of those
 * caps can see the others; this is the one figure that sees all of them.
 *
 * Gmail says no in two ways, and the difference is the whole of this file. A
 * refusal about one recipient - an address that does not exist, a mailbox that
 * is full - says nothing about the next letter, and the run goes on to it. A
 * refusal of the mailbox itself says the same thing to every letter after it:
 * the day's sending limit is spent (550 5.4.5), the mailbox is being throttled
 * (421, 454, or any 4.7.x), or its login is not accepted (535, 5.7.8). Offering
 * the next letter to a mailbox Gmail has just refused is knocking on a closed
 * door, and a mailbox that knocks hundreds of times a day is one Gmail reads as
 * worse than the letters it carries.
 *
 * So a refusal of the mailbox rests it. The rest is a dated setting on
 * `outreach_settings`, the row every sender already reads:
 *
 *   mailbox_rests_until  The moment the mailbox may be offered a letter again.
 *                        Null is open.
 *   mailbox_rest_reason  What Gmail said, and when, so the console says why.
 *
 * A spent daily limit rests the mailbox for a full day from the refusal,
 * since Gmail counts its day as the twenty-four hours behind the moment it is
 * asked rather than from a midnight. Anything else that refuses the mailbox
 * rests it for an hour, which is long enough for a throttle to lift and short
 * enough that a login put right is back at work the same morning. A rest only
 * ever moves later: a second refusal that would end sooner than the rest
 * already set leaves the later one standing.
 *
 * The rest stops a mailbox after Gmail has refused it. The cap stops it before
 * Gmail has to. `mailbox_daily_cap` is the most the mailbox may carry in any
 * twenty-four hours, counted across every letter that left it: the outbound
 * rows of `outreach_messages` and the rows of `new_business_messages`, each at
 * 'sent' with a `sent_at` inside the day. It is set below the figure Gmail last
 * refused at, so the refusal is never reached. Null is no ceiling.
 *
 * Both are enforced in `deliver`, in front of the transport, so a sender
 * written later that knows nothing of either is held by them anyway. A resting
 * or full mailbox throws `MailboxClosed` there before anything is handed to
 * the mail server, and a refusal of the mailbox records its rest on the way
 * out. Each sender also reads the mailbox once at the top of its run and does
 * nothing when it is closed, and stops its loop at the first letter the
 * mailbox refuses or turns away, which is what keeps the letters it never
 * tried exactly where they were waiting.
 *
 * One reading is held for a minute, so a run of letters a few seconds apart
 * costs one reading rather than three queries per letter, and the letters
 * carried since it are counted out of its room as they go. A rest this process
 * records takes the reading's place at once, so the mailbox is closed for the
 * rest of the run whatever the reading said. Past the minute the settings row
 * answers again, which is what lets a person who lifts a rest by hand reopen
 * the mailbox everywhere rather than only where no process remembers it.
 */

import { Undeliverable } from '../prospects/address.js'

const HOUR_MS = 60 * 60 * 1000

/** The day Gmail counts a mailbox's sending over, and the rest a spent one gets. */
export const MAILBOX_DAY_MS = 24 * HOUR_MS

/** The rest any other refusal of the mailbox gets. */
export const MAILBOX_PAUSE_MS = HOUR_MS

/**
 * How long one reading of the mailbox is trusted before it is taken again.
 *
 * Long enough that a run spacing its letters seconds apart reads the mailbox
 * once, and short enough that a rest another sender recorded reaches a run
 * already under way within the minute rather than at its end.
 */
const READING_HOLDS_MS = 60_000

/** Room in the reason column for what Gmail said, and no room for a page. */
const REASON_MAX = 500

/** The columns the mailbox is read from. */
export const MAILBOX_COLUMNS = 'mailbox_rests_until, mailbox_rest_reason, mailbox_daily_cap'

/**
 * Thrown in front of the transport when the mailbox is resting or has carried
 * its day's worth, so a caller can tell a letter the mailbox turned away from
 * a letter Gmail refused.
 *
 * Nothing was handed to the mail server, so a letter stopped by this is not a
 * failed letter. It is put back where it was waiting and goes once the
 * mailbox opens again.
 */
export class MailboxClosed extends Error {
  constructor(state) {
    super(`the mailbox is closed: ${state.reason}`)
    this.name = 'MailboxClosed'
    this.reason = state.reason
    this.until = state.until ?? null
  }
}

const instantOf = value => {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

/** The first line of what the server said, without the continuation lines' codes. */
const firstLineOf = text =>
  String(text ?? '')
    .split('\n')[0]
    .trim()

/**
 * Whether a transport error refuses the mailbox itself, and how long it rests
 * the mailbox for if it does.
 *
 * It reads what nodemailer hands back: the three-digit reply code on
 * `responseCode`, the server's own words on `response`, the error's message,
 * and `code`, which is 'EAUTH' for a login the server would not accept. The
 * enhanced status code in the server's words (5.4.5, 4.7.0, 5.7.8) is the
 * part that says which kind of refusal it was, and a recipient's bounce
 * carries its own (5.1.1 for an address that does not exist), which is never
 * one of these.
 *
 * An address refused before it reached the server is about that address and
 * nothing else, and a letter the mailbox itself turned away was never offered
 * to the server at all, so neither is a refusal of the mailbox.
 *
 * @param {unknown} cause What the transport threw.
 * @returns {{kind: 'daily-limit'|'throttled'|'login', restMs: number, said: string}|null}
 */
export function mailboxRefusalOf(cause) {
  if (!cause || cause instanceof Undeliverable || cause instanceof MailboxClosed) return null
  const said = [cause.response, cause.message]
    .filter(Boolean)
    .map(String)
    .find(text => text.trim())
  if (!said && !cause.responseCode && cause.code !== 'EAUTH') return null
  const text = said ?? ''
  const status = /\b([245]\.\d{1,3}\.\d{1,3})\b/.exec(text)?.[1] ?? null
  // The reply code opens the server's line, or follows the colon nodemailer
  // puts after its own words, and is read nowhere else in the text.
  const reply = Number(cause.responseCode) || Number(/(?:^|:\s)([245]\d\d)[\s-]/.exec(text)?.[1])
  const words = firstLineOf(text) || `the server answered ${reply || cause.code}`

  if (status === '5.4.5') return { kind: 'daily-limit', restMs: MAILBOX_DAY_MS, said: words }
  // A throttle is read before a refused login, because Gmail throttles logins
  // too: 454 4.7.0 arrives as a login failure and says to try again later.
  if (reply === 421 || reply === 454 || status?.startsWith('4.7.')) {
    return { kind: 'throttled', restMs: MAILBOX_PAUSE_MS, said: words }
  }
  if (reply === 535 || status === '5.7.8' || cause.code === 'EAUTH') {
    return { kind: 'login', restMs: MAILBOX_PAUSE_MS, said: words }
  }
  return null
}

/** What each kind of refusal is called where the console says why the mailbox is resting. */
const KIND_NAMES = {
  'daily-limit': 'Gmail refused the mailbox for its daily sending limit',
  throttled: 'Gmail is throttling the mailbox',
  login: 'Gmail refused the mailbox login',
}

// What this process knows about the mailbox, kept per database client: the
// last reading, when it was taken, the letters carried since, and a rest this
// process recorded and could not write down. Keyed on the client so two runs
// with clients of their own never read each other's.
const readings = new WeakMap()

function entryOf(db) {
  let entry = readings.get(db)
  if (!entry) {
    entry = { state: null, readAt: 0, carried: 0, rest: null }
    readings.set(db, entry)
  }
  return entry
}

/** The rest that ends later of two, either of which may be missing. */
const laterOf = (one, other) => {
  if (!one) return other ?? null
  if (!other) return one
  return Date.parse(other.until) > Date.parse(one.until) ? other : one
}

/** The rest the settings row holds, or null where it holds none. */
function restOf(settings) {
  const until = instantOf(settings?.mailbox_rests_until)
  if (until === null) return null
  return {
    until: new Date(until).toISOString(),
    reason: settings?.mailbox_rest_reason || 'the mail server refused the mailbox',
  }
}

/** The cap the settings row holds, or null for no ceiling. */
function capOf(settings) {
  const cap = settings?.mailbox_daily_cap
  if (cap === null || cap === undefined || cap === '') return null
  const figure = Number(cap)
  return Number.isFinite(figure) ? Math.max(Math.floor(figure), 0) : null
}

const resting = rest => ({
  open: false,
  resting: true,
  until: rest.until,
  reason: `it is resting until ${rest.until}: ${rest.reason}`,
})

/**
 * The mailbox as closed by a rest at `now`, or null while none runs. Unlike
 * `readMailbox` it counts nothing, so it costs no query.
 *
 * @param {object} db A service-role client.
 * @param {object} settings The `outreach_settings` row.
 * @param {Date} [now]
 */
export function restingNow(db, settings, now = new Date()) {
  const rest = laterOf(restOf(settings), entryOf(db).rest)
  return rest && Date.parse(rest.until) > now.getTime() ? resting(rest) : null
}

/** A reading with the letters carried since counted out of its room. */
function withRoom(cap, sent) {
  const room = Math.max(cap - sent, 0)
  if (room > 0) return { open: true, cap, sent, room }
  return {
    open: false,
    full: true,
    cap,
    sent,
    room: 0,
    reason: `it has carried ${sent} letters in the last 24 hours, and its cap is ${cap}`,
  }
}

async function settingsOf(db) {
  const { data, error } = await db
    .from('outreach_settings')
    .select(MAILBOX_COLUMNS)
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data && !Array.isArray(data) ? data : {}
}

/**
 * Every letter that left the mailbox in the twenty-four hours before `now`,
 * from either table a sender records its letters in.
 */
async function carriedSince(db, now) {
  const since = new Date(now.getTime() - MAILBOX_DAY_MS).toISOString()
  const [cold, fresh] = await Promise.all([
    db
      .from('outreach_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .gte('sent_at', since),
    db
      .from('new_business_messages')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', since),
  ])
  if (cold.error) throw new Error(cold.error.message)
  if (fresh.error) throw new Error(fresh.error.message)
  return (cold.count ?? 0) + (fresh.count ?? 0)
}

/**
 * The mailbox as it stands at `now`, read afresh.
 *
 * Closed while a rest runs, whether the settings row holds it or this process
 * recorded one it could not write there. Otherwise open, with the room its cap leaves after every letter
 * that left it in the last twenty-four hours, and closed once that room is
 * spent. The letters are only counted when there is a cap to count them
 * against.
 *
 * A sender that already holds the settings row passes it, and the row is not
 * read a second time. The reading is held for the minute after, for `deliver`.
 *
 * @param {object} db A service-role client.
 * @param {Date} [now]
 * @param {object|null} [settings] The `outreach_settings` row, where in hand.
 * @returns {Promise<{open: boolean, reason?: string, until?: string, cap?: number|null, sent?: number|null, room?: number|null}>}
 * @throws {Error} When the row or the counts cannot be read.
 */
export async function readMailbox(db, now = new Date(), settings = null) {
  const row = settings ?? (await settingsOf(db))
  const entry = entryOf(db)
  const rest = laterOf(restOf(row), entry.rest)

  let state
  if (rest && Date.parse(rest.until) > now.getTime()) state = resting(rest)
  else {
    const cap = capOf(row)
    state =
      cap === null
        ? { open: true, cap: null, sent: null, room: null }
        : withRoom(cap, await carriedSince(db, now))
  }

  entry.state = state
  entry.readAt = Date.now()
  entry.carried = 0
  return state
}

/** The held reading while it holds, with the letters carried since counted out of its room. */
function heldReading(entry) {
  const age = Date.now() - entry.readAt
  if (!entry.state || age < 0 || age >= READING_HOLDS_MS) return null
  if (!entry.state.open || entry.state.cap === null) return entry.state
  return withRoom(entry.state.cap, entry.state.sent + entry.carried)
}

/**
 * Throws `MailboxClosed` unless the mailbox may be offered a letter now.
 *
 * This is the question `deliver` asks in front of the transport, and the one a
 * sender asks before it spends anything on a letter. A rest this process could
 * not write down answers first. A reading taken in the last minute answers
 * next, with the letters carried since it counted out of its room, and a rest
 * this process recorded is such a reading. Anything older is read again. A mailbox whose state cannot be read is treated as
 * closed: a letter not sent is a letter the next run sends, and a letter sent
 * past a limit nobody could read is not one that can be taken back.
 *
 * @param {object} db A service-role client.
 * @param {Date} [now]
 * @throws {MailboxClosed}
 */
export async function assertMailboxOpen(db, now = new Date()) {
  const entry = entryOf(db)
  if (entry.rest && Date.parse(entry.rest.until) > now.getTime()) {
    throw new MailboxClosed(resting(entry.rest))
  }
  let state = heldReading(entry)
  if (!state) {
    try {
      state = await readMailbox(db, now)
    } catch (cause) {
      throw new MailboxClosed({
        reason: `its state could not be read: ${cause?.message || cause}`,
      })
    }
  }
  if (!state.open) throw new MailboxClosed(state)
  return state
}

/**
 * Why the mailbox would turn a letter away now, or null when it would take one.
 *
 * The same question as `assertMailboxOpen`, answered as a value, for a sender
 * asking before it spends a draft or a claim on a letter rather than in front
 * of the transport.
 *
 * @param {object} db A service-role client.
 * @param {Date} [now]
 * @returns {Promise<string|null>}
 */
export async function mailboxClosedReason(db, now = new Date()) {
  try {
    await assertMailboxOpen(db, now)
    return null
  } catch (cause) {
    if (cause instanceof MailboxClosed) return cause.reason
    throw cause
  }
}

/** Counts a letter the mailbox carried against the held reading's room. */
export function noteCarried(db) {
  const entry = readings.get(db)
  if (entry) entry.carried += 1
}

/**
 * Rests the mailbox after a refusal of it, and answers the rest recorded.
 *
 * The rest closes the mailbox for this process at once, as the reading the
 * next letter is asked against, and is then written to the settings row for
 * every other sender. The write only ever moves the rest later, so two senders
 * refused in the same minute, or a throttle refused after the daily limit,
 * leave the later end standing. A write that does not land is logged rather
 * than thrown, since the transport's own refusal is what the caller is about to
 * act on, and the rest is kept here instead until it ends, so this process
 * stays closed either way.
 *
 * @param {object} db A service-role client.
 * @param {{kind: string, restMs: number, said: string}} refusal What
 *   `mailboxRefusalOf` answered.
 * @param {Date} [now] The moment of the refusal.
 * @returns {Promise<{until: string, reason: string}>}
 */
export async function restMailbox(db, refusal, now = new Date()) {
  const until = new Date(now.getTime() + refusal.restMs).toISOString()
  const reason =
    `${now.toISOString()}: ${KIND_NAMES[refusal.kind] ?? 'Gmail refused the mailbox'}: ${refusal.said}`.slice(
      0,
      REASON_MAX
    )
  const entry = entryOf(db)
  const held = entry.state?.resting
    ? { until: entry.state.until, reason: entry.state.reason }
    : null
  const rest = laterOf(held, { until, reason })
  entry.state = held === rest ? entry.state : resting(rest)
  entry.readAt = Date.now()
  entry.carried = 0

  const { error } = await db
    .from('outreach_settings')
    .update({ mailbox_rests_until: until, mailbox_rest_reason: reason })
    .eq('id', 1)
    .or(`mailbox_rests_until.is.null,mailbox_rests_until.lt.${until}`)
  if (error) {
    console.error('outreach mailbox: could not record its rest: %s', error.message)
    entry.rest = laterOf(entry.rest, { until, reason })
  }
  return { until, reason }
}

/**
 * Rests the mailbox when `cause` refuses it, and answers the refusal, or null
 * when it was about one letter rather than the mailbox.
 *
 * @param {object} db A service-role client.
 * @param {unknown} cause What the transport threw.
 * @param {Date} [now]
 */
export async function restIfRefused(db, cause, now = new Date()) {
  const refusal = mailboxRefusalOf(cause)
  if (!refusal) return null
  await restMailbox(db, refusal, now)
  return refusal
}

/**
 * Why a sender's loop stops at this error, or null when it goes on to the next
 * letter: the mailbox turned the letter away, or Gmail refused the mailbox.
 *
 * @param {unknown} cause
 * @returns {string|null}
 */
export function mailboxStopOf(cause) {
  if (cause instanceof MailboxClosed) return `the mailbox is closed: ${cause.reason}`
  const refusal = mailboxRefusalOf(cause)
  return refusal ? `${KIND_NAMES[refusal.kind]}: ${refusal.said}` : null
}
