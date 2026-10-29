/**
 * What built a site, read off the page it serves.
 *
 * A business on a page builder it has outgrown, or on one whose studio has
 * closed, has a live need and nobody defending the relationship. The page
 * usually says which builder made it, in a tag browsers ignore and nobody
 * edits.
 *
 * Only the builders worth a letter are listed. A site on a builder that is
 * perfectly good for a small business is not a lead, and reading it as one
 * would be a letter arguing with a decision somebody made on purpose.
 */

/** The builders a letter is worth writing about, and how a page gives each away. */
export const BUILDERS = Object.freeze([
  { id: 'wix', name: 'Wix', marks: ['wix.com', 'X-Wix-', 'wixstatic.com', '_wixCIDX'] },
  { id: 'weebly', name: 'Weebly', marks: ['weebly.com', 'weeblycloud', '__weebly'] },
  { id: 'godaddy', name: 'GoDaddy Website Builder', marks: ['godaddysites.com', 'wsimg.com'] },
  {
    id: 'squarespace-5',
    name: 'Squarespace 5',
    marks: ['squarespace.com/universal/scripts-compressed/sqs-5'],
  },
  { id: 'homestead', name: 'Homestead', marks: ['homestead.com', 'homesteadcloud.com'] },
  { id: 'yola', name: 'Yola', marks: ['yolasite.com'] },
  { id: 'webs', name: 'Webs.com', marks: ['webs.com', 'websimages.com'] },
  { id: 'sitebuilder', name: 'SiteBuilder', marks: ['sitebuilder.com', 'sitelio.com'] },
  { id: 'frontpage', name: 'Microsoft FrontPage', marks: ['FrontPage', '_vti_bin'] },
  { id: 'dreamweaver', name: 'Adobe Dreamweaver', marks: ['Adobe Dreamweaver', 'Adobe GoLive'] },
])

/**
 * Builders that are a reasonable place for a small business to be, so a site
 * on one of them is not a lead.
 *
 * The page builders matter as much as the platforms. A real run over fourteen
 * of the studio's own rows found a site whose generator tag said 'Elementor'
 * rather than 'WordPress', and without that name here it read as a site worth
 * replacing - a letter telling somebody on a perfectly good setup that their
 * site was built on something old. Divi, Beaver Builder, WPBakery and Oxygen
 * are the same shape of mistake waiting to happen.
 */
export const LEFT_ALONE = Object.freeze([
  'Squarespace',
  'Shopify',
  'Webflow',
  'WordPress',
  'WooCommerce',
  'Elementor',
  'Divi',
  'Beaver Builder',
  'WPBakery',
  'Oxygen',
  'Bricks',
  'Drupal',
  'Ghost',
  'Hugo',
  'Next.js',
  'Astro',
  'Gatsby',
])

/** Whose mark is in a page, or null where none is. */
export function builderIn(html) {
  const page = String(html ?? '')
  if (!page) return null
  for (const builder of BUILDERS) {
    if (builder.marks.some(mark => page.includes(mark))) return builder
  }
  return null
}

/** How much of a generator tag is the product's name, before its own notes. */
const GENERATOR_MAX = 40

/**
 * What a page says made it, read off the generator tag, or null.
 *
 * Only the product and its version. A generator tag often carries the
 * builder's own notes after a semicolon - the features it has on, the way it
 * prints its stylesheets - and a letter that quoted the lot would read as a
 * machine reciting a page's source back at somebody. The real run that found
 * this read 'Elementor 3.33.4; features: additional_custom_breakpoints;
 * settings: css_print_method-external, google_font-enabled, font_display-auto'.
 */
export function generatorIn(html) {
  const found = String(html ?? '').match(
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i
  )
  if (!found) return null
  const said = found[1].split(';')[0].trim()
  return said ? said.slice(0, GENERATOR_MAX).trim() : null
}

/**
 * Who built the site, read off the footer credit, or null.
 *
 * A footer credit names a studio rather than a builder, which is the other
 * half of this trigger: a business whose studio has closed has nobody looking
 * after its site and no relationship to displace.
 */
export function creditIn(html) {
  const page = String(html ?? '')
  // The words a footer uses, then the name. The name has to start with a
  // capital and may carry the punctuation a company name carries, which is
  // what keeps "site by the owner" out of it.
  const found = page.match(
    /\b(?:site|website|design(?:ed)?|develop(?:ed)?|built|made|created)\s+(?:and\s+\w+\s+)?(?:by|:)\s*(?:<[^>]*>\s*)*([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3})/i
  )
  if (!found) return null
  const name = found[1].trim()
  // A single lower-case word after "by" is a sentence rather than a studio.
  return /^[A-Z]/.test(name) ? name : null
}

/**
 * What is worth writing to this business about, or null where nothing is.
 *
 * @param {string} html The page it serves.
 * @returns {{fault: string, says: string, builder: string|null, credit: string|null}|null}
 */
export function builderFaultOf(html) {
  const builder = builderIn(html)
  const generator = generatorIn(html)
  const credit = creditIn(html)

  if (builder) {
    return {
      fault: 'old-builder',
      says: `the site is built on ${builder.name}`,
      builder: builder.name,
      credit,
    }
  }
  if (generator && !LEFT_ALONE.some(one => generator.toLowerCase().includes(one.toLowerCase()))) {
    return {
      fault: 'old-builder',
      says: `the site says it was built with ${generator}`,
      builder: generator,
      credit,
    }
  }
  return null
}

/**
 * The source that files the sites built on something worth replacing.
 *
 * @param {{id?: string, source?: string, rows: Function, read: Function}} what
 *   `read` is handed a website and answers its page, which is what lets this
 *   be exercised without a network.
 */
export function builderSource({ id = 'builder', source = 'builder', rows, read }) {
  if (typeof rows !== 'function') throw new TypeError('builderSource needs `rows`')
  if (typeof read !== 'function') throw new TypeError('builderSource needs `read`')
  return {
    id,
    async find(context = {}) {
      const now = context.now instanceof Date ? context.now : new Date()
      const found = []
      for (const row of (await rows(context)) ?? []) {
        if (!row?.website) continue
        let page = null
        try {
          page = await read(row.website, context)
        } catch {
          // A site that would not answer is the broken-site chain's business,
          // not this one's.
          continue
        }
        const fault = builderFaultOf(page)
        if (!fault) continue
        found.push({
          source,
          ref: String(row.id ?? row.website),
          payload: { ...fault, website: row.website, checked_at: now.toISOString() },
        })
      }
      return found
    },
  }
}
