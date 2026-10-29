/**
 * What a PageSpeed score means, said the same way wherever it is said.
 *
 * A score on its own is a number a reader has no scale for. The band is the
 * scale, and the sentence beside it is the part that survives the number
 * moving: a report run twice comes back a few points apart and lands in the
 * same band both times, which is why the band is what anything here argues
 * from.
 *
 * The three band names are keys elsewhere — the message's own palette is keyed
 * on them — so they are strings rather than an ordering, and `plain` is the
 * fourth for a reading that has no number in it at all.
 */

/** Where Google's good band starts, on every category the report scores. */
export const GOOD_FLOOR = 90

/** Where Google's poor band ends. */
export const FAIR_FLOOR = 50

/**
 * Every category the report scores, against the column holding it. Their
 * order is the report's own.
 */
export const CATEGORIES = [
  { column: 'audit_score', label: 'Performance' },
  { column: 'accessibility_score', label: 'Accessibility' },
  { column: 'best_practices_score', label: 'Best Practices' },
  { column: 'seo_score', label: 'SEO' },
]

/** Which of the three bands a PageSpeed score falls in, or none at all. */
export function bandOf(score) {
  if (typeof score !== 'number') return 'plain'
  if (score < FAIR_FLOOR) return 'poor'
  if (score < GOOD_FLOOR) return 'fair'
  return 'good'
}

/** What one PageSpeed score means, in a sentence the reader can check. */
export function verdict(score) {
  if (typeof score !== 'number') {
    return 'Google has not managed to put a number on it yet, which is usually a sign of its own.'
  }
  if (score < FAIR_FLOOR) {
    return 'Anything under 50 is what Google files as poor, which is where people on a phone start giving up before the page finishes.'
  }
  if (score < GOOD_FLOOR) {
    return 'Google files that as needs improvement, which leaves it short of the good band that starts at 90.'
  }
  return 'That already sits in the band Google calls good, which most small business sites never reach.'
}

/**
 * The categories a reading falls short on.
 *
 * A category in the good band argues against the reading being about a fault:
 * it says the site is fine there and whoever is quoting it is padding, and a
 * reader who runs the report finds a hundred sitting next to a complaint about
 * it. So only what falls short is shown, and a category the report answered
 * nothing for is not shown either, since a row measured before the audit asked
 * for all four has a performance figure and no reading for the rest.
 *
 * @param {object} row Anything carrying the four score columns.
 * @param {string} [lead] The column the reading is about, which is the one
 *   left out. Performance unless a letter says otherwise.
 * @returns {Array<{label: string, value: string}>} What the block shows.
 */
export function supporting(row, lead = 'audit_score') {
  return CATEGORIES.filter(
    entry =>
      entry.column !== lead &&
      typeof row[entry.column] === 'number' &&
      row[entry.column] < GOOD_FLOOR
  ).map(entry => ({
    label: entry.label,
    value: String(row[entry.column]),
  }))
}

/** Google's own page for the test, which opens on a reading when handed an address. */
const PAGESPEED = 'https://pagespeed.web.dev/analysis'

/**
 * Where a reading can be taken again, and what about it holds when it is.
 *
 * A stranger quoting a figure is making a claim; a stranger handing over the
 * link that runs Google's own test on the reader's own address is making one
 * the reader can settle in half a minute without typing anything. The link
 * shows its real host as its text, because a link that reads one way and goes
 * another is the shape of the thing this note exists to not look like. The
 * band is what the reading argues from and the band is the part that holds, so
 * the note says which of the two moves before anybody runs it and gets four
 * points out.
 *
 * @param {string} website The address the reading was taken on.
 * @returns {{label: string, meta: string, lead: string, href: string, link: string, tail: string}}
 */
export function verify(website) {
  const href = `${PAGESPEED}?url=${encodeURIComponent(website)}&form_factor=mobile`
  return {
    label: 'Check It Yourself',
    meta: 'Google PageSpeed Insights',
    lead: "The score is Google's, from its free PageSpeed Insights test. Run it on your own site at",
    href,
    link: 'pagespeed.web.dev',
    tail: "It opens with your address already filled in. The number moves a few points between runs, and the band it lands in doesn't.",
  }
}
