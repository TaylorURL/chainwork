/**
 * When the day's messages go out, across the window rather than in a burst.
 *
 * The day's cap is spread over the hours the window is open, so a business
 * hearing from the studio at 09:12 and another at 14:40 are two people who
 * were written to, rather than two rows of one list processed in a minute.
 * Five messages leaving in the same second share a timestamp, and a shared
 * timestamp is the thing a filter reads first.
 *
 * Slots sit at the middle of equal divisions of the window, so the padding at
 * the start and the end matches and the last message never lands against
 * closing time. Each is then moved by an amount decided by the date and its own
 * position, which varies the gaps without changing what they average and
 * without moving once the day has started: the schedule has to be the same
 * answer at 08:05 and at 16:55, because every run of the job recomputes it.
 *
 * Nothing here reads a clock of its own. The caller passes the moment, which is
 * what lets a whole day be walked through in a test.
 */

import { clockIn, instantOf, ZONE } from '../zone.js'
import { SEND_PER_RUN_MAX } from './limits.js'

// Carried through so a caller reading the window takes the zone from the same
// module it read the window from.
export { ZONE }

// The hours a message may leave, in minutes from midnight in the recipients'
// own time, which is the zone the whole schedule is read in. A cold email
// arriving at two in the morning is read as spam whatever it says, and the
// timestamp is the first thing a reader sees. The send job's gate refuses a
// message outside them, and the day's slots divide the space between.
export const OPENS = 8 * 60
export const CLOSES = 17 * 60

// The days of the week no message leaves on, spelled the way `Intl` spells
// them. Outreach is a weekday thing: nothing goes out on a Saturday or a
// Sunday.
const CLOSED_DAYS = new Set(['Sat', 'Sun'])

// How far a slot may be moved from its even position, as a share of the gap
// between slots. A third leaves any two slots at least a third of a gap apart,
// so the order never changes and no two can land together.
const DRIFT = 0.33

// How often the send job fires, which is what decides whether a slot in the
// past still has a run behind it. The cron in vercel.json is the real cadence;
// this is the same figure written where the schedule can reason about it.
const RUNS_EVERY = 10

// Minutes held back from the end of the window that no slot is placed in.
//
// A slot is only sent by a run that happens after it, so one placed in the last
// few minutes has no run left to catch it and is lost for the day. The reserve
// is wider than the gap between runs, which is what guarantees every slot has a
// run behind it while the window is still open.
const TAIL = 40

/**
 * Messages the day's runs carry between them.
 *
 * The window divided by the cron's cadence is how many times the send job fires
 * inside it, and a firing carries SEND_PER_RUN_MAX. Nothing caps the day's
 * setting any more, so this is what actually bounds a day: a cap above it lays
 * out slots that the runs behind them never reach, and the day ends short with
 * nothing reporting an error.
 *
 * It is a ceiling rather than a figure a day hits. The tail holds slots out of
 * the last stretch of the window and the drift moves them about, so the largest
 * cap a day finishes in full is a run or so under this.
 * scripts/outreach/sending/check-send-schedule.js is what counts both.
 */
export const DELIVERS_A_DAY = ((CLOSES - OPENS) / RUNS_EVERY) * SEND_PER_RUN_MAX

/** Minutes since midnight in `ZONE`, and the calendar date there. */
export function localDay(now) {
  const { date, minutes } = clockIn(now)
  return { date, minutes }
}

/**
 * Whether the day an instant falls on is one messages leave at all.
 *
 * The window answers for a moment, which is the wrong question to put to a job
 * that runs before it opens: asked at seven whether it may send now, every day
 * of the week says no. This asks about the day instead, so the gate and the
 * ramp can read the same answer at different hours.
 *
 * @param {Date} [now]
 * @returns {boolean}
 */
export function sendsOn(now = new Date()) {
  return !CLOSED_DAYS.has(clockIn(now).weekday)
}

/**
 * Whether a message can still leave today.
 *
 * A slot in the past is ordinarily the next run's to pick up, which is what
 * lets a missed run cost nothing rather than a message. After the last run of
 * the day has fired there is no next run, and that same past slot is a message
 * going nowhere until tomorrow. Nothing in the slot itself tells the two apart,
 * so the clock is asked instead.
 *
 * The last run that can deliver is the last one inside the window, which is why
 * the reach ends a run short of closing rather than at it.
 *
 * @param {Date} [now]
 * @returns {boolean}
 */
export function reachesMore(now = new Date()) {
  return sendsOn(now) && localDay(now).minutes <= CLOSES - RUNS_EVERY
}

/**
 * A number in [0, 1) decided entirely by what it is given.
 *
 * The drift has to survive being recomputed by every run of the job through
 * the day, so it cannot come from a random source. Seeding on the date and the
 * slot gives one answer per slot per day, and a different set tomorrow.
 */
function seeded(seed) {
  let hash = 2166136261
  for (const character of seed) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 100000) / 100000
}

/**
 * The minutes past midnight each of the day's messages is due at.
 *
 * The grid is laid out for `DELIVERS_A_DAY` at the most, whatever the cap says.
 * Past that every run in the window already has more due than it can carry, so
 * a denser grid changes nothing a run does - and the cap is a figure a person
 * types, with nothing above it to catch a fat finger. A grid drawn at face
 * value would put one entry per message in memory on every send run and every
 * console load, so the guard is here rather than on the field: the arithmetic
 * has a bound, the setting does not.
 *
 * @param {number} cap How many go out today.
 * @param {string} date The local date, which the drift is seeded on.
 * @returns {number[]} One time per message, ascending.
 */
function slotsFor(cap, date) {
  if (!Number.isFinite(cap) || cap <= 0) return []
  const laid = Math.min(Math.floor(cap), DELIVERS_A_DAY)
  const step = (CLOSES - TAIL - OPENS) / laid
  return Array.from({ length: laid }, (_, index) => {
    const even = OPENS + step * (index + 0.5)
    const drift = (seeded(`${date}:${index}`) - 0.5) * 2 * DRIFT * step
    return Math.round(even + drift)
  })
}

/**
 * Midnight in `ZONE`, as the instant it happens at.
 *
 * The day's cap is counted from here and the slots are measured from here, so
 * the boundary is written once rather than derived again by each of them.
 *
 * @param {Date} [now] The moment whose day is wanted.
 * @returns {string} An ISO timestamp.
 */
export function dayStartsAt(now = new Date()) {
  return instantOf(localDay(now).date).toISOString()
}

/**
 * The day's slots as instants rather than as minutes past midnight.
 *
 * `slotsFor` answers in the wall clock the schedule is written in, which is
 * what the drift is seeded against. A reader is being told when a message
 * arrives, and that is a moment rather than a reading on a clock in Texas.
 *
 * @param {number} cap How many go out today.
 * @param {Date} [now] The moment whose day is wanted.
 * @returns {string[]} One ISO timestamp per message, ascending.
 */
export function slotsAt(cap, now = new Date()) {
  const { date } = localDay(now)
  const midnight = new Date(dayStartsAt(now)).getTime()
  return slotsFor(cap, date).map(minutes => new Date(midnight + minutes * 60000).toISOString())
}

/**
 * How many of the day's messages should have gone by now.
 *
 * The job sends the difference between this and what it has already sent, so a
 * run that was missed catches up on the next one rather than losing the slot,
 * and a run that fires twice in a minute sends nothing the second time.
 *
 * @param {number} cap The day's cap.
 * @param {Date} now The moment being asked about.
 * @returns {number} A count between 0 and the cap.
 */
export function dueBy(cap, now) {
  const { date, minutes } = localDay(now)
  return slotsFor(cap, date).filter(slot => slot <= minutes).length
}
