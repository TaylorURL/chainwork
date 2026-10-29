/**
 * Reading a whole table, rather than as much of it as one answer carries.
 *
 * A plain select stops at the project's row ceiling, and stopping there is not
 * an error: the answer arrives with a thousand rows in it and says nothing
 * about the rest. A total counted over that answer is a figure that was right
 * until the table passed a thousand rows and has been quietly wrong ever
 * since, which is the worst shape a number on a dashboard can take - it is
 * still a number, it still moves, and nothing about it says it stopped.
 *
 * So a read that has to see every row asks for it a page at a time and stops
 * when a page comes back short. The query is passed as a function rather than
 * as a builder, because a builder holds one request's worth of state and
 * cannot be ranged a second time.
 *
 * A ceiling is still worth having, since an endpoint answering a console has
 * seconds to do it in. It is a stated one: `readAll` says how many rows it
 * covered, and a caller that reached the ceiling can say so beside the figures
 * rather than presenting a sample as a total.
 */

/** Rows one page carries, which is the ceiling a single answer stops at. */
export const PAGE_ROWS = 1000

/**
 * One page of a read: the rows, whether the set ended inside it, and how many
 * rows the whole set holds where the query asked for that.
 *
 * A query built with `{ count: 'exact' }` on its select answers every page
 * with the size of the whole set, at the cost of one count inside the same
 * request. Without it `count` is null and the read walks the set a page at a
 * time, as it always did.
 */
async function pageOf(build, from, size) {
  const { data, error, count } = await build().range(from, from + size - 1)
  if (error) throw error
  const rows = data || []
  return { rows, short: rows.length < size, count: Number.isInteger(count) ? count : null }
}

/**
 * Every row a query selects, up to `max`.
 *
 * A set that is several pages deep is read in one round of requests rather
 * than one request after another, wherever the first page says how many rows
 * there are. The call list is the case: fifteen hundred callable businesses,
 * three pages, read on every poll of every console, and three round trips in
 * a row put the whole latency of two of them on the front of every read. The
 * count is a hint and never the authority - the pages after it are still read
 * until one comes back short, so a set that grew between the count and the
 * pages loses nothing to the gap.
 *
 * @param {() => object} build Returns a fresh query, unranged.
 * @param {{max?: number, pageSize?: number}} [bounds]
 * @returns {Promise<{rows: object[], complete: boolean}>} `complete` is false
 *   only where the ceiling stopped the read with rows still to come.
 */
export async function readAll(build, { max = 50_000, pageSize = PAGE_ROWS } = {}) {
  const rows = []
  let from = 0

  const first = await pageOf(build, 0, Math.min(pageSize, max))
  rows.push(...first.rows)
  if (first.short) return { rows, complete: true }
  from = rows.length

  if (first.count !== null && first.count > from && from < max) {
    const until = Math.min(first.count, max)
    const asks = []
    // Each page is asked for whole rather than cut to the count, so a count
    // that was right comes back with its last page short and the read ends
    // there. A last page cut to the count's own edge would always be full,
    // and a full page has to be followed by another to know the set ended.
    for (let at = from; at < until; at += pageSize) {
      const size = Math.min(pageSize, max - at)
      asks.push(pageOf(build, at, size))
      from = at + size
    }
    const pages = await Promise.all(asks)
    for (const page of pages) rows.push(...page.rows)
    if (pages[pages.length - 1].short) return { rows, complete: true }
  }

  for (; from < max; from += pageSize) {
    const page = await pageOf(build, from, Math.min(pageSize, max - from))
    rows.push(...page.rows)
    if (page.short) return { rows, complete: true }
  }
  return { rows, complete: false }
}

/**
 * How many rows a query selects, without any of them travelling.
 *
 * A count is the one figure that never needs the rows behind it, and asking
 * for it this way is exact however large the table is - so a headline total
 * stays right past any ceiling a breakdown beside it runs into.
 *
 * @param {object} query A query with `count: 'exact', head: true` set.
 * @returns {Promise<number>}
 */
/**
 * Whether an error is Postgres or PostgREST saying a table is absent, which
 * each of them says its own way.
 */
export function tableMissing(error) {
  const code = error?.code || ''
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST106') return true
  return /does not exist|could not find the table/i.test(error?.message || '')
}

/**
 * Whether an error says a column is not in the table, which is what a read
 * ahead of its migration gets back. Postgres and PostgREST each have their
 * own way of saying it.
 */
export function columnMissing(error) {
  const code = error?.code || ''
  if (code === '42703' || code === 'PGRST204') return true
  return /column .* does not exist|could not find the .* column/i.test(error?.message || '')
}

export async function countOf(query) {
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}
