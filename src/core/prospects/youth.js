/**
 * Whether a listing reads as a business that has only just started trading.
 *
 * The obvious way to answer that is to ask when the pipeline first saw the row,
 * and it is wrong. The Places sweep asks for twenty results per town and trade,
 * Google returns a rotating subset of whatever it holds for that pair, and the
 * twenty that come back on Tuesday are not the twenty that came back on Sunday.
 * So a pair fills toward its twenty over several separate sweeps, and a row
 * first written on the fourth sweep is not a business that opened between the
 * third and the fourth - it is a business that was sitting in Google's index the
 * whole time and finally surfaced in the slice that got returned. More than half
 * the table is first seen on a later sweep than the one that opened its pair,
 * for exactly that reason. A first-seen reading of newness is measuring the
 * rotation, and it would fail silently, because a list of businesses that all
 * genuinely exist looks correct from every angle except the one that matters.
 *
 * The review count is the reading that does hold. Reviews are the one thing on a
 * listing that only accumulates with time and trade, and they cannot be
 * backdated: a shop that has served a town for eight years has collected reviews
 * whether it wanted them or not, and one that opened in the spring has not had
 * the customers yet. The count arrives on the same search that found the row, on
 * a field tier already paid for, and every sweep over the pair refreshes it. So
 * it costs nothing to read and it is current.
 *
 * The distinction this file exists to keep is between a count of zero and no
 * count at all. Roughly a third of the table carries null for both
 * `business_status` and `rating_count`, and that is not a claim that the
 * business has no reviews - it is the sweep that wrote the row not having asked
 * for those fields, or Google not having answered for them. Reading a null as a
 * zero would take every row the pipeline knows least about and promote it to the
 * front of the send queue, which is the exact failure this module is shaped to
 * prevent: it would look like the ranking working, because the queue would fill
 * with confident-looking leads, and every one of them would be a row nobody has
 * read. So `unread` is a third answer with its own word, never folded into
 * either of the other two, and a caller that wants to treat it as young has to
 * say so itself.
 *
 * Be plain about what a low count actually means. It means young or invisible,
 * and this file cannot tell which from a single reading. A business that opened
 * in March and a business that has traded for a decade without ever asking a
 * customer for a review both come back with four reviews. That is fine, because
 * they are the same opportunity: both are businesses whose presence is not
 * working for them, which is the whole of what there is to sell. What separates
 * them is time rather than any cleverness here: a listing adding reviews between
 * sweeps is trading and becoming visible, and one that has not moved in months
 * is neither.
 *
 * The fixed end of that measurement is `rating_count_first`, written once by the
 * sourcing job on the sweep that first files a place and never rewritten.
 * Anybody rebuilding this table has to add the column, and the backfill that
 * comes with it seeds every row already on file with its current count. That
 * starts the clock on the day the column lands rather than on the day the row
 * was written, and there is no honest alternative: nobody recorded the earlier
 * counts, and seeding anything else would invent a history to make the
 * arithmetic look further along than it is. So every row filed before the column
 * holds the same count at both ends until the next sweep moves it, which is true.
 *
 * Strings and pure functions only. The console's build imports this beside
 * `segments.js`, and a database or network dependency here would break that
 * bundle.
 */

/**
 * The review count below which a listing reads as young.
 *
 * Ten is where the live distribution was actually cut, so the share it selects
 * is a known figure rather than a guess: about a quarter of the rows Google has
 * answered for sit under this line, and none of them sit at zero, because a
 * listing nobody has reviewed comes back with the review fields absent rather
 * than with a count of nothing. It is also about a year of trading for a small
 * local business that asks its customers now and then, which is the span where a
 * website is still an open question rather than a settled one.
 *
 * A quarter of the read table is a wide net, and that is deliberate. Narrowing
 * it would buy precision about age and lose the businesses that have traded
 * quietly for years without collecting anything, and those are not a
 * contamination of the list - they are the same sale. The net is meant to catch
 * a presence that is not working, and the count is how that shows.
 */
export const YOUNG_REVIEW_CEILING = 10

/** The readings a listing's age can come to, strongest lead first. */
export const YOUTHS = Object.freeze(['young', 'established', 'unread'])

/**
 * The statuses Google uses for a listing that is not currently trading.
 *
 * Both are read here, which is a wider rule than the one the exclusion list
 * keeps. That list drops a permanently closed business and leaves a temporarily
 * closed one in, because a kitchen being refitted reopens and is worth writing
 * to when it does. Neither is a young business, though: a shop that has shut its
 * doors this month is not one that opened this month, whatever its review count
 * says, and promoting it to the front of the queue on a low count would be the
 * ranking arguing hardest for the row least likely to answer.
 */
const CLOSED = Object.freeze(['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'])

/**
 * A stored count as a whole number, or null where there is not one to read.
 *
 * Only a number and a string are ever read. That looks like an over-narrow
 * rule for a column that holds an integer, and it is the whole of what keeps
 * this honest: JavaScript turns an array into a number without complaint, so
 * an empty one resolves to zero, a single-element one resolves to whatever is
 * inside it, and a boolean resolves to one. Every one of those would clear the
 * ceiling comparison and land the row at the front of the send queue, which is
 * the exact failure the count is read carefully to avoid. Anything that is not
 * plainly a figure somebody stored is unread, and unread has its own word.
 *
 * A string is still read, because a count arrives through PostgREST as JSON
 * and a column read into a text field on the way is the ordinary shape of that.
 */
function countOf(raw) {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null
  if (raw === '') return null
  const count = Number(raw)
  if (!Number.isFinite(count)) return null
  return Math.max(0, Math.round(count))
}

/**
 * The review count as a whole number, or null where nothing was read.
 *
 * Null, undefined and an empty column all mean the same thing and all come back
 * null, as does anything that will not resolve to a finite number. Nothing that
 * cannot be read as a count is allowed to pass as one, because the only thing
 * downstream does with a number is compare it against the ceiling, and a value
 * that quietly coerces to zero would clear that comparison and land at the front
 * of the queue.
 */
function reviewCount(prospect) {
  return countOf(prospect?.rating_count)
}

/**
 * Whether the listing says the business is still trading.
 *
 * A missing status is true, because it means the field was not read rather than
 * that the doors are shut, and treating an unread field as a closure would
 * quietly remove every row written by an older sweep from consideration.
 *
 * @param {object} prospect Anything carrying `business_status`.
 * @returns {boolean} False only where Google has said the listing is closed.
 */
export function isOperating(prospect) {
  return !CLOSED.includes(prospect?.business_status)
}

/**
 * How the listing's age reads: `young`, `established`, or `unread`.
 *
 * The three words answer whether this is a young lead rather than how old the
 * business is, which is why a closed listing with two reviews comes back
 * `established`. It is not young, nothing here is prepared to call it unread
 * when the count was plainly answered, and `established` is this file's word for
 * every read row that is not a lead of that kind.
 *
 * @param {object} prospect Anything carrying `rating_count` and
 *   `business_status`, which is what a table row and a candidate both carry.
 * @returns {string} One of `YOUTHS`. A row whose count nobody has read is
 *   `unread`, which is the honest word for it and never a stand-in for zero.
 */
export function youthOf(prospect) {
  const count = reviewCount(prospect)
  if (count === null) return 'unread'
  if (count < YOUNG_REVIEW_CEILING && isOperating(prospect)) return 'young'
  return 'established'
}

/** Whether a prospect reads as young, which is the only reading that ranks. */
export function isYoung(prospect) {
  return youthOf(prospect) === 'young'
}
