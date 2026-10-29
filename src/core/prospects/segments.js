/**
 * Which of the pipeline's conversations a prospect belongs in.
 *
 * Every message the sender writes opens on a reading of the business's site,
 * and there are only a few readings a site can come to: there is no site of
 * the business's own, the site is slow, it is middling, it is sound, or nothing
 * has been read at all. The segment is that reading given one name, so the code
 * that chooses a message and the console that says which message a business
 * would get are looking at the same word rather than each arriving at their
 * own.
 *
 * It is worked out rather than stored. Both halves of the answer already exist:
 * `hasNoSiteOfItsOwn` says whether there is a site to measure, and `opportunityBand`
 * says what the measurement came to. A column holding a copy would be a second
 * answer, and one that drifts the moment a score is retaken, so this reads those
 * two and nothing else. A business with no site of its own is `no-site`
 * whatever number a platform page happened to be given, because a score on a
 * Facebook page is a fact about Facebook.
 *
 * Strings and pure functions only. The console's build imports this beside
 * `src/app/utils/outreachOpportunity.js`, and a server dependency here would
 * break that bundle.
 */
import { hasNoSiteOfItsOwn, opportunityBand } from './opportunity.js'

/** The segments a prospect can sit in, strongest lead first. */
export const SEGMENTS = Object.freeze([
  'no-site',
  'slow-site',
  'fair-site',
  'sound-site',
  'unmeasured',
])

/**
 * The segment each opportunity band reads as, for a business with a site of
 * its own. The bands are cut where Google cuts the score, so a slow site is one
 * the report files as poor, and a sound one is one it files as good.
 */
const BY_BAND = Object.freeze({
  strong: 'slow-site',
  fair: 'fair-site',
  weak: 'sound-site',
  none: 'unmeasured',
})

/**
 * Which segment a prospect is in.
 *
 * @param {object} prospect Anything carrying `site_kind`, `website` and
 *   `audit_score`, which is what a table row and a candidate both carry.
 * @returns {string} One of `SEGMENTS`. A row nothing is known about is
 *   `unmeasured`, which is the honest word for it.
 */
export function segmentOf(prospect) {
  if (hasNoSiteOfItsOwn(prospect)) return 'no-site'
  return BY_BAND[opportunityBand(prospect)] ?? 'unmeasured'
}
