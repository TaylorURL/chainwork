/**
 * Where a prospect falls in the send queue, settled once for everything that asks.
 *
 * The queue is an ordering before it is anything else, and two separate pieces of
 * code lean on that ordering: the comparator that sorts a batch, and the read that
 * decides which rows are in the batch at all. Those two have to agree completely,
 * and the way they fail when they do not is silent. If the read treats a business
 * with no site of its own as ordinary while the comparator treats it as the
 * strongest lead on the table, the read hands over a page of rows that does not
 * contain it and the comparator never gets the chance to put it first. Nothing
 * looks wrong from outside: the queue is full, the send job runs, every message
 * goes out, and the leads worth writing to first were never among the rows anybody
 * looked at. A truncated read reads exactly like a healthy one.
 *
 * So the axis lives here rather than as an expression inside lib/outreach/sending/queue.js.
 * A comparator written inline becomes a second opinion the moment the read beside
 * it is edited without it, and the two get edited for different reasons - one when
 * the reasons for ranking a lead change, the other when the table grows and the
 * read has to be paged or bounded. Holding the whole axis in one module means an
 * edit moves both, and `ranksAhead` is derived from `rankOf` rather than restated,
 * so a row cannot be promoted by one and dropped by the other.
 *
 * Lower is stronger, which is the direction the audit score already runs in: the
 * scored sites keep their own numbers, 0 to 100 worst first, and everything that
 * beats a score is negative. A business that asked leads, because somebody who ran
 * the speed check on their own site named the problem themselves at the moment it
 * was on their mind, and no cold reading of a listing is worth as much as that. A
 * listing that reads as young comes next, since a business that has not been
 * trading long is deciding what to buy rather than defending what it already has.
 * A business with no site of its own follows, because there is nothing there to
 * argue with. Then the measured sites at their own scores, and last the rows
 * nothing has been measured on, which are unknown rather than weak and belong at
 * the end rather than scattered through the scored ones at a number they were
 * never given.
 *
 * Constants and pure functions only. Nothing here reads the database, the clock
 * or the environment, because the console bundles this beside the table it draws
 * and a server dependency would break that build.
 */
import { auditScore } from '../prospects/opportunity.js'
import { isYoung } from '../prospects/youth.js'
import { LAWSUIT_SOURCE } from '../prospects/lawsuits.js'

/**
 * What `outreach_prospects.source` says on a row that arrived because somebody
 * ran the speed check on their own business.
 *
 * The bridge writes this string and the rank reads it, and one disagreement
 * between the two would be a lead that lands in the table and then sorts as
 * though it had never asked - which is the one row on the list nobody would
 * think to go looking for. Both take the word from here rather than spelling it
 * out twice.
 */
export const ASKED_SOURCE = 'speed-check'

/**
 * Where a business just sued over its website sorts, which is ahead of
 * everything else. A suit is weeks from being settled, and the letter is only
 * worth sending while the defendant is still choosing who fixes the site.
 */
export const SUED_RANK = -4

/** Where a business that asked sorts, which is ahead of everything but a lawsuit. */
export const ASKED_RANK = -3

/** Where a listing that reads as young sorts, behind only the ones who asked. */
export const YOUNG_RANK = -2

/** Where a business with no site of its own sorts, which is ahead of every score. */
export const SOCIAL_RANK = -1

/** Where a prospect with no reading sorts, which is behind every real score. */
export const DEFAULT_RANK = 101

/**
 * Where one prospect falls on the axis.
 *
 * The ladder is read top down and the first rung that answers is the answer, so
 * a business that asked is not then weighed on how young its listing looks or on
 * what its site scored: the strongest thing true about a row is the whole of its
 * position. A scored site falls through to its own score, which is what keeps the
 * measured rows in worst-first order among themselves, and a row carrying no
 * usable score sits at `DEFAULT_RANK` past the end of the scale rather than at a
 * number that would mix it in with sites somebody has actually measured.
 *
 * @param {object} prospect A table row or a candidate, carrying `source`,
 *   `site_kind`, `audit_score` and whatever `isYoung` reads off a listing.
 * @returns {number} Lower is the stronger lead.
 */
export function rankOf(prospect) {
  if (!prospect) return DEFAULT_RANK
  if (prospect.source === LAWSUIT_SOURCE) return SUED_RANK
  if (prospect.source === ASKED_SOURCE) return ASKED_RANK
  if (isYoung(prospect)) return YOUNG_RANK
  if (prospect.site_kind === 'social') return SOCIAL_RANK
  return auditScore(prospect) ?? DEFAULT_RANK
}

/**
 * Whether a row ranks ahead of every scored row.
 *
 * The scored band runs from zero and the unmeasured sit past its far end, so
 * everything that beats a score is negative and this is that one question put to
 * `rankOf` rather than a second copy of the reasons kept alongside it.
 *
 * The candidate read is what needs the question. It orders on `audit_score`,
 * which is a column these rows have nothing in, so they sort to the far end of
 * the read and a limit applied to that order removes exactly the leads the
 * comparator was about to promote. Anything this answers true for has to survive
 * the read whatever else it drops.
 *
 * @param {object} prospect The same shape `rankOf` takes.
 * @returns {boolean} True when the row belongs in front of the scored rows.
 */
export function ranksAhead(prospect) {
  return rankOf(prospect) < 0
}
