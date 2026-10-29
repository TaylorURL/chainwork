/**
 * The channels a step may be handed to, and when the pair is refused.
 *
 * The one that matters is the startup refusal. A chain naming a channel
 * nothing can send is a step that fails on one business at a time, months
 * after the chain was written, at a point where the failure reads as a bad
 * row. It is refused when the host starts instead.
 */

import { defineChain, fromCode } from '../../src/core/chains/manifest.js'
import {
  ChannelClosed,
  assertChannelsFor,
  closesChannel,
  createChannels,
} from '../../src/engine/channels.js'
import { cases, check, finish, ok, refusal, same } from '../harness/checks.js'

const words = fromCode(() => ({ subject: 's', paragraphs: ['p'] }))
const sent = []
const email = { send: link => sent.push(link) && 'handed to a mail server' }
const desk = { send: () => 'put on the desk' }

const withCall = defineChain({
  id: 'broken-site',
  name: 'Broken site',
  steps: [
    { at: 0, channel: 'email', letter: words },
    { at: 5, slug: 'call', channel: 'call' },
  ],
})

check('a channel is registered under the id a step names', () => {
  const channels = createChannels({ email, call: desk })
  same(channels.ids.join(' '), 'email call', 'the channels')
  same(channels.has('email'), true, 'email')
  same(channels.has('sms'), false, 'sms')
})

check('a step is handed to the channel it names', async () => {
  const channels = createChannels({ email, call: desk })
  same(await channels.for('email').send({ id: 'a' }), 'handed to a mail server', 'the email step')
  same(await channels.for('call').send({ id: 'a' }), 'put on the desk', 'the call step')
})

check('asking for a channel nothing is registered to is refused by name', async () => {
  const channels = createChannels({ email })
  const said = await refusal(() => channels.for('post'))
  ok(said, 'it answered anyway')
  ok(said.includes('post'), `the refusal said ${JSON.stringify(said)}`)
})

check('a channel with nothing to send with is refused', async () => {
  ok(await refusal(() => createChannels({ email: {} })), 'an empty channel was accepted')
  ok(await refusal(() => createChannels({ email: null })), 'nothing was accepted')
})

check('a channel under a name no step can use is refused', async () => {
  const said = await refusal(() => createChannels({ telegram: email }))
  ok(said, 'it was accepted')
  ok(said.includes('telegram'), `the refusal said ${JSON.stringify(said)}`)
})

check('no channels at all is refused', async () =>
  ok(await refusal(() => createChannels({})), 'an empty set was accepted')
)

// ── The refusal that matters ────────────────────────────────────────────

check('a chain whose channels are all registered is accepted', () => {
  const channels = createChannels({ email, call: desk })
  assertChannelsFor([withCall], channels)
})

check('a chain naming an unregistered channel is refused, with the step named', async () => {
  const channels = createChannels({ email })
  const said = await refusal(() => assertChannelsFor([withCall], channels))
  ok(said, 'it was accepted')
  ok(said.includes('broken-site step 2'), `the refusal said ${JSON.stringify(said)}`)
  ok(said.includes('call'), 'the refusal did not name the channel')
})

check('every unregistered step is named, not just the first', async () => {
  const channels = createChannels({ email })
  const three = defineChain({
    id: 'three',
    name: 'Three',
    steps: [
      { at: 0, channel: 'email', letter: words },
      { at: 3, slug: 'call', channel: 'call' },
      { at: 9, slug: 'post', channel: 'post' },
    ],
  })
  const said = await refusal(() => assertChannelsFor([three], channels))
  ok(said.includes('three step 2'), 'the call step was not named')
  ok(said.includes('three step 3'), 'the printed step was not named')
})

// ── A channel that has shut ─────────────────────────────────────────────

check('a refusal about one link does not close the channel', () => {
  same(closesChannel(new Error('that address does not exist')), false, 'closesChannel')
})

check('a refusal that closes the channel says so', () => {
  const shut = new ChannelClosed('the day’s sending limit is spent', { until: 'tomorrow' })
  same(closesChannel(shut), true, 'closesChannel')
  same(shut.until, 'tomorrow', 'until')
  ok(shut.message.includes('limit is spent'), `it said ${JSON.stringify(shut.message)}`)
})

await finish({ hint: 'src/engine/channels.js holds the contract; the host writes the channels.' })

console.log(`channels: ${cases.length} checks passed`)
