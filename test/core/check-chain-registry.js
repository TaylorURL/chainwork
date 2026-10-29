/**
 * The registry derived from the manifests, letter for letter.
 *
 * Two things are being proved. The first is that the ids the manifests produce
 * are the ids TaylorURL already stores on live messages: a derivation that
 * renamed one would detach every message ever sent under it from the letter
 * that sent it. The second is that the chain a letter belongs to is looked up
 * rather than guessed from a word in its name, which is what the studio's
 * report did and what breaks the moment a second chain shares a word.
 */

import { defineChain, fromCode } from '../../src/core/chains/manifest.js'
import { createChains } from '../../src/core/chains/registry.js'
import {
  BROKEN_SITE,
  FIVE,
  FOUR,
  INTRODUCTION,
  LAWSUIT,
  SEGMENTS,
  segmentOf,
} from '../fixtures/chains.js'
import { cases, check, finish, ok, refusal, same } from '../harness/checks.js'

const words = fromCode(() => ({ subject: 's', paragraphs: ['p'] }))
const built = createChains({ chains: FOUR, segments: SEGMENTS, segmentOf })

// ── The ids the studio already stores ───────────────────────────────────

/** Exactly what TaylorURL's hand-written registry produced, in its order. */
const STUDIO_IDS = [
  'scored-intro',
  'social-intro',
  'unmeasured-intro',
  'scored-intro-meeting',
  'social-intro-meeting',
  'unmeasured-intro-meeting',
  'scored-lawsuit',
  'social-lawsuit',
  'unmeasured-lawsuit',
  'scored-lawsuit-follow-up',
  'social-lawsuit-follow-up',
  'unmeasured-lawsuit-follow-up',
]

check("the two cold chains derive the studio's own ids, in its own order", () => {
  const cold = createChains({
    chains: [INTRODUCTION, LAWSUIT],
    segments: SEGMENTS,
    segmentOf,
  })
  same(cold.letters.map(one => one.id).join('\n'), STUDIO_IDS.join('\n'), 'ids')
})

check('a step is registered once per segment', () => {
  const perStep = FOUR.reduce((sum, chain) => sum + chain.steps.length, 0)
  same(built.letters.length, perStep * SEGMENTS.length, 'letters')
})

check('every letter carries the chain it came from', () =>
  same(
    built.letters.every(one => built.chainById(one.chain) !== null),
    true,
    'letters with a known chain'
  )
)

check("every letter carries its step's day and channel", () => {
  const meeting = built.letters.find(one => one.id === 'scored-intro-meeting')
  same(meeting.at, 14, 'at')
  same(meeting.channel, 'email', 'channel')
  same(meeting.step, 2, 'step')
})

check("a letter takes its chain's family, not its chain's id", () => {
  const intro = built.letters.find(one => one.id === 'scored-intro')
  same(intro.family, 'introduction', 'family')
  same(built.familyOf(intro), 'introduction', 'familyOf')
})

check("a letter takes its chain's source", () => {
  same(built.letters.find(one => one.id === 'scored-intro').source, null, 'intro source')
  same(built.letters.find(one => one.id === 'scored-lawsuit').source, 'lawsuits', 'lawsuit source')
})

check('a step that needs a column passes that need to its letters', () =>
  same(
    built.letters.find(one => one.id === 'scored-lawsuit').needs.join(','),
    'case_filed_on',
    'needs'
  )
)

check('a step that drops the unsubscribe line passes that to its letters', () =>
  same(
    built.letters.find(one => one.id === 'scored-intro-meeting').unsubscribeLink,
    false,
    'unsubscribeLink'
  )
)

// ── The chain a letter belongs to is looked up ──────────────────────────

check('a letter id answers with its own chain', () => {
  same(built.chainOf('scored-intro').id, 'intro', 'intro')
  same(built.chainOf('unmeasured-lawsuit-follow-up').id, 'lawsuit', 'lawsuit')
})

check('an id nothing knows answers with nothing, rather than with a guess', () =>
  same(built.chainOf('retired-letter-from-before'), null, 'chainOf')
)

check('a chain that shares a word with another is told apart from it', () => {
  // The studio's report decided a letter's chain by asking whether its id
  // held the string 'lawsuit'. Both of these do, and they are two chains.
  const appeal = defineChain({
    id: 'lawsuit-appeal',
    name: 'Lawsuit appeal',
    source: 'appeals',
    steps: [{ at: 0, channel: 'email', letter: words }],
  })
  const two = createChains({
    chains: [INTRODUCTION, LAWSUIT, appeal],
    segments: SEGMENTS,
    segmentOf,
  })
  same(two.chainOf('scored-lawsuit').id, 'lawsuit', 'the suit letter')
  same(two.chainOf('scored-lawsuit-appeal').id, 'lawsuit-appeal', 'the appeal letter')
})

// ── Which chain a business is on ────────────────────────────────────────

check('a business is on the chain claiming its source', () => {
  same(built.chainFor({ source: 'lawsuits' }).id, 'lawsuit', 'a sued business')
  same(built.chainFor({ source: 'filings' }).id, 'new-business', 'a new business')
  same(built.chainFor({ source: 'preview' }).id, 'preview', 'a preview')
})

check('a business whose source nothing claims is on the default chain', () => {
  same(built.chainFor({ source: 'places' }).id, 'intro', 'from the map')
  same(built.chainFor({ source: null }).id, 'intro', 'from nowhere')
  same(built.chainFor({}).id, 'intro', 'from a row with no source at all')
})

check('the default chain is the one naming no source', () =>
  same(built.defaultChain.id, 'intro', 'defaultChain')
)

// ── The days, read off each chain rather than off one constant ──────────

check('each chain states its own days', () => {
  same(built.dueAt(built.chainById('intro'), 2), 14, 'the cold intro reminder')
  same(built.dueAt(built.chainById('preview'), 2), 3, "the preview's first follow-up")
  same(built.dueAt(built.chainById('preview'), 4), 18, "the preview's last")
})

check('a step the chain does not have has no day', () => {
  same(built.dueAt(built.chainById('new-business'), 2), null, 'a second new-business letter')
  same(built.hasStep(built.chainById('new-business'), 2), false, 'hasStep')
})

check('the gap before a step is the days between it and the one before', () => {
  same(built.gapBefore(built.chainById('preview'), 3), 5, 'day 8 after day 3')
  same(built.gapBefore(built.chainById('intro'), 2), 14, 'the fortnight')
  same(built.gapBefore(built.chainById('intro'), 1), null, 'before the first')
})

// ── Chains that cannot stand together ───────────────────────────────────

const refuses = (what, chains, saying) =>
  check(`${what} is refused`, async () => {
    const said = await refusal(() => createChains({ chains, segments: SEGMENTS, segmentOf }))
    ok(said, 'it was accepted')
    ok(
      said.includes(saying),
      `the refusal said ${JSON.stringify(said)}, which does not mention ${JSON.stringify(saying)}`
    )
  })

refuses(
  'two chains with no source between them',
  [
    INTRODUCTION,
    defineChain({
      id: 'other',
      name: 'Other',
      steps: [{ at: 0, channel: 'email', letter: words }],
    }),
  ],
  'both name no source'
)

refuses('no chain with no source at all', [LAWSUIT], 'no chain names a source of null')

refuses(
  'two chains claiming one source',
  [
    INTRODUCTION,
    LAWSUIT,
    defineChain({
      id: 'suits-again',
      name: 'Again',
      source: 'lawsuits',
      steps: [{ at: 0, channel: 'email', letter: words }],
    }),
  ],
  'claim the source lawsuits'
)

refuses(
  'two letters with one id',
  [
    INTRODUCTION,
    defineChain({
      id: 'clash',
      name: 'Clash',
      source: 'clash',
      steps: [{ at: 0, channel: 'email', letter: words, id: 'scored-intro' }],
    }),
  ],
  'share the id scored-intro'
)

check('a registry with no chains is refused', async () =>
  ok(
    await refusal(() => createChains({ chains: [], segments: SEGMENTS, segmentOf })),
    'an empty list was accepted'
  )
)

check('a registry with no segments is refused', async () =>
  ok(
    await refusal(() => createChains({ chains: FOUR, segments: [], segmentOf })),
    'an empty segment list was accepted'
  )
)

// ── A chain whose segments are narrowed ─────────────────────────────────

check('a chain written for one segment registers for that one alone', () => {
  const scoredOnly = defineChain({
    id: 'scored-only',
    name: 'Scored only',
    source: 'scored-only',
    segments: ['scored'],
    steps: [{ at: 0, channel: 'email', letter: words }],
  })
  const narrowed = createChains({
    chains: [INTRODUCTION, scoredOnly],
    segments: SEGMENTS,
    segmentOf,
  })
  const its = narrowed.letters.filter(one => one.chain === 'scored-only')
  same(its.length, 1, 'letters')
  same(its[0].segment, 'scored', 'segment')
})

// ── A chain with a call in it ───────────────────────────────────────────

check('a chain can reach somebody by something other than a letter', () => {
  const five = createChains({ chains: FIVE, segments: SEGMENTS, segmentOf })
  const call = five.letters.find(one => one.id === 'scored-broken-site-call')
  same(call.channel, 'call', 'channel')
  same(call.open, null, 'the call carries no words')
  same(five.chainOf(call.id).id, 'broken-site', 'its chain')
})

check("a chain's own exit is carried onto the chain", () =>
  ok(BROKEN_SITE.exits.includes('cert_fixed'), 'the exit was dropped')
)

await finish({ hint: 'src/core/chains/registry.js derives all of this from the manifests.' })

console.log(`chain registry: ${cases.length} checks passed`)
