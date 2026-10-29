/**
 * The map the call screen draws for a business: what it is asked to find, and
 * the address of a frame that draws it.
 *
 * Strings and pure functions only, so the console's bundle and the checks read
 * the same two answers.
 */

/**
 * What the map is asked to find for a business, or null where nothing on the
 * row says where it is.
 *
 * The name goes in with the address because the business came off a Google
 * listing, and the two together find that listing rather than a bare point on
 * the street: the map opens on the business's own pin, under its own name. A
 * row with no address falls back on its town, which still puts the business in
 * the right part of the map.
 *
 * @param {object} row A business as the list draws it.
 * @returns {string|null}
 */
export function mapQuery(row) {
  const where = row?.address || (row?.town ? `${row.town}, TX` : '')
  return where ? [row.name, where].filter(Boolean).join(', ') : null
}

/**
 * The address of a map that can be drawn in a frame, for a query from `mapQuery`.
 *
 * Google's embed answers this form without a key, which is why it is used over
 * the Maps Embed API: the Places key stays on the server, and nothing in the
 * console's bundle could be lifted and billed.
 *
 * @param {string} query
 */
export function mapFrameHref(query) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`
}
