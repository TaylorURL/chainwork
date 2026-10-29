/**
 * Businesses just sued in federal court over their website's accessibility,
 * read off CourtListener's copy of the federal dockets.
 *
 * A suit like this is filed by a blind plaintiff whose screen reader could not
 * use the defendant's site, under nature of suit 446 (Americans with
 * Disabilities - Other). What it leaves the defendant with is a site that has
 * to be brought up to WCAG 2.1 AA, usually on a deadline a settlement sets,
 * which makes a business in that position one that is buying a fix from
 * somebody this month.
 *
 * The search endpoint answers without a token, and it reaches into the text of
 * a complaint wherever the RECAP archive holds one. That is what both reads
 * here lean on. The first asks for 446 suits whose complaint talks about a
 * screen reader and a website, which is the line between a website suit and
 * the far larger number filed over a ramp or a restroom. The second asks one
 * docket for the part of its complaint that names the site, and the snippet
 * that comes back carries the address: "Because Defendant's interactive
 * website, www.example.com, including all portions thereof".
 *
 * A suit whose complaint the archive does not hold matches neither read, so
 * the source only ever files a business whose website the complaint named.
 *
 * Strings and pure functions only, apart from the one fetch helper the job
 * hands in, so the check can read every rule here without the network.
 */

/** What `outreach_prospects.source` says on a row filed from a lawsuit. */
export const LAWSUIT_SOURCE = 'courtlistener'

export const SEARCH_ENDPOINT = 'https://www.courtlistener.com/api/rest/v4/search/'
const SITE = 'https://www.courtlistener.com'

/** Americans with Disabilities - Other, the nature of suit a Title III website case files under. */
export const NATURE_OF_SUIT = '446'

/**
 * The words that make a 446 suit a website suit. The screen reader is what
 * every one of these complaints is built on, and requiring the website beside
 * it keeps out the suits over a building whose complaint mentions a site in
 * passing.
 */
export const WEBSITE_SUIT_QUERY =
  '("screen reader" OR "screen-reader" OR "screen-reading" OR "screen reading" OR WCAG) AND (website OR "web site")'

/**
 * Hosts a complaint names that are never the defendant's: the standard, the
 * government's guidance, the court and the tools the complaint cites.
 */
const NOT_THE_DEFENDANT = [
  'w3.org',
  'ada.gov',
  'justice.gov',
  'uscourts.gov',
  'courtlistener.com',
  'pacer.gov',
  'section508.gov',
  'nvaccess.org',
  'freedomscientific.com',
  'apple.com',
  'microsoft.com',
  'google.com',
  'webaim.org',
]

/** The search URL for website suits filed on or after a day. */
export function suitsUrl(filedAfter) {
  const params = new URLSearchParams({
    type: 'r',
    nature_of_suit: NATURE_OF_SUIT,
    q: WEBSITE_SUIT_QUERY,
    filed_after: filedAfter,
    order_by: 'dateFiled desc',
  })
  return `${SEARCH_ENDPOINT}?${params}`
}

/**
 * The search URL that asks one docket for the words around the site's address.
 * `www` and a scheme first, since the domain alone matches "e-commerce" as
 * readily as it matches the site.
 */
export function siteUrl(docketId, terms = '(www OR https OR http)') {
  const params = new URLSearchParams({
    type: 'r',
    q: `docket_id:${docketId} AND ${terms}`,
    highlight: 'on',
  })
  return `${SEARCH_ENDPOINT}?${params}`
}

/** The fallback terms for a complaint that wrote the address bare. */
export const BARE_DOMAIN_TERMS = '(com OR org OR net OR co OR us)'

/**
 * The defendant a case is named for, read off its caption.
 *
 * "Doe v. Riverside Dance Studio, Inc." is plaintiff, then defendant. A caption
 * naming more than one ends on "et al." or "et, al.", which is dropped, since
 * the business the letter is written to is the one named first.
 */
export function defendantOf(caseName) {
  const caption = String(caseName ?? '')
  const at = caption.search(/\s+v\.?\s+/i)
  if (at < 0) return null
  const rest = caption.slice(at).replace(/^\s+v\.?\s+/i, '')
  const name = rest
    .replace(/[,\s]*et[,.\s]*al\.?\s*$/i, '')
    .replace(/[\s,]+$/, '')
    // The full stop an abbreviation ends on stays; one left over from the
    // caption's own punctuation goes.
    .replace(/(?<!\b(?:Inc|Co|Corp|Ltd|Bros))\.$/, '')
    .trim()
  return name || null
}

/**
 * The defendant's site, read out of a highlighted snippet of its complaint.
 *
 * The snippet marks the matched term inside the address, as in
 * `<mark>www</mark>.soapworks.<mark>example</mark>`, so the marks come out before
 * anything is read. The first host that is not one of the references every
 * complaint cites is the site, and it is returned as an https origin.
 */
export function websiteIn(snippet) {
  const text = String(snippet ?? '')
    .replace(/<\/?mark>/gi, '')
    .replace(/\s+/g, ' ')
  const hosts = text.matchAll(
    /(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?![a-z0-9-])/gi
  )
  for (const match of hosts) {
    const host = match[1].toLowerCase()
    // A word run into a full stop reads as a host ("Defendant.The"), so a
    // host has to have been written as one: a scheme, a www, or a known ending.
    const written =
      /^(?:https?:\/\/|www\.)/i.test(match[0]) ||
      /\.(?:com|org|net|co|us|shop|store|biz|info|nyc|io)$/.test(host)
    if (!written) continue
    if (NOT_THE_DEFENDANT.some(known => host === known || host.endsWith(`.${known}`))) continue
    return `https://${host}`
  }
  return null
}

/** The first snippet on a docket's matched documents that names a site. */
export function websiteOfResult(result) {
  for (const document of result?.recap_documents ?? []) {
    const site = websiteIn(document?.snippet)
    if (site) return site
  }
  return null
}

/**
 * Whether a home page is a Shopify store.
 *
 * A Shopify store keeps its theme on Shopify's own CDN and sets `Shopify` on
 * the window, and both show in the page it serves whatever domain it is on. A
 * store's fix is inside its Shopify theme rather than a rebuild, which is not
 * the work the studio sells, so a store is filed as skipped rather than
 * written to.
 */
export function isShopify(html) {
  return /cdn\.shopify\.com|shopify\.theme|window\.Shopify\b|myshopify\.com/i.test(
    String(html ?? '')
  )
}

/**
 * Whether what a site's DNS answers is Shopify's.
 *
 * A Shopify store answers an unfamiliar visitor with a rate-limit page far more
 * often than with its own, and that page carries none of the markers
 * `isShopify` reads, so a store read by its page alone passes as a site that
 * can be rebuilt. Its DNS cannot be turned away: a store's `www` points at
 * `shops.myshopify.com` or its own `*.myshopify.com`, and an apex it serves
 * resolves into Shopify's 23.227.38.0/24.
 *
 * @param {{cnames?: string[], addresses?: string[]}} answer What the host resolved to.
 */
export function isShopifyDns({ cnames = [], addresses = [] } = {}) {
  return (
    cnames.some(name => /(?:^|\.)myshopify\.com\.?$/i.test(String(name))) ||
    addresses.some(address => String(address).startsWith('23.227.38.'))
  )
}

/**
 * Whether a site's `/cart.js` is Shopify's cart.
 *
 * Every Shopify store serves its cart as JSON at that path, and a store behind
 * Cloudflare, whose DNS names Cloudflare rather than Shopify, still answers it.
 * No other platform serves a cart there in that shape.
 */
export function isShopifyCart(body) {
  try {
    const cart = JSON.parse(String(body ?? ''))
    return Boolean(cart && typeof cart.token === 'string' && 'item_count' in cart)
  } catch {
    return false
  }
}

/** Why a store is skipped, in the words the console shows. */
export const SHOPIFY_REASON = 'Runs on Shopify, so the fix is in its theme rather than a rebuild.'

/**
 * One suit as a prospect row, or null where the caption names no defendant.
 *
 * The docket id is the row's identity: `source_ref` beside `source`, which the
 * table holds unique, so a suit read again on the next run is the same row.
 */
export function prospectOfSuit(result, website) {
  const name = defendantOf(result?.caseName)
  if (!result?.docket_id || !name) return null
  const path = result.docket_absolute_url ?? `/docket/${result.docket_id}/`
  return {
    source: LAWSUIT_SOURCE,
    source_ref: String(result.docket_id),
    name,
    website: website ?? null,
    case_name: result.caseName ?? null,
    case_number: result.docketNumber ?? null,
    case_court: result.court ?? null,
    case_filed_on: result.dateFiled ?? null,
    case_url: `${SITE}${path}`,
  }
}

/**
 * The court as a letter would name it: "the Southern District of New York"
 * rather than CourtListener's "District Court, S.D. New York".
 */
export function courtPhrase(court) {
  const text = String(court ?? '').trim()
  const sided = text.match(/^District Court,\s*([NSEWCM])\.\s*D\.\s*(.+)$/i)
  if (sided) {
    const sides = {
      N: 'Northern',
      S: 'Southern',
      E: 'Eastern',
      W: 'Western',
      C: 'Central',
      M: 'Middle',
    }
    return `the ${sides[sided[1].toUpperCase()]} District of ${sided[2].trim()}`
  }
  const whole = text.match(/^District Court,\s*D\.\s*(.+)$/i)
  if (whole) return `the District of ${whole[1].trim()}`
  return 'federal court'
}
