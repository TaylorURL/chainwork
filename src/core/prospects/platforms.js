/**
 * The hosts a business does not own, and the reading of a host that decides it.
 *
 * A listing pointing at a Facebook page, a Yelp entry or a Linktree names no
 * site the business controls: the address, the ranking and the shape of the
 * page all belong to whoever runs the platform. Two parts of the project have
 * to agree on that reading. The outreach pipeline uses it to mark a prospect
 * as having no site of its own, which is what routes it past the audit and
 * into the message about a missing site; the console uses it to say the same
 * thing on screen. A second copy of the list is a second answer, so this
 * module is the one both read and carries nothing heavier than strings, which
 * is what lets a browser bundle import it.
 */

/**
 * Booking and ordering platforms.
 *
 * A trade that takes appointments often lists the page a customer books on
 * instead of a site, and that page carries the platform's own support address.
 * Reading one as the business's own site is how a message meant for a barber
 * reaches a scheduling company's help desk.
 */
export const BOOKING_HOSTS = Object.freeze([
  'booksy.com',
  'vagaro.com',
  'styleseat.com',
  'schedulicity.com',
  'fresha.com',
  'setmore.com',
  'squareup.com',
  'square.site',
  'acuityscheduling.com',
  'calendly.com',
  'mindbodyonline.com',
  'clover.com',
  'toasttab.com',
  'opentable.com',
  'doordash.com',
  'ubereats.com',
  'grubhub.com',
  'slicelife.com',
  'myshopify.com',
])

/** Directories somebody else listed the business in. */
export const PORTAL_HOSTS = Object.freeze([
  'yelp.com',
  'angi.com',
  'angieslist.com',
  'thumbtack.com',
  'bbb.org',
  'yellowpages.com',
  // The Houston realtor directory. An agent's listing points at a profile on
  // it, and the profile prints the association's own support address.
  'har.com',
  'business.site',
  'sites.google.com',
])

/**
 * Hosts that belong to a platform rather than to the business listing them.
 *
 * The list grows by one more entry: a host matches itself and everything
 * underneath it, so 'facebook.com' covers m.facebook.com without a second
 * line.
 */
export const PLATFORM_HOSTS = [
  'facebook.com',
  'fb.com',
  'fb.me',
  'instagram.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'linktr.ee',
  'nextdoor.com',
  ...PORTAL_HOSTS,
  ...BOOKING_HOSTS,
  'wixsite.com',
  'weebly.com',
  'godaddysites.com',
]

/** A hostname with its www dropped and its case flattened. */
export function bareHost(host) {
  return String(host ?? '')
    .toLowerCase()
    .replace(/^www\./, '')
}

/** The host a listed website resolves to, tolerating a listing that left the scheme off. */
export function hostOf(website) {
  const value = typeof website === 'string' ? website.trim() : ''
  if (!value) return null
  try {
    return bareHost(new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname)
  } catch {
    return null
  }
}

/** Whether a host is the given one or sits underneath it. */
export const under = (host, root) => host === root || host.endsWith(`.${root}`)

/** The platform a listed host belongs to, or null when the host is the business's own. */
export function platformOf(host) {
  if (!host) return null
  return PLATFORM_HOSTS.find(root => under(host, root)) ?? null
}

/**
 * The name a platform is known by, for a sentence that names one.
 *
 * Keyed on the root host in PLATFORM_HOSTS. A host the list knows and this
 * does not is answered with nothing, and the sentence says "the platform",
 * which is true of all of them.
 */
const PLATFORM_NAMES = {
  'facebook.com': 'Facebook',
  'fb.com': 'Facebook',
  'fb.me': 'Facebook',
  'instagram.com': 'Instagram',
  'tiktok.com': 'TikTok',
  'twitter.com': 'X',
  'x.com': 'X',
  'linkedin.com': 'LinkedIn',
  'linktr.ee': 'Linktree',
  'yelp.com': 'Yelp',
  'angi.com': 'Angi',
  'angieslist.com': 'Angi',
  'thumbtack.com': 'Thumbtack',
  'bbb.org': 'the BBB',
  'nextdoor.com': 'Nextdoor',
  'business.site': 'Google',
  'sites.google.com': 'Google',
  'yellowpages.com': 'Yellow Pages',
  'har.com': 'HAR',
  'booksy.com': 'Booksy',
  'vagaro.com': 'Vagaro',
  'styleseat.com': 'StyleSeat',
  'schedulicity.com': 'Schedulicity',
  'fresha.com': 'Fresha',
  'setmore.com': 'Setmore',
  'squareup.com': 'Square',
  'square.site': 'Square',
  'acuityscheduling.com': 'Acuity',
  'calendly.com': 'Calendly',
  'mindbodyonline.com': 'Mindbody',
  'clover.com': 'Clover',
  'toasttab.com': 'Toast',
  'opentable.com': 'OpenTable',
  'doordash.com': 'DoorDash',
  'ubereats.com': 'Uber Eats',
  'grubhub.com': 'Grubhub',
  'slicelife.com': 'Slice',
  'wixsite.com': 'Wix',
  'weebly.com': 'Weebly',
  'godaddysites.com': 'GoDaddy',
  'myshopify.com': 'Shopify',
}

/** The name of the platform a host belongs to, or null where it has none to give. */
export function platformName(host) {
  const root = platformOf(host)
  return (root && PLATFORM_NAMES[root]) || null
}
