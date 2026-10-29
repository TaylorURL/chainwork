/**
 * The eleven stages a prospect moves through, in the order it moves through
 * them.
 *
 * The last six are where one stops. `unsubscribed` is the only stage no job
 * may walk a prospect out of, because what put it there was a person asking.
 *
 * The endpoint filters and counts by this list and the console draws its
 * filter and its breakdown from it, so a stage added to one is on both. Strings
 * only, because the console's build imports it too.
 */
export const STAGES = Object.freeze([
  'found',
  'enriched',
  'audited',
  'queued',
  'contacted',
  'replied',
  'unsubscribed',
  'bounced',
  'unreachable',
  'undeliverable',
  'skipped',
])
