/**
 * A business whose reviews have just started moving.
 *
 * A map sweep stores two review counts: the one a business was first filed at
 * and the one it has now. The run between them is the only honest way to tell
 * a business that has just opened from one nobody has got round to reviewing,
 * and a business gaining reviews quickly is one spending money and growing.
 *
 * It needs nothing but the two columns, so the trigger is free.
 */

/** Reviews gained before the run is worth a letter. */
export const GAINED_ENOUGH = 10

/** The share of its reviews a business has to have gained to read as growing. */
export const GAINED_SHARE = 0.5

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whether a business is growing, and by how much.
 *
 * Both tests have to hold. A shop that went from four hundred reviews to four
 * hundred and twelve gained twelve and is not growing; one that went from six
 * to eighteen gained twelve and tripled. The share catches the second and the
 * count keeps the first out, and either on its own reads half the table as
 * growing.
 *
 * @param {object} row Carrying `rating_count`, `rating_count_first` and
 *   `created_at`, which is when the sweep first filed it.
 * @param {Date} now
 * @returns {{fault: string, says: string, gained: number, since: number|null}|null}
 */
export function growthOf(row, now = new Date()) {
  const held = row?.rating_count
  const first = row?.rating_count_first
  if (!Number.isInteger(held) || !Number.isInteger(first)) return null
  const gained = held - first
  if (gained < GAINED_ENOUGH) return null
  // Measured against where it started, so the share says how much of what it
  // has now arrived since it was filed.
  if (first > 0 && gained / first < GAINED_SHARE) return null

  const filed = Date.parse(row?.created_at ?? '')
  const days = Number.isFinite(filed)
    ? Math.max(1, Math.floor((now.getTime() - filed) / DAY_MS))
    : null

  return {
    fault: 'growing',
    says: days
      ? `the business has gained ${gained} Google reviews in the last ${days} days`
      : `the business has gained ${gained} Google reviews since it was first looked at`,
    gained,
    since: days,
  }
}

/** The source that files the businesses whose reviews are moving. */
export function growthSource({ id = 'growing', source = 'growing', rows }) {
  if (typeof rows !== 'function') throw new TypeError('growthSource needs `rows`')
  return {
    id,
    async find(context = {}) {
      const now = context.now instanceof Date ? context.now : new Date()
      const found = []
      for (const row of (await rows(context)) ?? []) {
        const growth = growthOf(row, now)
        if (!growth) continue
        found.push({
          source,
          ref: String(row.id ?? row.place_id ?? ''),
          payload: { ...growth, checked_at: now.toISOString() },
        })
      }
      return found.filter(one => one.ref)
    },
  }
}
