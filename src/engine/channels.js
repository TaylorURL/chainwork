/**
 * How a step reaches somebody, and who it hands that to.
 *
 * A chain's step names a channel - 'email', 'call', 'sms', 'post',
 * 'retarget' - and a channel is whatever the host registers under that name. A
 * letter goes to a mail server, a call goes onto a phone desk, a printed
 * preview goes into a queue somebody collects from. None of that is this
 * package's business, so none of it is in here: a channel is an object with an
 * id and a `send`, and the host writes it.
 *
 * ## Why the check is at startup
 *
 * A chain naming a channel nothing can send is a step that would fail on one
 * business at a time, months after the chain was written, at a point where the
 * failure reads as a bad row. `assertChannelsFor` is given the chains and the
 * registered channels and refuses the pair outright, so the fault arrives when
 * the host starts rather than when a business was due a call.
 *
 * ## What a channel is handed
 *
 * `send(link)` takes one link - the business, the chain, the step, and the
 * rendered words where the step has any - and answers how it went. It is the
 * only place in a run that reaches anything outside the process, which is what
 * keeps the rest of the engine answerable in a test.
 *
 * A channel that throws has refused one link. A channel that throws something
 * carrying `stop: true` has refused every link after it as well - a mail server
 * that has shut the mailbox, a desk that has gone offline - and the run stops
 * offering rather than knocking on a closed door. That distinction is the whole
 * of why this is not just a function call.
 */

import { CHANNELS } from '../core/chains/manifest.js'

/** What a channel has to be before it is registered. */
function checkChannel(id, channel, faults) {
  if (!CHANNELS.includes(id)) {
    faults.push(`${id} is not a channel a step can name; those are ${CHANNELS.join(', ')}`)
  }
  if (!channel || typeof channel !== 'object') {
    faults.push(`the ${id} channel is not an object`)
    return
  }
  if (typeof channel.send !== 'function') {
    faults.push(`the ${id} channel has no \`send\`, so nothing can be handed to it`)
  }
}

/**
 * The channels a host has, checked and frozen.
 *
 * @param {Record<string, {send: Function, name?: string}>} channels
 */
export function createChannels(channels) {
  const faults = []
  if (!channels || typeof channels !== 'object') {
    throw new TypeError('createChannels takes an object of channels, keyed by their id')
  }
  const held = new Map()
  for (const [id, channel] of Object.entries(channels)) {
    checkChannel(id, channel, faults)
    held.set(id, channel)
  }
  if (!held.size) faults.push('no channel was registered, so no step could be sent at all')
  if (faults.length) {
    throw new Error(`the channels are not usable:\n- ${faults.join('\n- ')}`)
  }
  return Object.freeze({
    ids: Object.freeze([...held.keys()]),
    has: id => held.has(id),
    /** The channel a step names, or a refusal naming what is missing. */
    for(id) {
      const found = held.get(id)
      if (!found) {
        throw new Error(
          `nothing is registered to send on the ${id} channel, so a step naming it cannot go`
        )
      }
      return found
    },
  })
}

/**
 * Refuses the chains outright where one names a channel the host has not
 * registered, and says which chain, which step and which channel.
 *
 * @param {ReadonlyArray<object>} chains
 * @param {{has: (id: string) => boolean}} channels
 */
export function assertChannelsFor(chains, channels) {
  const faults = []
  for (const chain of chains ?? []) {
    chain.steps.forEach((step, index) => {
      if (!channels.has(step.channel)) {
        faults.push(
          `${chain.id} step ${index + 1} sends on the ${step.channel} channel, which is not registered`
        )
      }
    })
  }
  if (faults.length) {
    throw new Error(
      'a chain names a channel nothing can send, so it is refused now rather than per business:\n' +
        `- ${faults.join('\n- ')}`
    )
  }
}

/**
 * Thrown by a channel that has refused not only this link but every link after
 * it: a mail server that has shut the mailbox, a desk that has gone offline.
 *
 * A run that meets one stops offering. The link it was carrying is put back
 * where it was waiting rather than filed as a failure, because nothing was
 * handed anywhere.
 */
export class ChannelClosed extends Error {
  constructor(reason, { until = null } = {}) {
    super(`the channel is closed: ${reason}`)
    this.name = 'ChannelClosed'
    this.reason = reason
    this.until = until
    this.stop = true
  }
}

/** Whether a refusal closes the channel for the rest of the run. */
export const closesChannel = cause => Boolean(cause?.stop)
