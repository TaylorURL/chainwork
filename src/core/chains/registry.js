/**
 * Every chain the host has, and the letter registry derived from them.
 *
 * One function, `createChains`, takes the manifests and hands back the whole
 * of what the sender, the console and the report each used to work out for
 * themselves:
 *
 *   letters      one entry per step per segment, which is exactly the list the
 *                studio used to write out by hand at the bottom of its
 *                registry
 *   chainOf      the chain a letter id belongs to, looked up rather than
 *                guessed from a word in the id
 *   chainFor     the chain a business is on, by its source
 *   dueAt        the day a step is owed on, read off the chain rather than off
 *                one constant shared by two chains
 *
 * `chainOf` is the one worth saying out loud. The studio's report decided a
 * letter's chain by asking whether its id contained the string 'lawsuit', and
 * that is wrong in both directions the moment a chain is added: a chain called
 * 'lawsuit-appeal' reads as the lawsuit chain, and a chain whose name shares
 * no word with its letters reads as the introduction. Here the chain is
 * written on the letter when the letter is made, and the lookup is a map.
 *
 * ## The default chain
 *
 * Exactly one chain may name no source. It takes every business no other chain
 * claims, which is what the cold intro does, and a second one would make the
 * answer to "which chain is this business on" a draw. Two defaults is refused
 * at load.
 *
 * ## Order
 *
 * Chains in the order given, each chain's steps in order, each step's letters
 * in the order the step lists them, and each letter's segments in the order
 * the segment list gives. That is the order the studio's
 * list was already in, which is what lets a check assert the two are identical
 * letter for letter.
 *
 * Strings and pure functions only.
 */

import { createLetters, variant } from '../letters/registry.js'
import { letterIdFor } from './manifest.js'

/**
 * The letters one chain registers.
 *
 * A step is registered once per segment it is written for, since a step says
 * nothing about the segment on its own, and the segment is what `fits` holds
 * the draw to.
 */
function lettersOf(chain, segments) {
  const wanted =
    chain.segments === 'all' ? segments : segments.filter(one => chain.segments.includes(one))
  const made = []
  chain.steps.forEach((step, index) => {
    for (const one of step.variants) {
      for (const segment of wanted) {
        made.push(
          variant({
            id: one.id ?? letterIdFor(chain.id, one, segment),
            name: one.name ?? `${chain.name}${one.slug ? ` ${one.slug}` : ''}`,
            about: one.about ?? chain.about,
            segment,
            needs: one.needs,
            open: one.letter?.kind === 'code' ? one.letter.write : null,
            step: index + 1,
            when: one.when,
            condition: one.condition,
            status: one.status,
            weight: one.weight,
            family: chain.family,
            plain: one.plain,
            repeats: one.repeats,
            unsubscribeLink: one.unsubscribeLink,
            styled: one.styled,
            source: chain.source,
            chain: chain.id,
            at: step.at,
            channel: step.channel,
            letter: one.letter,
          })
        )
      }
    }
  })
  return made
}

/**
 * The chains, the letters they make, and everything read off both.
 *
 * @param {object} what
 * @param {ReadonlyArray<object>} what.chains Manifests, from `defineChain`.
 * @param {ReadonlyArray<string>} what.segments Every segment a business can
 *   read as, in the order letters are registered in.
 * @param {(row: object) => string} what.segmentOf How a row's segment is read.
 * @param {string} [what.firstFamily] The family a letter naming none belongs
 *   to. The default chain's family unless the caller says otherwise.
 */
export function createChains({ chains, segments, segmentOf, firstFamily = null }) {
  if (!Array.isArray(chains) || !chains.length) {
    throw new TypeError('createChains needs at least one chain')
  }
  if (!Array.isArray(segments) || !segments.length) {
    throw new TypeError('createChains needs the segment list')
  }

  const ids = new Set()
  const sources = new Set()
  let fallback = null
  for (const chain of chains) {
    if (ids.has(chain.id)) throw new Error(`two chains share the id ${chain.id}`)
    ids.add(chain.id)
    if (chain.source === null) {
      if (fallback) {
        throw new Error(
          `${fallback.id} and ${chain.id} both name no source, so neither can be the chain a ` +
            'business falls to when no other claims it. One of them names a source.'
        )
      }
      fallback = chain
    } else {
      if (sources.has(chain.source)) {
        throw new Error(`two chains claim the source ${chain.source}`)
      }
      sources.add(chain.source)
    }
  }
  if (!fallback) {
    throw new Error(
      'no chain names a source of null, so a business carrying a source nothing claims would ' +
        'be on no chain at all and would sit in the queue unwritten to.'
    )
  }

  const letters = Object.freeze(chains.flatMap(chain => lettersOf(chain, segments)))
  const seen = new Set()
  for (const one of letters) {
    if (seen.has(one.id)) throw new Error(`two letters share the id ${one.id}`)
    seen.add(one.id)
  }

  const byId = new Map(chains.map(chain => [chain.id, chain]))
  const bySource = new Map(chains.filter(chain => chain.source !== null).map(chain => [chain.source, chain]))
  const byLetter = new Map(letters.map(one => [one.id, byId.get(one.chain)]))
  const byFamily = new Map(chains.map(chain => [chain.family, chain]))

  const bound = createLetters({
    letters,
    segmentOf,
    firstFamily: firstFamily ?? fallback.family,
    ownLetterSources: [...sources],
  })

  /** The chain a letter id belongs to, or null where nothing knows the id. */
  const chainOf = id => byLetter.get(id) ?? null

  /** The chain a business is on: the one claiming its source, else the default. */
  const chainFor = prospect => bySource.get(prospect?.source ?? null) ?? fallback

  /** The chain a family names, which is how a stored family is read back. */
  const chainByFamily = family => byFamily.get(family) ?? null

  /**
   * The step of a chain, counting from one, or null past its end.
   *
   * A chain that has run out of steps is a chain that has ended, which is a
   * different thing from a business whose next letter is switched off.
   */
  const stepAt = (chain, step) => chain?.steps?.[step - 1] ?? null

  /** Whether a chain has a step at this number. */
  const hasStep = (chain, step) => Boolean(stepAt(chain, step))

  /**
   * The day a step is owed on, counted from the business's first letter on the
   * chain. Null where the chain has no such step.
   *
   * This is what replaces one constant shared by two chains and a separate
   * array for a third. Each chain states its own days, and nothing outside the
   * manifest knows them.
   */
  const dueAt = (chain, step) => stepAt(chain, step)?.at ?? null

  /** Days between one step and the one before it, which is what a reminder waits. */
  const gapBefore = (chain, step) => {
    const now = dueAt(chain, step)
    const before = dueAt(chain, step - 1)
    return now === null || before === null ? null : now - before
  }

  return Object.freeze({
    ...bound,
    chains: Object.freeze([...chains]),
    letters,
    segments: Object.freeze([...segments]),
    defaultChain: fallback,
    chainOf,
    chainFor,
    chainById: id => byId.get(id) ?? null,
    chainByFamily,
    stepAt,
    hasStep,
    dueAt,
    gapBefore,
  })
}
