/**
 * What is missing from a business's map listing.
 *
 * A letter about one named fault on somebody's own listing beats a letter
 * about a score, because the reader can check it in ten seconds and it is
 * theirs. Every fault here is read off columns a map sweep already stores, so
 * the trigger costs nothing at the map and needs no second account anywhere.
 *
 * ## The order
 *
 * A listing with several faults is written to about the one the owner would
 * fix first, which is the one a customer notices: no site at all, then no
 * photographs, then no reviews. A listing marked closed that is not closed is
 * ahead of all of them, because it is the one fault that is actively losing
 * the business its customers.
 *
 * ## What is not a fault
 *
 * A listing that is genuinely closed is not a lead. Neither is one nobody has
 * swept properly - a row with no review count at all has not been read rather
 * than having no reviews, and writing to it would be a letter about a figure
 * nobody has.
 */

/** Photographs below which a listing reads as having none worth showing. */
export const PHOTOS_EXPECTED = 3

/** Reviews below which a listing reads as having nothing to show. */
export const REVIEWS_EXPECTED = 5

/** The faults, worst first, which is the order they are reported in. */
export const LISTING_FAULTS = Object.freeze(['marked-closed', 'no-site', 'no-photos', 'no-reviews'])

const photosOn = row => {
  const held = row?.place_photos
  if (Array.isArray(held)) return held.length
  if (Array.isArray(held?.photos)) return held.photos.length
  return null
}

/**
 * What is wrong with one listing, or null where nothing is.
 *
 * @param {object} row A business as a map sweep stores it.
 * @returns {{fault: string, says: string}|null}
 */
export function listingFaultOf(row) {
  const status = String(row?.business_status ?? '').toUpperCase()
  if (status === 'PERMANENTLY_CLOSED') return null
  if (status === 'CLOSED_TEMPORARILY') {
    return {
      fault: 'marked-closed',
      says: 'the Google listing says the business is temporarily closed',
    }
  }

  if (!row?.website) {
    return { fault: 'no-site', says: 'the Google listing has no website on it' }
  }

  const photos = photosOn(row)
  if (photos !== null && photos < PHOTOS_EXPECTED) {
    return {
      fault: 'no-photos',
      says:
        photos === 0
          ? 'the Google listing has no photographs on it'
          : `the Google listing has ${photos} ${photos === 1 ? 'photograph' : 'photographs'} on it`,
    }
  }

  const reviews = row?.rating_count
  // A row with no count has not been read, which is a different thing from a
  // business with no reviews. Writing to it would name a figure nobody has.
  if (Number.isInteger(reviews) && reviews < REVIEWS_EXPECTED) {
    return {
      fault: 'no-reviews',
      says:
        reviews === 0
          ? 'the Google listing has no reviews on it'
          : `the Google listing has ${reviews} ${reviews === 1 ? 'review' : 'reviews'} on it`,
    }
  }

  return null
}

/**
 * The source that files the listings with something missing.
 *
 * @param {{id?: string, source?: string, rows: Function}} what
 */
export function listingSource({ id = 'listing', source = 'listing', rows }) {
  if (typeof rows !== 'function') {
    throw new TypeError('listingSource needs `rows`, which answers the listings to read')
  }
  return {
    id,
    async find(context = {}) {
      const now = context.now instanceof Date ? context.now : new Date()
      const found = []
      for (const row of (await rows(context)) ?? []) {
        const fault = listingFaultOf(row)
        if (!fault) continue
        found.push({
          source,
          ref: String(row.id ?? row.place_id ?? ''),
          payload: { ...fault, checked_at: now.toISOString() },
        })
      }
      return found.filter(one => one.ref)
    },
  }
}
