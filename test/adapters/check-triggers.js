/**
 * The triggers the new chains fire on, and what each refuses to fire on.
 *
 * Every one of these reads columns a map sweep already stores or a page the
 * site already serves, so none of them needs a second account anywhere. The
 * checks worth reading are the refusals: a trigger that fires too readily
 * produces a letter telling somebody something untrue about their own
 * business, which costs more than the letter was worth.
 */

import { listingFaultOf, listingSource } from '../../src/adapters/listing/judge.js'
import {
  builderFaultOf,
  builderIn,
  builderSource,
  creditIn,
  generatorIn,
} from '../../src/adapters/builder/judge.js'
import { growthOf, growthSource } from '../../src/adapters/growth/judge.js'
import {
  RESTS_FOR_DAYS,
  reactivationOf,
  reactivationSource,
} from '../../src/adapters/reactivation/judge.js'
import { createSources, sweep } from '../../src/engine/sources.js'
import { cases, check, finish, ok, refusal, same } from '../harness/checks.js'

const NOW = new Date('2026-10-28T12:00:00Z')
const ago = days => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
const sound = { id: 'a', website: 'a.test', place_photos: [1, 2, 3], rating_count: 40 }

// ── A listing with something missing ────────────────────────────────────

check('a listing with no website is the strongest of these', () =>
  same(listingFaultOf({ ...sound, website: null }).fault, 'no-site', 'the fault')
)

check('a listing with too few photographs is a fault, and counts them', () => {
  same(
    listingFaultOf({ ...sound, place_photos: [] }).says,
    'the Google listing has no photographs on it',
    'none'
  )
  same(
    listingFaultOf({ ...sound, place_photos: [1] }).says,
    'the Google listing has 1 photograph on it',
    'one'
  )
})

check('a listing with too few reviews is a fault, and counts them', () => {
  same(
    listingFaultOf({ ...sound, rating_count: 0 }).says,
    'the Google listing has no reviews on it',
    'none'
  )
  same(
    listingFaultOf({ ...sound, rating_count: 1 }).says,
    'the Google listing has 1 review on it',
    'one'
  )
})

check('a listing marked temporarily closed is read first of all', () =>
  same(
    listingFaultOf({ ...sound, website: null, business_status: 'CLOSED_TEMPORARILY' }).fault,
    'marked-closed',
    'the fault'
  )
)

check('a sound listing is no fault', () => same(listingFaultOf(sound), null, 'the fault'))

check('a business that is genuinely closed is not a lead', () =>
  same(
    listingFaultOf({ ...sound, website: null, business_status: 'PERMANENTLY_CLOSED' }),
    null,
    'the fault'
  )
)

check('a listing nobody has read properly is not called empty', () => {
  // No review count at all means the sweep has not read it, which is a
  // different thing from a business with no reviews.
  same(listingFaultOf({ ...sound, rating_count: null }), null, 'no count at all')
  same(
    listingFaultOf({ ...sound, place_photos: null, rating_count: 40 }),
    null,
    'no photo list at all'
  )
})

check('the listing source files only the listings with something missing', async () => {
  const source = listingSource({ rows: async () => [sound, { ...sound, id: 'b', website: null }] })
  const found = await source.find({ now: NOW })
  same(found.map(one => one.ref).join(' '), 'b', 'the listings filed')
  same(found[0].source, 'listing', 'the source')
})

// ── A site on a builder worth replacing ─────────────────────────────────

check('a builder is found by the mark it leaves in the page', () => {
  same(builderIn('<script src="//static.wixstatic.com/a.js">').name, 'Wix', 'Wix')
  same(builderIn('<link href="//cdn2.editmysite.com/weebly.com/x.css">').name, 'Weebly', 'Weebly')
  same(builderIn('<img src="//img1.wsimg.com/x.png">').name, 'GoDaddy Website Builder', 'GoDaddy')
  same(builderIn('<p>a plain hand-written page</p>'), null, 'nothing')
})

check('a page that says what made it is read', () =>
  same(
    generatorIn('<meta name="generator" content="Joomla! 1.5" />'),
    'Joomla! 1.5',
    'the generator'
  )
)

check('a builder a small business is fine on is left alone', () => {
  for (const one of [
    'WordPress 6.4',
    'Squarespace',
    'Shopify',
    'Webflow',
    'WooCommerce 9.1',
    // A real run over the studio's own rows read this one and called the site
    // worth replacing, which would have been a letter telling somebody on a
    // perfectly good setup that their site was old.
    'Elementor 3.33.4; features: additional_custom_breakpoints; settings: css_print_method-external',
    'Divi v.4.27',
    'Bricks 1.9',
  ]) {
    same(builderFaultOf(`<meta name="generator" content="${one}">`), null, one)
  }
})

check('a generator tag is read down to the product, not its own notes', () => {
  same(
    generatorIn('<meta name="generator" content="Joomla! 1.5; features: a, b; settings: c">'),
    'Joomla! 1.5',
    'the product'
  )
  const long = 'A'.repeat(200)
  ok(
    generatorIn(`<meta name="generator" content="${long}">`).length <= 40,
    'a very long generator tag was quoted whole'
  )
})

check('a builder worth replacing is a fault, and says which', () => {
  const fault = builderFaultOf('<script src="//static.wixstatic.com/a.js">')
  same(fault.fault, 'old-builder', 'the fault')
  same(fault.says, 'the site is built on Wix', 'what it says')
})

check('who built the site is read off the footer where it is printed', () =>
  same(creditIn('<footer>Site by Harbor Creative</footer>'), 'Harbor Creative', 'the credit')
)

check('a page that says nothing about what made it is no fault', () =>
  same(builderFaultOf('<html><body><h1>A Shop</h1></body></html>'), null, 'the fault')
)

check('the builder source skips a site that would not answer', async () => {
  const source = builderSource({
    rows: async () => [
      { id: 'wix', website: 'wix.test' },
      { id: 'down', website: 'down.test' },
    ],
    read: async url => {
      if (url.includes('down')) throw new Error('socket hang up')
      return '<script src="//static.wixstatic.com/a.js">'
    },
  })
  const found = await source.find({ now: NOW })
  // A site that will not answer is the broken-site chain's business, not this one's.
  same(found.map(one => one.ref).join(' '), 'wix', 'the sites filed')
})

check('the builder source needs to be told how to read a page', async () =>
  ok(await refusal(() => builderSource({ rows: async () => [] })), 'it was built with no reader')
)

// ── A business whose reviews are moving ─────────────────────────────────

check('a business that has gained reviews quickly is a lead, and says how many', () => {
  const growth = growthOf({ rating_count: 18, rating_count_first: 6, created_at: ago(92) }, NOW)
  same(growth.gained, 12, 'the reviews gained')
  same(growth.says, 'the business has gained 12 Google reviews in the last 92 days', 'what it says')
})

check('a large business that gained the same number is not growing', () =>
  same(
    growthOf({ rating_count: 412, rating_count_first: 400, created_at: ago(92) }, NOW),
    null,
    'the growth'
  )
)

check('a business that gained a handful is not growing', () =>
  same(
    growthOf({ rating_count: 9, rating_count_first: 1, created_at: ago(92) }, NOW),
    null,
    'the growth'
  )
)

check('a business with only one count has not been read twice', () => {
  same(growthOf({ rating_count: 40, rating_count_first: null }, NOW), null, 'no first count')
  same(growthOf({ rating_count: null, rating_count_first: 6 }, NOW), null, 'no count now')
})

check('a business filed with no reviews and now with plenty is growing', () =>
  same(
    growthOf({ rating_count: 14, rating_count_first: 0, created_at: ago(40) }, NOW).gained,
    14,
    'gained'
  )
)

check('the growth source files only the businesses that are moving', async () => {
  const source = growthSource({
    rows: async () => [
      { id: 'moving', rating_count: 18, rating_count_first: 6, created_at: ago(92) },
      { id: 'still', rating_count: 412, rating_count_first: 400, created_at: ago(92) },
    ],
  })
  same((await source.find({ now: NOW })).map(one => one.ref).join(' '), 'moving', 'filed')
})

// ── A business worth asking again ───────────────────────────────────────

check('a business put aside long enough ago is worth asking again, and says why', () => {
  const again = reactivationOf({ id: 'a', stage: 'unreachable', updated_at: ago(300) }, NOW)
  same(again.says, 'the site would not answer and no address was found', 'what it says')
  same(again.days, 300, 'the days')
})

check('each reason a business was put aside has its own words', () => {
  same(
    reactivationOf({ stage: 'skipped', updated_at: ago(300), skip_rule: 'a rule' }, NOW).says,
    'a rule put the business aside',
    'skipped'
  )
  same(
    reactivationOf({ stage: 'contacted', contacted_at: ago(300) }, NOW).says,
    'the business was written to and never replied',
    'contacted'
  )
})

check('a business put aside recently is left alone', () =>
  same(
    reactivationOf({ stage: 'unreachable', updated_at: ago(RESTS_FOR_DAYS - 10) }, NOW),
    null,
    'the answer'
  )
)

check('a business that replied is never asked again', () =>
  same(
    reactivationOf({ stage: 'contacted', contacted_at: ago(300), replied_at: ago(290) }, NOW),
    null,
    'the answer'
  )
)

check('a business that asked to stop is never asked again', () => {
  same(
    reactivationOf({ stage: 'contacted', contacted_at: ago(300), unsubscribed_at: ago(290) }, NOW),
    null,
    'unsubscribed'
  )
  same(
    reactivationOf({ stage: 'contacted', contacted_at: ago(300), suppressed: true }, NOW),
    null,
    'suppressed'
  )
})

check('a business whose address does not exist is never asked again', () =>
  same(
    reactivationOf({ stage: 'contacted', contacted_at: ago(300), bounced_at: ago(290) }, NOW),
    null,
    'the answer'
  )
)

check('a business somebody took out by hand stays out', () => {
  // A reason a rule composed can be revisited; a person's own sentence cannot.
  same(
    reactivationOf(
      { stage: 'skipped', updated_at: ago(300), skip_reason: 'owner is a friend' },
      NOW
    ),
    null,
    'by hand'
  )
  ok(
    reactivationOf(
      { stage: 'skipped', updated_at: ago(300), skip_reason: 'a chain', skip_rule: 'chain_domain' },
      NOW
    ),
    'a rule’s own reason was not revisited'
  )
})

check('a business at a stage this does not pick up from is left alone', () => {
  for (const stage of ['found', 'enriched', 'replied', 'anything-else']) {
    same(reactivationOf({ stage, updated_at: ago(300) }, NOW), null, stage)
  }
})

// ── All four behind one sweep ───────────────────────────────────────────

check('every trigger plugs into one sweep', async () => {
  const sources = createSources([
    listingSource({ rows: async () => [{ id: 'l', website: null }] }),
    builderSource({
      rows: async () => [{ id: 'b', website: 'b.test' }],
      read: async () => '<script src="//static.wixstatic.com/a.js">',
    }),
    growthSource({
      rows: async () => [{ id: 'g', rating_count: 18, rating_count_first: 6, created_at: ago(92) }],
    }),
    reactivationSource({
      rows: async () => [{ id: 'r', stage: 'unreachable', updated_at: ago(300) }],
    }),
  ])
  const swept = await sweep({ sources, context: { now: NOW } })
  same(
    swept.found.map(one => one.source).join(' '),
    'listing builder growing reactivation',
    'the sources'
  )
  same(swept.ran.filter(one => one.error).length, 0, 'the sources that failed')
})

await finish({ hint: 'src/adapters holds the triggers; a chain file holds the words.' })

console.log(`triggers: ${cases.length} checks passed`)
