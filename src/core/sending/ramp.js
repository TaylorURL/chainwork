/**
 * Where the day's sending cap goes next.
 *
 * A ceiling reached by somebody raising a number every morning is a ceiling
 * never reached, and a ramp nobody holds is a sending domain burned on the
 * morning nobody looked. So the cap climbs on its own while the trailing
 * bounce rate stays clean, stands still while anything is marginal, and comes
 * back down and stops when the rate breaches.
 *
 * The decision is here rather than in the route because it is arithmetic over
 * four numbers and a date, and arithmetic that decides how much mail leaves a
 * domain should be readable without a database in front of it. The route reads
 * the settings row and the bounce record, hands both to `decide`, and writes
 * back whatever comes out.
 *
 * Two things bound the climb and they are not the same thing:
 *
 *   RAMP_BLIND_MAX    how far the evidence available here reaches
 *   ramp_floor        the highest cap this ramp has watched a clean day at
 *
 * The first is a constant and the second is written as the ramp goes, which is
 * what gives a rollback somewhere honest to roll back to.
 *
 * Neither is a ceiling on the cap itself. Nothing stops a person setting the
 * cap in the console wherever they want it, and a cap set above RAMP_BLIND_MAX
 * simply leaves the ramp holding: it will still roll that cap back on a breach,
 * but it will not climb any further on its own.
 *
 * ## The day whose numbers are not yet in
 *
 * Today is never read. It is incomplete by construction at any hour the job
 * could fire, and a partial day of sending against a full day of bounces is a
 * rate that flatters. Excluding it by date rather than by trusting the cron
 * means a run started by hand at noon reads the same days as the scheduled one
 * before dawn.
 *
 * A closed day's notices are in: hard bounces come back at the transport or as
 * a DSN, api/outreach/watch.js reads the mailbox hourly, and the last send of a
 * day is fifteen hours before the ramp looks at it.
 *
 * ## The complaint half
 *
 * There is no complaint rate and there is no way to get one. Gmail SMTP runs no
 * feedback loop, so a reader marking a cold message as spam tells Google and
 * tells this side nothing; outreach_messages has no column for it and nothing
 * writes one. Google Postmaster Tools is the only route and it is not set up.
 *
 * So the ramp does not pretend to check one. It climbs to RAMP_BLIND_MAX, which
 * is as far as hard bounces alone can justify, and stops there saying why. The
 * range above that is decided by sender reputation rather than by list quality,
 * and reputation is the half with no reading behind it.
 */

import {
  BOUNCE_ROLLS_BACK_OVER,
  BOUNCE_STEPS_UNDER,
  RAMP_BLIND_MAX,
  RAMP_MIN_SENDS,
  RAMP_STEP_MIN,
  RAMP_STEP_SHARE,
} from './limits.js'
import { localDay, sendsOn } from './schedule.js'
import { dayIn } from '../zone.js'

/** The highest cap the ramp will move to unattended. */
export const RAMP_CEILING = RAMP_BLIND_MAX

/**
 * How far the cap moves when it moves.
 *
 * @param {number} cap Where it is now.
 * @returns {number} Where it goes, never past RAMP_CEILING.
 */
export function stepTo(cap) {
  const step = Math.max(RAMP_STEP_MIN, Math.round(cap * RAMP_STEP_SHARE))
  return Math.min(cap + step, RAMP_CEILING)
}

/** A percentage as it is written into a run's note. */
const pct = rate => `${rate.toFixed(1)}%`

/**
 * The sending days the decision is taken over, which is every closed one.
 *
 * @param {object[]} days One row per day, oldest first.
 * @param {string} today The local date, which is the one left out.
 */
function closedDays(days, today) {
  return (days || []).filter(day => day.date < today)
}

/**
 * What to do with the cap, given the state and the record.
 *
 * @param {object} input
 * @param {number} input.cap The cap in force.
 * @param {number} input.floor The highest cap a clean day has been seen at.
 * @param {string|null} input.steppedOn The local date the cap last moved on.
 * @param {string|null} input.haltedAt When the climb was stopped, or null.
 * @param {boolean} input.sending Whether messages are actually leaving.
 * @param {boolean} input.enabled Whether the ramp is switched on.
 * @param {object} input.record What lib/outreach/sending/bounces.js read.
 * @param {Date} [input.now] The moment being decided at.
 * @returns {{action: 'step'|'hold'|'roll-back', cap: number, floor: number,
 *   note: string, reading: object, halt: boolean}} `cap` is where it should be
 *   left, which equals the cap in force on a hold. `reading.today` is the local
 *   date the decision was taken on, which is the one a step is recorded under.
 */
export function decide({
  cap,
  floor,
  steppedOn,
  haltedAt,
  sending,
  enabled,
  record,
  now = new Date(),
}) {
  const { date: today } = localDay(now)
  const days = closedDays(record?.days, today)
  const sent = days.reduce((total, day) => total + day.sent, 0)
  const bounced = days.reduce((total, day) => total + day.bounced, 0)
  const rate = sent ? (bounced / sent) * 100 : null

  // cap_before rather than cap, because the caller spreads this beside the cap
  // the decision arrived at, and a run that reports one figure called cap says
  // nothing about whether it moved.
  const reading = {
    today,
    days: days.length,
    sent,
    bounced,
    rate,
    cap_before: cap,
    floor,
    ceiling: RAMP_CEILING,
  }
  const hold = note => ({ action: 'hold', cap, floor, note, reading, halt: false })

  if (!enabled) {
    return hold('The ramp is switched off. The cap stays where it is set.')
  }
  if (haltedAt) {
    return hold(
      `The ramp stopped on ${dayIn(haltedAt)} and has not been restarted. ` +
        'The cap moves by hand until it is.'
    )
  }

  // A breach is answered before anything else, including a window too thin to
  // step on. Thin data is a reason not to climb; it is never a reason to leave
  // the cap where a bounce has just been read.
  if (rate !== null && rate > BOUNCE_ROLLS_BACK_OVER) {
    // Never upward. A cap set below the floor by hand was set there on purpose,
    // and a rollback that raised it would be the ramp overruling a person at
    // the worst possible moment.
    const back = Math.min(cap, floor)
    return {
      action: 'roll-back',
      cap: back,
      floor: back,
      note:
        `${pct(rate)} of ${sent} sends bounced across ${days.length} days, over the ` +
        `${BOUNCE_ROLLS_BACK_OVER}% the cap comes down at. ` +
        (back === cap
          ? `The cap is already at ${back} and the climb has stopped.`
          : `The cap is back to ${back}, the last level a clean day was read at.`) +
        ' Restart the ramp in the console once the bounces have been read.',
      reading,
      halt: true,
    }
  }

  if (!sending) {
    return hold('Sending is closed, so no day is adding to the record. The cap stays where it is.')
  }
  if (!sendsOn(now)) {
    return hold(
      'Nothing goes out on a Sunday, so today adds nothing to the record either. A step taken ' +
        'now would be a cap the week has not read a clean day at.'
    )
  }
  if (cap >= RAMP_CEILING) {
    return hold(
      `The cap is at ${cap}, which is as far as the ramp climbs on hard bounces alone. ` +
        'Going past it needs a complaint rate, and Gmail SMTP reports none. ' +
        'Set up Google Postmaster Tools and the ramp can be given that gate.'
    )
  }
  if (steppedOn === today) {
    return hold('The cap already moved today. One step a day, so the new one gets a full day.')
  }
  if (sent < RAMP_MIN_SENDS) {
    return hold(
      `${sent} sends across ${days.length} closed days is under the ${RAMP_MIN_SENDS} a rate ` +
        'means anything at. Below that a single bounce is already over the step threshold, ' +
        'so a clean reading would only be saying nothing has gone wrong yet.'
    )
  }
  if (rate >= BOUNCE_STEPS_UNDER) {
    return hold(
      `${pct(rate)} of ${sent} sends bounced, at or over the ${BOUNCE_STEPS_UNDER}% a step ` +
        `needs to be under and inside the ${BOUNCE_ROLLS_BACK_OVER}% the cap comes down at. ` +
        'The cap holds while the rate is in between.'
    )
  }

  const next = stepTo(cap)
  return {
    action: 'step',
    cap: next,
    // The cap being left behind is the one a clean day was actually read at,
    // so it is what a later breach returns to.
    floor: cap,
    note:
      `${pct(rate)} of ${sent} sends bounced across ${days.length} days, under the ` +
      `${BOUNCE_STEPS_UNDER}% a step needs. The cap goes from ${cap} to ${next}` +
      (next === RAMP_CEILING ? `, which is where the climb stops.` : '.'),
    reading,
    halt: false,
  }
}
