/**
 * What bounds outreach sending, held where every end of it reads the same
 * figures.
 *
 * There is no ceiling on the day. What one mailbox sends as cold mail before
 * the receiving side starts reading the sender rather than the message is a
 * judgement rather than an arithmetic fact, and it is taken in the console by
 * whoever is watching the bounce rate. A run's ceiling is the one bound left
 * here, and it is arithmetic: what one invocation of the send job can deliver
 * inside the function's own time limit. The day is spread across many runs by
 * lib/outreach/sending/schedule.js, so the two multiply out to what a day can
 * actually carry rather than either one saying it alone.
 *
 * The rest are the ramp's figures: the bounce rates a cap may rise and must
 * fall on, how much sending a rate has to be read over, how large a step is,
 * and how far the climb goes without a complaint signal to judge it by.
 * lib/outreach/sending/ramp.js decides with them and the console draws the same
 * thresholds it does.
 */

/**
 * Messages one invocation of the send job can carry.
 *
 * A run sends what the cap makes due and spaces those messages to fill the
 * part of its five minutes set aside for them, so the pace follows the cap
 * rather than the cap waiting on a fixed pace. At a cap of a hundred and fifty
 * a run has three or four due and they go twenty seconds apart, the widest the
 * spacing gets. At five hundred a run has ten due and they go about fifteen
 * seconds apart. `spacingFor` in api/outreach/send.js is that arithmetic.
 *
 * This figure is where the spacing reaches its floor. Twenty messages at a
 * delivery of a few seconds each and the shortest spacing is about three
 * minutes, which leaves the rest of the invocation for reminders and the
 * writes around them. A run whose deliveries are slower than that stops short
 * of the deadline on its own and leaves the rest owed to the next run, because
 * the loop asks the worst case of every message before it begins one.
 *
 * With no ceiling on the day, this is also what decides how large a cap is
 * worth setting. The window runs nine hours and the cron fires every ten
 * minutes, which is fifty-four runs of twenty, so a day delivers a thousand and
 * eighty and no more however high the cap goes. Past that the schedule lays out
 * slots the runs behind them cannot reach and the day simply ends short.
 * scripts/outreach/sending/check-send-schedule.js is what counts it.
 *
 * It is not the only bound on an invocation. A run also owes reminders, and
 * both halves spend the same five minutes, so api/outreach/send.js holds them
 * to one deadline and stops short of it rather than letting the platform
 * decide where a run ends. A run killed partway is a queue held by claims
 * nobody released.
 */
export const SEND_PER_RUN_MAX = 20

/**
 * The trailing hard-bounce rate the cap may rise under, as a percentage.
 *
 * Under it the list is clean enough that the volume is the only thing changing,
 * which is the condition a step is allowed on. At or above it the next thing to
 * do is read the bounces rather than send more, so the ramp holds and the
 * console draws the figure as a warning.
 */
export const BOUNCE_STEPS_UNDER = 2

/**
 * The trailing hard-bounce rate that takes the cap back down, as a percentage.
 *
 * Five per cent is where a receiving side stops treating the sender as a
 * mailbox with a stale list and starts treating it as one that does not know
 * who it is writing to. Past it the damage is to the domain, which the
 * newsletter and the client mail share, so the ramp returns the cap to the last
 * level it proved clean and stops climbing until a person restarts it.
 */
export const BOUNCE_ROLLS_BACK_OVER = 5

/**
 * Sends the trailing window needs before its rate decides anything.
 *
 * Below fifty a single hard bounce is already at or over BOUNCE_STEPS_UNDER, so
 * "clean" would mean "no bounce at all" - and no bounce across a handful of
 * sends is an absence of evidence rather than evidence of health. Fifty is the
 * smallest window whose rate can tell a clean list from one unlucky address,
 * which is the only reading a step is worth making on.
 */
export const RAMP_MIN_SENDS = 50

/**
 * The share of the current cap one step adds.
 *
 * A fixed step is wrong at both ends of the range: two is a sixth of a cap of
 * twelve and a twentieth of a cap of forty, so the same number is a bold move
 * early and a stall later. A share holds the pace steady instead, and a quarter
 * is the rate a warming mailbox is normally taken up at.
 */
export const RAMP_STEP_SHARE = 0.25

/**
 * The smallest step worth a day.
 *
 * daily_cap is a ceiling rather than a quota: the send job delivers whatever is
 * due up to it, so a day whose queue runs one short looks exactly like a day
 * one message under the cap. A step of one is inside that noise and would spend
 * a day proving nothing, so the ramp moves by at least two. It only binds below
 * a cap of eight, where a quarter rounds under two.
 */
export const RAMP_STEP_MIN = 2

/**
 * The highest cap the ramp climbs to on its own.
 *
 * Where a person sets the cap is a statement about reputation, and reputation
 * is carried far more by complaints than by bounces: a hard bounce says an
 * address does not exist, which is a fact about the list, while a complaint
 * says a person who read the message reported it, which is the fact the
 * plateau is about. Gmail SMTP runs no feedback loop, so nothing here can read
 * a complaint, and outreach_messages has no column that could hold one. Google
 * Postmaster Tools is the only route to that signal and it is not set up.
 *
 * That is why the ramp keeps a ceiling the settings no longer have. A person
 * raising the cap by hand has decided to carry the risk; a ramp raising it
 * unattended has only ever read bounces, and it should not spend a domain on
 * the half it cannot see.
 *
 * Twenty a day is the steady state a single Workspace mailbox sends cold mail
 * at without the volume itself being the thing the receiving side reads. Above
 * it, whether mail lands is decided by sender reputation rather than by list
 * quality, and that is exactly the half with no reading behind it. So the ramp
 * climbs to twenty unattended and stops there with the reason recorded. Going
 * past it takes the complaint signal, not a larger number here.
 */
export const RAMP_BLIND_MAX = 20

/**
 * The smallest the queue floor goes, whatever the cap is set to.
 *
 * Held at the floor, a day can always send a full day and the pipeline behind
 * it has a day of slack to find the next one. Below it the sourcing sweeps the
 * map on every run rather than on its slower pass - api/outreach/source.js
 * reads this figure - and a queue that stays under it through that is one the
 * map can no longer fill.
 *
 * A hundred and fifty is what the sourcing is asked to keep ahead of the
 * sending while the cap is anywhere the ramp reaches on its own. It is the
 * smallest the floor goes rather than the whole of it, because the sending it
 * is meant to stay ahead of is a setting rather than a fixed rate.
 * `queueFloorFor` is the figure in force.
 */
const QUEUE_FLOOR = 150

/**
 * Days of sending the floor holds at the cap in force.
 *
 * Two: the day about to go out, and a day behind it for the sourcing to find
 * the next. One would be a floor a single day empties, which is the state the
 * floor exists to give warning of rather than the state it describes.
 */
const QUEUE_FLOOR_DAYS = 2

/**
 * The queue floor in force, which is the standing figure or the cap's own two
 * days, whichever is higher.
 *
 * The floor used to be written as the day's ceiling, on the reasoning that a
 * floor under the queue lower than the day's cap is a floor a single day could
 * sweep straight through. The ceiling went and the figure was left standing on
 * its own, which held that reasoning only while the cap stayed small. At a cap
 * of two hundred a hundred and fifty is gone inside a single day, and the
 * sourcing reads its queue as full the whole way down, because the floor it is
 * drawn against is a figure the sending walked past.
 *
 * So it is tied back to the cap. Under a cap of seventy-five the standing
 * figure is already more than two days and nothing moves; above it the floor
 * climbs with the setting, which is the same thing being asked at either end:
 * hold enough that one day cannot empty the queue.
 *
 * A cap of zero is sending switched off rather than a queue that needs nothing
 * behind it, so the standing figure stands there too.
 *
 * @param {number} cap The day's cap, as the settings hold it.
 * @returns {number}
 */
export function queueFloorFor(cap) {
  const days = Number.isFinite(cap) && cap > 0 ? Math.ceil(cap) * QUEUE_FLOOR_DAYS : 0
  return Math.max(QUEUE_FLOOR, days)
}

/**
 * Days between one letter to a business and the next.
 *
 * Two weeks. The second letter of the lawsuit chain and of the cold intro
 * follows the first by this much, and then the chain ends.
 *
 * Counted in days from the moment a business was last written to, since no
 * two businesses share that moment.
 */
export const FOLLOW_UP_DAYS = 14

/**
 * Reminders one invocation sends, after the first letters it owes.
 *
 * They run outside the daily cap and the ramp, so this is the only thing that
 * bounds them, and it is set by the time an invocation has left once its
 * first letters and their captures are done.
 */
export const FOLLOW_UPS_PER_RUN = 4

/** Businesses due a reminder read in one invocation, ahead of the ones it sends. */
export const FOLLOW_UP_LIMIT = 40
