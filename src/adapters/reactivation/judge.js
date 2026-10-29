/**
 * A business already on file that was never written to twice.
 *
 * It is the cheapest list there is: every business put aside months ago
 * because its site would not answer, because a rule caught it, or because it
 * simply never replied. Nothing has to be found. The only question is which of
 * them is worth asking again, and the answer turns on how long ago and why.
 *
 * ## Why the reason matters
 *
 * A business put aside because nobody could find an address for it may have
 * published one since, and a business a rule caught may have fallen out of
 * that rule. A business that asked to stop is never on this list, and neither
 * is one somebody took out by hand: a person's own decision is not something
 * for a timer to overturn.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** How long a business is left alone before it is worth asking again. */
export const RESTS_FOR_DAYS = 180

/** The stages a business can be picked back up from, and what each one says. */
export const PICKED_UP_FROM = Object.freeze({
  unreachable: 'the site would not answer and no address was found',
  skipped: 'a rule put the business aside',
  contacted: 'the business was written to and never replied',
})

/**
 * Whether a business is worth asking again, and why it was put aside.
 *
 * @param {object} row
 * @param {Date} now
 * @returns {{fault: string, says: string, stage: string, days: number}|null}
 */
export function reactivationOf(row, now = new Date()) {
  // A person's own decision, and a request to stop, are both off limits.
  if (row?.replied_at || row?.unsubscribed_at || row?.suppressed) return null
  if (row?.bounced_at) return null
  if (row?.skip_reason && !row?.skip_rule) return null

  const stage = String(row?.stage ?? '')
  const says = PICKED_UP_FROM[stage]
  if (!says) return null

  const last = Date.parse(row?.contacted_at ?? row?.updated_at ?? row?.created_at ?? '')
  if (!Number.isFinite(last)) return null
  const days = Math.floor((now.getTime() - last) / DAY_MS)
  if (days < RESTS_FOR_DAYS) return null

  return { fault: 'reactivation', says, stage, days }
}

/** The source that files the businesses worth asking again. */
export function reactivationSource({ id = 'reactivation', source = 'reactivation', rows }) {
  if (typeof rows !== 'function') throw new TypeError('reactivationSource needs `rows`')
  return {
    id,
    async find(context = {}) {
      const now = context.now instanceof Date ? context.now : new Date()
      const found = []
      for (const row of (await rows(context)) ?? []) {
        const again = reactivationOf(row, now)
        if (!again) continue
        found.push({
          source,
          ref: String(row.id ?? ''),
          payload: { ...again, checked_at: now.toISOString() },
        })
      }
      return found.filter(one => one.ref)
    },
  }
}
