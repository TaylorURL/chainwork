/**
 * Which letter a business is given, through a registry built from manifests.
 *
 * Every rule here is TaylorURL's, unchanged: the weighted draw, the stamp a
 * business keeps while its family still sends, the family a chain goes on in,
 * the guard that will not let a segment be left with nothing live. What
 * changed is only where the letters came from, so these are the checks that
 * say the move cost nothing.
 */

import { defineChain, fromCode } from '../../src/core/chains/manifest.js'
import { createChains } from '../../src/core/chains/registry.js'
import { stepOf } from '../../src/core/letters/registry.js'
import { FOUR, SEGMENTS, segmentOf } from '../fixtures/chains.js'

const words = fromCode(prospect => ({
  subject: `a letter for ${prospect?.name ?? 'a business'}`,
  paragraphs: ['a paragraph'],
}))
import { cases, check, finish, ok, same } from '../harness/checks.js'

const built = createChains({ chains: FOUR, segments: SEGMENTS, segmentOf })

/** A business off the map with a measured site, which reads as 'scored'. */
const scored = { id: 'a', name: 'A Shop', audit_score: 40, source: 'places' }
/** A business in a suit, which hears the lawsuit letters and never the intro. */
const sued = { id: 'b', name: 'B Shop', audit_score: 40, source: 'lawsuits', case_filed_on: '2026-09-01' }

// ── A first letter ──────────────────────────────────────────────────────

check('a business off the map is given the first chain’s first letter', () =>
  same(built.pickVariant(scored).id, 'scored-intro', 'the letter'))

check('a business in a suit is given the suit letter and never the intro', () => {
  same(built.pickVariant(sued).id, 'scored-lawsuit', 'the letter')
  same(built.letterSourceOf(sued), 'lawsuits', 'its letter source')
})

check('a business in a suit with no filing date is given nothing', () =>
  same(built.pickVariant({ ...sued, case_filed_on: null }), null, 'the letter'))

check("a letter is only drawn for the segment it is written for", () => {
  const social = { id: 'c', site_kind: 'social', source: 'places' }
  same(built.pickVariant(social).id, 'social-intro', 'the letter')
  same(built.fits(built.variantById('scored-intro'), social), false, 'a scored letter fits it')
})

// ── The stamp a business keeps ──────────────────────────────────────────

check('a business keeps the letter already written on it', () =>
  same(built.pickVariant({ ...scored, variant_id: 'scored-intro' }).id, 'scored-intro', 'the letter'))

check('a business holding a letter nothing knows is drawn again', () =>
  same(built.pickVariant({ ...scored, variant_id: 'retired-letter' }).id, 'scored-intro', 'the letter'))

check('a business whose whole family is paused is drawn again', () => {
  const paused = built.withSettings(built.VARIANTS, [
    { id: 'scored-intro', status: 'paused' },
    { id: 'scored-intro-meeting', status: 'paused' },
  ])
  same(built.pickVariant({ ...scored, variant_id: 'scored-intro' }, paused), null, 'the letter')
})

// ── Later steps ─────────────────────────────────────────────────────────

check('a second letter stays in the family the first opened', () => {
  const next = built.pickVariant({ ...scored, variant_id: 'scored-intro' }, built.VARIANTS, 0, 2)
  same(next.id, 'scored-intro-meeting', 'the letter')
  same(stepOf(next), 2, 'its step')
})

check('a chain with nothing at the step draws nothing, and ends', () =>
  same(built.pickVariant({ ...scored, variant_id: 'scored-intro' }, built.VARIANTS, 0, 3), null, 'the letter'))

check('the suit chain ends after its second letter', () => {
  const second = built.pickVariant({ ...sued, variant_id: 'scored-lawsuit' }, built.VARIANTS, 0, 2)
  same(second.id, 'scored-lawsuit-follow-up', 'the second')
  same(built.pickVariant({ ...sued, variant_id: 'scored-lawsuit' }, built.VARIANTS, 0, 3), null, 'a third')
})

check('a family is read off the letter a business holds', () => {
  same(built.familyHeld({ variant_id: 'scored-intro' }), 'introduction', 'the intro')
  same(built.familyHeld({ variant_id: 'scored-lawsuit' }), 'lawsuit', 'the suit')
  same(built.familyHeld({ variant_id: 'nothing-knows-this' }), null, 'an unknown letter')
})

// ── What is still ahead ─────────────────────────────────────────────────

check('a chain with a live step ahead says so', () =>
  same(built.liveAhead(built.VARIANTS, 'scored', 2, 'introduction', null), true, 'liveAhead'))

check('a chain past its last step has nothing ahead', () =>
  same(built.liveAhead(built.VARIANTS, 'scored', 3, 'introduction', null), false, 'liveAhead'))

check('a family whose first letters are all off has nothing ahead for a new business', () => {
  const paused = built.withSettings(built.VARIANTS, [{ id: 'scored-intro', status: 'paused' }])
  same(built.liveAhead(paused, 'scored', 1, 'introduction', null), false, 'liveAhead at step one')
  same(built.liveAhead(paused, 'scored', 2, 'introduction', null), true, 'liveAhead at step two')
})

// ── The weighted draw ───────────────────────────────────────────────────

check('two letters at one step are drawn in proportion to their weight', () => {
  const tested = createChains({
    chains: [
      defineChain({
        id: 'intro',
        family: 'introduction',
        name: 'Introduction',
        steps: [
          {
            at: 0,
            channel: 'email',
            variants: [
              { letter: words, weight: 1 },
              { slug: 'short', letter: words, weight: 3 },
            ],
          },
        ],
      }),
    ],
    segments: SEGMENTS,
    segmentOf,
  })
  // One in four of the range belongs to the first letter and three to the
  // second, so a roll just under a quarter draws the first and one just over
  // it draws the second.
  same(tested.pickVariant(scored, tested.VARIANTS, 0).id, 'scored-intro', 'a roll of nought')
  same(tested.pickVariant(scored, tested.VARIANTS, 0.24).id, 'scored-intro', 'a roll under a quarter')
  same(tested.pickVariant(scored, tested.VARIANTS, 0.26).id, 'scored-intro-short', 'a roll over a quarter')
  same(tested.pickVariant(scored, tested.VARIANTS, 0.99).id, 'scored-intro-short', 'a roll near one')
})

check('a letter weighted to nothing is never drawn', () => {
  const off = built.withSettings(built.VARIANTS, [{ id: 'scored-intro', weight: 0 }])
  same(built.pickVariant(scored, off), null, 'the letter')
})

check('a roll outside nought-to-one still lands on a letter', () => {
  same(built.pickVariant(scored, built.VARIANTS, -5).id, 'scored-intro', 'a roll below nought')
  same(built.pickVariant(scored, built.VARIANTS, 9).id, 'scored-intro', 'a roll above one')
})

// ── What the console may set ────────────────────────────────────────────

check('a stored status and weight are laid over the registry', () => {
  const laid = built.withSettings(built.VARIANTS, [
    { id: 'scored-intro', status: 'paused', weight: 7 },
  ])
  const one = laid.find(entry => entry.id === 'scored-intro')
  same(one.status, 'paused', 'status')
  same(one.weight, 7, 'weight')
})

check('a stored row for a letter nothing knows is ignored', () => {
  const laid = built.withSettings(built.VARIANTS, [{ id: 'gone', status: 'paused' }])
  same(laid.length, built.VARIANTS.length, 'the registry length')
})

check('a weight outside the range leaves the default standing', () => {
  const laid = built.withSettings(built.VARIANTS, [{ id: 'scored-intro', weight: 9999 }])
  same(laid.find(entry => entry.id === 'scored-intro').weight, 1, 'weight')
})

check('pausing the last live first letter of a segment is refused', () =>
  same(
    built.wouldEmptySegment(built.VARIANTS, 'scored-intro', { status: 'paused' }),
    true,
    'wouldEmptySegment'
  ))

check('weighting the last live first letter of a segment to nothing is refused', () =>
  same(
    built.wouldEmptySegment(built.VARIANTS, 'scored-intro', { weight: 0 }),
    true,
    'wouldEmptySegment'
  ))

check('pausing a later step is allowed, since waiting is a decision', () =>
  same(
    built.wouldEmptySegment(built.VARIANTS, 'scored-intro-meeting', { status: 'paused' }),
    false,
    'wouldEmptySegment'
  ))

check('a segment already empty may be changed freely', () => {
  const empty = built.withSettings(built.VARIANTS, [{ id: 'scored-intro', status: 'paused' }])
  same(
    built.wouldEmptySegment(empty, 'scored-intro', { weight: 0 }),
    false,
    'wouldEmptySegment'
  )
})

await finish({ hint: 'src/core/letters/registry.js holds the draw; the manifests hold the letters.' })

console.log(`letters: ${cases.length} checks passed`)
