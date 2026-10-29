/**
 * A chain declaration is checked when it is written, not when it sends.
 *
 * Every refusal here is a mistake somebody makes while writing a manifest, and
 * the cheapest moment to hear about it is the moment the file is read. A chain
 * that reaches a send run unchecked fails one business at a time, at a point
 * where the failure reads as a bad row rather than as a bad chain.
 */

import {
  CHANNELS,
  defineChain,
  fromCode,
  fromRow,
  letterIdFor,
} from '../../src/core/chains/manifest.js'
import { cases, check, finish, ok, refusal, same } from '../harness/checks.js'

const words = fromCode(() => ({ subject: 's', paragraphs: ['p'] }))
const good = {
  id: 'intro',
  name: 'Introduction',
  steps: [{ at: 0, channel: 'email', letter: words }],
}

// ── What a valid chain comes back as ────────────────────────────────────

check('a chain comes back frozen', () => {
  const chain = defineChain(good)
  ok(Object.isFrozen(chain), 'the chain is not frozen')
  ok(Object.isFrozen(chain.steps), 'the steps are not frozen')
  ok(Object.isFrozen(chain.steps[0]), 'a step is not frozen')
})

check('a chain whose family is unsaid takes its own id', () =>
  same(defineChain(good).family, 'intro', 'family')
)

check('a chain states its family where the two differ', () =>
  same(defineChain({ ...good, family: 'introduction' }).family, 'introduction', 'family')
)

check('a chain naming no source is the one businesses fall to', () =>
  same(defineChain(good).source, null, 'source')
)

check('a chain takes every segment unless it names some', () =>
  same(defineChain(good).segments, 'all', 'segments')
)

check('the three standing exits are in every chain', () => {
  const chain = defineChain(good)
  for (const exit of ['replied', 'unsubscribed', 'bounced']) {
    ok(chain.exits.includes(exit), `${exit} is not a standing exit`)
  }
})

check("a chain's own exits are added to the standing ones", () => {
  const chain = defineChain({ ...good, exits: ['cert_fixed'] })
  ok(chain.exits.includes('cert_fixed'), 'the chain lost its own exit')
  ok(chain.exits.includes('replied'), 'the chain lost a standing exit')
})

check('the day cap policy defaults to the first step alone', () =>
  same(defineChain(good).spendsDailyCap, 'first-step-only', 'spendsDailyCap')
)

check('nothing expires unless the chain says it does', () =>
  same(defineChain(good).expiresAfter, null, 'expiresAfter')
)

// ── Ids ─────────────────────────────────────────────────────────────────

check('step one is registered under the chain id alone', () =>
  same(letterIdFor('intro', { slug: '' }, 'scored'), 'scored-intro', 'id')
)

check('a later step is registered under the chain id and its slug', () =>
  same(letterIdFor('intro', { slug: 'meeting' }, 'scored'), 'scored-intro-meeting', 'id')
)

check('a step may state an id outright, for one already stored', () => {
  const chain = defineChain({
    ...good,
    steps: [{ at: 0, channel: 'email', letter: words, id: 'a-name-from-before' }],
  })
  same(chain.steps[0].id, 'a-name-from-before', 'id')
})

// ── What is refused ─────────────────────────────────────────────────────

const refuses = (what, spec, saying) =>
  check(`a chain ${what} is refused`, async () => {
    const said = await refusal(() => defineChain(spec))
    ok(said, 'it was accepted')
    ok(
      said.includes(saying),
      `the refusal said ${JSON.stringify(said)}, which does not mention ${JSON.stringify(saying)}`
    )
  })

refuses('with no id', { ...good, id: undefined }, 'chain id')
refuses('whose id is upper case', { ...good, id: 'Intro' }, 'chain id')
refuses('with no name', { ...good, name: '' }, 'needs a name')
refuses('with no steps', { ...good, steps: [] }, 'at least one step')
refuses(
  'whose first step is not on day nought',
  { ...good, steps: [{ at: 3, channel: 'email', letter: words }] },
  'its `at` is nought'
)
refuses(
  'whose second step is not after the first',
  {
    ...good,
    steps: [
      { at: 0, channel: 'email', letter: words },
      { at: 0, slug: 'again', channel: 'email', letter: words },
    ],
  },
  'which is not after step 1'
)
refuses(
  'whose steps run backwards',
  {
    ...good,
    steps: [
      { at: 0, channel: 'email', letter: words },
      { at: 5, slug: 'b', channel: 'email', letter: words },
      { at: 2, slug: 'c', channel: 'email', letter: words },
    ],
  },
  'which is not after step 2'
)
refuses(
  'naming a channel nothing can send',
  { ...good, steps: [{ at: 0, channel: 'telegram', letter: words }] },
  'not one of'
)
refuses(
  'whose email step has no words',
  { ...good, steps: [{ at: 0, channel: 'email' }] },
  'no words'
)
refuses(
  'whose later step has no slug to build an id from',
  {
    ...good,
    steps: [
      { at: 0, channel: 'email', letter: words },
      { at: 7, channel: 'email', letter: words },
    ],
  },
  'needs a `slug`'
)
refuses(
  'using one slug for two letters',
  {
    ...good,
    steps: [
      { at: 0, channel: 'email', letter: words },
      { at: 7, slug: 'again', channel: 'email', letter: words },
      { at: 14, slug: 'again', channel: 'email', letter: words },
    ],
  },
  'one slug for two letters'
)
refuses(
  'whose cap policy is not one of the three',
  { ...good, spendsDailyCap: 'sometimes' },
  'spendsDailyCap'
)
refuses('whose expiry is not days', { ...good, expiresAfter: 0 }, 'expiresAfter')
refuses(
  'whose letter is neither written in code nor on the row',
  { ...good, steps: [{ at: 0, channel: 'email', letter: { kind: 'guess' } }] },
  'neither fromCode nor fromRow'
)

check('a step may reach somebody without words, where the channel carries none', () => {
  const chain = defineChain({
    ...good,
    steps: [
      { at: 0, channel: 'email', letter: words },
      { at: 5, slug: 'call', channel: 'call' },
    ],
  })
  same(chain.steps[1].channel, 'call', 'channel')
  same(chain.steps[1].letter, null, 'letter')
})

// ── Two letters at one step ─────────────────────────────────────────────

check('a step with no variants is one letter, reading as it always did', () => {
  const chain = defineChain(good)
  same(chain.steps[0].variants.length, 1, 'letters at the step')
  same(chain.steps[0].variants[0].slug, '', 'its slug')
  same(chain.steps[0].variants[0].weight, 1, 'its weight')
})

check('a step may carry two letters drawn between by weight', () => {
  const chain = defineChain({
    ...good,
    steps: [
      {
        at: 0,
        channel: 'email',
        variants: [{ letter: words }, { slug: 'short', letter: words, weight: 3 }],
      },
    ],
  })
  same(
    chain.steps[0].variants.map(one => `${one.slug}:${one.weight}`).join(' '),
    ':1 short:3',
    'the letters'
  )
})

check('the first letter at a step keeps the id already stored', () => {
  const chain = defineChain({
    ...good,
    steps: [
      { at: 0, channel: 'email', variants: [{ letter: words }, { slug: 'b', letter: words }] },
    ],
  })
  same(letterIdFor(chain.id, chain.steps[0].variants[0], 'scored'), 'scored-intro', 'the first id')
  same(
    letterIdFor(chain.id, chain.steps[0].variants[1], 'scored'),
    'scored-intro-b',
    'the second id'
  )
})

refuses(
  'whose second letter at a step names no slug',
  {
    ...good,
    steps: [{ at: 0, channel: 'email', variants: [{ letter: words }, { letter: words }] }],
  },
  'names no `slug`'
)

refuses(
  'whose second letter at a step has no words',
  {
    ...good,
    steps: [{ at: 0, channel: 'email', variants: [{ letter: words }, { slug: 'b' }] }],
  },
  'no words'
)

refuses(
  'whose letter at a step is weighted below nought',
  {
    ...good,
    steps: [{ at: 0, channel: 'email', variants: [{ letter: words, weight: -1 }] }],
  },
  '`weight`'
)

check('every channel a step may name is one a host can register', () =>
  same(CHANNELS.includes('email') && CHANNELS.includes('call'), true, 'channels')
)

// ── Where the words come from ───────────────────────────────────────────

check('fromCode holds the function that writes the letter', () => {
  const held = fromCode(() => ({ subject: 'a', paragraphs: [] }))
  same(held.kind, 'code', 'kind')
  same(typeof held.write, 'function', 'write')
})

check('fromRow names the column the written letter is filed in', () => {
  const held = fromRow('letter', { version: 2 })
  same(held.kind, 'row', 'kind')
  same(held.column, 'letter', 'column')
  same(held.version, 2, 'version')
})

check('fromCode refuses anything but a function', async () =>
  ok(await refusal(() => fromCode('words')), 'a string was accepted')
)

check('fromRow refuses an unnamed column', async () =>
  ok(await refusal(() => fromRow('')), 'an empty column was accepted')
)

await finish({ hint: 'src/core/chains/manifest.js is what decides all of this.' })

console.log(`chain manifest: ${cases.length} checks passed`)
