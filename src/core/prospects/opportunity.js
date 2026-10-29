/**
 * What a prospect's audit score means to whoever is deciding who to write to.
 *
 * The score is Google's mobile performance figure for the business's own site,
 * 0 to 100, where 100 is a fast site. Read as site health, 100 is the best
 * number on the page. Read as a sales list it is the other way round: a slow
 * site is a business with a problem worth a message, and a fast site is a
 * business with nothing to fix. So the bands here are named for the
 * opportunity rather than for the site, and the worst score is the strongest
 * lead.
 *
 * The cut points are Google's own banding of that score: 0 to 49 is a slow
 * site, 50 to 89 a middling one, 90 to 100 a fast one. Keeping them means a
 * figure that reads red in PageSpeed reads as a strong lead here, which is the
 * same fact stated for the other reader.
 *
 * A business whose only web presence is a profile on someone else's platform
 * carries no score and never will, because there is no site of its own to
 * measure, and neither does one with no presence anywhere. Both have no site
 * at all, which makes them the strongest leads on the list, so they rank ahead
 * of every scored business rather than falling in with the rows nothing has
 * been measured on yet. The two are one fact told twice over, and the
 * difference between them - a profile somewhere or nothing anywhere - is a
 * difference in what the message opens on rather than in how strong the lead
 * is.
 */
import { FAIR_FLOOR, GOOD_FLOOR } from '../audit/bands.js'
import { hostOf, platformOf } from './platforms.js'

/** The bands a prospect can sit in, strongest lead first. */
export const OPPORTUNITY_BANDS = ['strong', 'fair', 'weak', 'none']

/** Where a prospect nothing has been measured on sorts: after every scored one. */
const UNMEASURED_RANK = 1000

/**
 * Whether a business has no site of its own for a score to be taken of.
 *
 * `site_kind` is the enrichment job's own verdict on the website a listing
 * named, so it is what answers wherever it is set. It comes to 'none' and to
 * 'social' for the same reason - the job looked and found no site belonging to
 * the business - and both answer yes here, because a profile on somebody
 * else's platform and no page anywhere are two shapes of having nothing of
 * your own to measure.
 *
 * A row written before the column existed carries nothing, and for those the
 * listed host is read the way the pipeline reads it, through the platform list
 * both sides share rather than a second copy of it kept here. What that
 * fallback deliberately does not do is answer yes to a row holding neither a
 * kind nor a website: that is a row nobody has read yet rather than a business
 * with nothing, and reading an empty column as a finding would promote every
 * unenriched listing on the table to the front of the queue.
 */
export function hasNoSiteOfItsOwn(prospect) {
  if (prospect?.site_kind) return prospect.site_kind === 'social' || prospect.site_kind === 'none'
  return Boolean(platformOf(hostOf(prospect?.website)))
}

/** The score as a whole number inside the scale, or null where nothing was measured. */
export function auditScore(prospect) {
  const raw = prospect?.audit_score
  if (raw === null || raw === undefined || raw === '') return null
  const score = Number(raw)
  if (!Number.isFinite(score)) return null
  return Math.min(100, Math.max(0, Math.round(score)))
}

/** Which band a prospect sits in: `strong`, `fair`, `weak`, or `none`. */
export function opportunityBand(prospect) {
  if (hasNoSiteOfItsOwn(prospect)) return 'strong'
  const score = auditScore(prospect)
  if (score === null) return 'none'
  if (score >= GOOD_FLOOR) return 'weak'
  if (score >= FAIR_FLOOR) return 'fair'
  return 'strong'
}

/**
 * Where a prospect falls in a best-lead-first ordering, lowest first.
 *
 * A business with no site of its own leads, then every scored business in the
 * order the sender works them, then the ones nothing has been measured on -
 * which are unknown leads rather than weak ones, and belong at the end rather
 * than scattered through the scored rows at a score they were never given.
 */
export function opportunityRank(prospect) {
  if (hasNoSiteOfItsOwn(prospect)) return 0
  const score = auditScore(prospect)
  return score === null ? UNMEASURED_RANK : score + 1
}
