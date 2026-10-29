/**
 * Where businesses come from, behind one shape.
 *
 * A source is whatever finds businesses worth writing to: a sweep of the map,
 * a court docket, a register of filings, a check over sites already on file, a
 * form somebody filled in. Each used to be a program of its own with a timer
 * entry of its own, so adding one meant adding both and remembering to.
 *
 * A source is now `{ id, find }`, and `find` answers rows in one shape:
 *
 *   { source, ref, payload }
 *
 * `source` is what the row is filed under, which is what a chain claims to
 * take that row's businesses. `ref` is the source's own id for the thing -
 * a place id, a docket number, a filing number - so the same thing found twice
 * is one row. `payload` is whatever the row needs.
 *
 * One sweep walks every registered source. A source that fails does not stop
 * the sweep: one refused docket says nothing about the map, and a sweep that
 * stopped at the first failure would be a pipeline one outage could empty.
 * What each source did comes back so the host can record it.
 *
 * Nothing here reaches a network. The sources do, and the host writes them.
 */

/** What a found row has to carry before it is handed on. */
function usable(row) {
  return (
    Boolean(row) &&
    typeof row === 'object' &&
    typeof row.source === 'string' &&
    row.source.length > 0 &&
    typeof row.ref === 'string' &&
    row.ref.length > 0
  )
}

/**
 * The sources a host has, checked and frozen.
 *
 * @param {Array<{id: string, find: Function, source?: string}>} sources
 */
export function createSources(sources) {
  if (!Array.isArray(sources) || !sources.length) {
    throw new TypeError('createSources needs at least one source')
  }
  const faults = []
  const ids = new Set()
  for (const one of sources) {
    if (!one || typeof one !== 'object') {
      faults.push('a source is not an object')
      continue
    }
    if (typeof one.id !== 'string' || !one.id) faults.push('a source has no id')
    else if (ids.has(one.id)) faults.push(`two sources share the id ${one.id}`)
    else ids.add(one.id)
    if (typeof one.find !== 'function') faults.push(`the ${one.id} source has no \`find\``)
  }
  if (faults.length) throw new Error(`the sources are not usable:\n- ${faults.join('\n- ')}`)
  return Object.freeze({
    ids: Object.freeze(sources.map(one => one.id)),
    all: Object.freeze([...sources]),
  })
}

/**
 * One sweep over every source, or over the ones named.
 *
 * @param {object} what
 * @param {{all: ReadonlyArray<object>}} what.sources What `createSources` returned.
 * @param {string[]} [what.only] The ids to sweep, where the caller wants some.
 * @param {object} [what.context] Handed to each `find`, which is where a host
 *   puts its own clients, keys and settings.
 * @returns {Promise<{found: object[], ran: object[]}>} `found` is every usable
 *   row from every source that answered; `ran` says how each source went.
 */
export async function sweep({ sources, only = null, context = {} }) {
  const wanted = only ? sources.all.filter(one => only.includes(one.id)) : sources.all
  const ran = []
  const found = []
  for (const source of wanted) {
    try {
      const rows = (await source.find(context)) ?? []
      const good = rows.filter(usable)
      // A row the source filed under nothing, or with no id of its own, cannot
      // be deduped or claimed by a chain, so it is counted and left rather
      // than written as a business nothing can find again.
      const dropped = rows.length - good.length
      found.push(...good)
      ran.push({ id: source.id, found: good.length, dropped, error: null })
    } catch (cause) {
      // One source failing says nothing about the others. A sweep that stopped
      // here would be a pipeline a single outage could empty.
      ran.push({ id: source.id, found: 0, dropped: 0, error: String(cause?.message ?? cause) })
    }
  }
  return { found, ran }
}

/**
 * The rows a sweep found, with anything found twice reduced to one.
 *
 * Two sources can name the same business - a court docket and the map both
 * know a shop - and the pair that identifies it is its source and that
 * source's own id for it. The first of a pair stands, since the sources are
 * swept in the order the host registered them and that order is its
 * preference.
 */
export function deduped(found) {
  const held = new Map()
  for (const row of found ?? []) {
    const key = `${row.source}:${row.ref}`
    if (!held.has(key)) held.set(key, row)
  }
  return [...held.values()]
}
