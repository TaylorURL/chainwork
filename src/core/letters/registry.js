/**
 * The letter registry: which letter a business is given, at which step, and
 * when a chain has nothing left to send it.
 *
 * This is TaylorURL's own registry lifted out of the studio and given its
 * letters as an argument. Every decision it made is unchanged - the weighted
 * draw, the stamp a business keeps, the family it stays in, the guard against
 * emptying a segment - and none of them is written here twice.
 *
 * What moved is where the letters come from. The studio had them as four
 * constants in this file and built one entry per segment at the bottom; a
 * second studio with different letters had nowhere to put them. So the list
 * arrives through `createLetters`, which binds it once and hands back the same
 * functions the studio already calls by the same names. A chain manifest is
 * the other way in: `registryOf` in ./chains/registry.js turns manifests into
 * exactly this list.
 *
 * The functions that need nothing but their arguments stay out of the factory
 * and are exported on their own, so a console can import `stepOf` without
 * building a registry to ask it a question.
 *
 * Strings and pure functions only. No database, no clock, no network: a
 * browser bundles this beside the table it draws.
 */

/** The states a variant can be in. Only a live one is ever chosen. */
export const VARIANT_STATUSES = Object.freeze(['live', 'paused', 'draft'])

/** One descriptor, frozen, with the defaults a letter ships with filled in. */
export function variant({
  id,
  name,
  about,
  segment,
  needs,
  open,
  step = 1,
  when = null,
  condition = null,
  status = 'live',
  weight = 1,
  // Null rather than the first family, because `variant` is bound to no
  // registry and the first family is a fact about one. `familyOf` fills it in
  // for the registry doing the asking, which is the same answer the studio's
  // own module gave when the constant sat in this file.
  family = null,
  plain = false,
  repeats = false,
  unsubscribeLink = true,
  styled = false,
  source = null,
  // What a chain manifest adds, and what the studio's four letters carried
  // nowhere because the days and the channel lived outside the registry: the
  // chain this letter belongs to, the day it is owed on, how it reaches
  // somebody, and where its words come from. A letter registered by hand
  // leaves them unset and reads exactly as it always did.
  chain = null,
  at = null,
  channel = 'email',
  letter = null,
}) {
  return Object.freeze({
    id,
    name,
    about,
    segment,
    step,
    status,
    weight,
    family,
    plain,
    repeats,
    unsubscribeLink,
    styled,
    source,
    needs: Object.freeze([...needs]),
    when,
    condition,
    open,
    chain,
    at,
    channel,
    letter,
  })
}

/** The step a registry entry sends at, which is the first where it says nothing. */
export const stepOf = entry => entry.step ?? 1

/**
 * Whether a letter stands at a step.
 *
 * A letter written for one step stands at that step alone, which is what a
 * chain of different letters is made of. A letter that repeats stands at its
 * own step and at every step after it, for as long as the business is on the
 * list: it is the same letter arriving again rather than the next thing in a
 * sequence, so there is no step at which it runs out.
 *
 * Standing at a step is not the same as being sent at it. Where a live letter
 * was written for the step itself, that letter is the one drawn and the
 * repeating one waits for the step after; `drawn` settles it, since which of
 * the two goes depends on what else is switched on.
 *
 * @param {object} entry A registry entry.
 * @param {number} step The step being drawn for.
 */
export const sendsAt = (entry, step) =>
  entry?.repeats ? step >= stepOf(entry) : stepOf(entry) === step

/** The most a variant may weigh, which is plenty for a ratio between a few of them. */
export const WEIGHT_MAX = 100

/**
 * One of a set, in proportion to the weights on it.
 *
 * A roll outside [0, 1) is held to it, so a bad draw still lands on a slice
 * rather than past the end of the list.
 */
function weighted(slices, roll) {
  const total = slices.reduce((sum, entry) => sum + entry.weight, 0)
  const point = (Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 1) : 0) * total
  let passed = 0
  for (const entry of slices) {
    passed += entry.weight
    if (point < passed) return entry
  }
  return slices[slices.length - 1]
}

/**
 * Whether a change would leave a segment with nothing live to send.
 *
 * A segment whose every first letter is paused is a queue that quietly
 * empties: the businesses in it are skipped run after run and nothing says
 * why. So the last first letter a segment can still send under cannot be
 * paused and cannot be weighted to nothing, and the console is refused rather
 * than the queue going silent. A segment with nothing live already is left to
 * be changed freely, since no change to it can take away what it does not
 * have. A later step may be emptied: a chain
 * that waits at a step is a decision, not a silent queue.
 *
 * @param {ReadonlyArray<object>} variants The registry as it stands.
 * @param {string} id The variant being changed.
 * @param {{status?: string, weight?: number}} change What it is being changed to.
 * @returns {boolean} True when the change would empty the segment.
 */
export function wouldEmptySegment(variants, id, change) {
  const target = variants.find(entry => entry.id === id)
  if (!target || stepOf(target) !== 1) return false
  const sends = entry =>
    entry.segment === target.segment &&
    (entry.source ?? null) === (target.source ?? null) &&
    stepOf(entry) === 1 &&
    entry.status === 'live' &&
    entry.weight > 0
  if (!variants.some(sends)) return false
  const after = variants.map(entry => (entry.id === id ? { ...entry, ...change } : entry))
  return !after.some(sends)
}

/**
 * The registry, bound to one set of letters.
 *
 * @param {object} what
 * @param {ReadonlyArray<object>} what.letters Every letter, each already
 *   registered for the segment it is written for. `variant` is what shapes one;
 *   `registryOf` is what builds the list out of chain manifests.
 * @param {(row: object) => string} what.segmentOf How a row's segment is read.
 * @param {string} what.firstFamily The family a letter naming none belongs to,
 *   which is the chain the studio opened with.
 * @param {ReadonlyArray<string>} [what.ownLetterSources] The sources whose
 *   businesses hear only their own letters and are never drawn the first
 *   family's.
 */
export function createLetters({ letters, segmentOf, firstFamily, ownLetterSources = [] }) {
  if (!Array.isArray(letters)) {
    throw new TypeError('createLetters needs a list of letters')
  }
  if (typeof segmentOf !== 'function') {
    throw new TypeError('createLetters needs segmentOf, which reads a row\'s segment')
  }
  if (typeof firstFamily !== 'string' || !firstFamily) {
    throw new TypeError('createLetters needs firstFamily, the family a letter naming none is in')
  }
  const VARIANTS = Object.freeze([...letters])
  const OWN_LETTER_SOURCES = Object.freeze([...ownLetterSources])
  const FIRST_FAMILY = firstFamily

  /** The source a row's letters are written for: its own where it has letters, null otherwise. */
  function letterSourceOf(prospect) {
    const source = prospect?.source ?? null
    return OWN_LETTER_SOURCES.includes(source) ? source : null
  }

  /** The family a registry entry belongs to, which is the first where it names none. */
  const familyOf = entry => entry?.family ?? FIRST_FAMILY

  /**
   * The family a business is in: that of the first letter it holds, or null
   * where it holds none the registry knows, which lets it go on in whatever
   * family still sends for it.
   *
   * @param {object} prospect A row carrying `variant_id`, or not.
   * @param {ReadonlyArray<object>} [variants] The registry the id is read against.
   */
  function familyHeld(prospect, variants = VARIANTS) {
    const id = prospect?.variant_id
    const held = id ? variants.find(entry => entry.id === id) : null
    return held ? familyOf(held) : null
  }

  /**
   * The family a business's chain goes on in at a step.
   *
   * The family it opened in, while that family has anything live left for the
   * segment, so a business hears one voice. A family retired outright has no
   * voice left, and a business part way through one is owed the letters that
   * still go rather than a chain that ends on a letter nobody sends, so it is
   * drawn among whatever the segment still sends: null, for any family.
   *
   * @param {object} prospect A row carrying `variant_id`, or not.
   * @param {ReadonlyArray<object>} [variants] The registry as it stands.
   * @param {number} [step] The step it is owed next.
   * @returns {string|null}
   */
  function familyAhead(prospect, variants = VARIANTS, step = 2) {
    const held = familyHeld(prospect, variants)
    const source = letterSourceOf(prospect)
    return liveAhead(variants, segmentOf(prospect ?? {}), step, held, source) ? held : null
  }

  /**
   * Whether a letter is written for a business: the row reads as the letter's
   * segment, carries every column the letter needs, and passes the letter's own
   * test where it has one.
   *
   * This is the whole of the gate, read here by the picker and by the console's
   * preview, so what the preview renders against is a business the sender would
   * actually give the letter to.
   *
   * @param {object} variant A registry entry.
   * @param {object} prospect A candidate row, as lib/outreach/sending/queue.js reads one.
   */
  function fits(variant, prospect) {
    const row = prospect ?? {}
    return (
      variant.segment === segmentOf(row) &&
      (variant.source ?? null) === letterSourceOf(row) &&
      variant.needs.every(column => row[column] !== null && row[column] !== undefined) &&
      (typeof variant.when !== 'function' || Boolean(variant.when(row)))
    )
  }

  /**
   * The variant one prospect is given, or null where none fits.
   *
   * A prospect that already holds one keeps it: a business that re-qualifies
   * under a second segment, or whose letter has been paused in the console, is
   * still the business the first message was written to, and a later letter
   * under another id would read as a different company writing.
   *
   * What overturns a stamp is a letter that will never be drawn again: one the
   * registry no longer knows, or one whose family has nothing live left for the
   * segment. A business standing on one of those would sit in the queue forever
   * holding a message no run can produce, and since nothing has been written to
   * it yet, it is drawn again among what is still sending.
   *
   * Otherwise the eligible variants are the live ones written for the prospect,
   * carrying a weight, and the roll picks among them in proportion to their
   * weights.
   *
   * A later step is drawn the same way among the letters that stand at it. At
   * step two that is the second letter, which was written for the step; past it
   * nothing stands, so nothing is drawn and the chain ends.
   *
   * @param {object} prospect A candidate row, as lib/outreach/sending/queue.js reads one.
   * @param {ReadonlyArray<object>} [variants] The registry, with whatever the
   *   console has set laid over it. The code's own defaults otherwise.
   * @param {number} [roll] A number in [0, 1), drawn by the caller.
   * @param {number} [step] Which letter is being chosen. The first unless the
   *   caller says otherwise.
   * @returns {object|null} The variant, or null where nothing fits.
   */
  function pickVariant(prospect, variants = VARIANTS, roll = 0, step = 1) {
    const row = prospect ?? {}
    const segment = segmentOf(row)

    // The letter already written on the row, which the business keeps while its
    // family still has anything live for the segment. A letter paused on its own
    // is a switch flipped in the console for an afternoon and the business is
    // still written to under it, while a family retired outright leaves the
    // stamp naming a letter no draw can produce. A business standing on one of
    // those has been written to by nobody yet, so it is drawn again among what
    // is still sending rather than held for a letter that is never coming.
    if (step === 1 && row.variant_id) {
      const kept = variants.find(entry => entry.id === row.variant_id)
      if (kept && liveAhead(variants, segment, 1, familyOf(kept), letterSourceOf(row))) return kept
    }

    // A first letter is drawn among every family; every letter after it stays
    // in the family of the first while that family still sends, and goes on in
    // whatever does once it has been retired.
    return drawn(variants, row, roll, step, step === 1 ? null : familyAhead(row, variants, step))
  }

  /**
   * The letters live for a row at a step, in one family where one is named,
   * drawn among by weight. `fits` is what holds the draw to the row's segment.
   *
   * A letter written for the step takes it from one that has repeated into it,
   * so the draw is among those where there are any, and among the repeating
   * letters only where nothing was written for the step.
   */
  function drawn(variants, row, roll, step, family = null) {
    const eligible = variants.filter(
      entry =>
        sendsAt(entry, step) &&
        entry.status === 'live' &&
        entry.weight > 0 &&
        (family === null || familyOf(entry) === family) &&
        fits(entry, row)
    )
    const own = eligible.filter(entry => stepOf(entry) === step)
    const pool = own.length ? own : eligible
    return pool.length ? weighted(pool, roll) : null
  }

  /**
   * Whether a chain has any live letter left at this step or beyond.
   *
   * Whether the code holds words for a step is a fact about the tree, and it stays
   * true after a letter is switched off. This asks the question a run actually
   * needs: is there anything left for this business to be sent.
   *
   * The two answers came apart when a whole family was retired. A letter paused
   * on its own leaves the steps behind it live, and the business waits, which is
   * right: a switch flipped in the console for an afternoon should not end
   * somebody's chain. A family paused entirely leaves nothing ahead at all, and
   * a business waiting on that waits forever, owed a letter no draw can produce
   * and counted as deferred every run for the rest of time.
   *
   * A chain nobody has opened yet is the exception. Its first letter is the only
   * way to the letters after it, so a family whose first letters are all
   * switched off has nothing ahead for a business it has not written to,
   * whatever is live further along. Without that, pausing the introduction would
   * go on sending it to every business already drafted under it, because the
   * second letter is still switched on.
   *
   * @param {ReadonlyArray<object>} variants The registry as it stands.
   * @param {string} segment The segment the business reads as.
   * @param {number} step The step it is owed next.
   * @param {string|null} [family] The chain it was opened in.
   * @param {string|null} [source] The source whose letters it hears, which
   *   `letterSourceOf` reads off the row. Null for the introduction's businesses.
   */
  function liveAhead(variants, segment, step, family = null, source = null) {
    return variants.some(
      entry =>
        entry.segment === segment &&
        (entry.source ?? null) === source &&
        (sendsAt(entry, step) || (step > 1 && stepOf(entry) > step)) &&
        entry.status === 'live' &&
        entry.weight > 0 &&
        (family === null || familyOf(entry) === family)
    )
  }

  /**
   * The registry with what the console has set laid over it.
   *
   * A stored row names a variant by id and carries the status and the weight it
   * has been set to. Only a known id is read, since a row for a variant that has
   * since been retired is a fact about its history rather than an instruction,
   * and only a value the registry would accept is taken, so a row written by
   * hand with a weight the sender cannot use leaves the code's own default
   * standing rather than emptying a segment.
   *
   * @param {ReadonlyArray<object>} [variants] The registry.
   * @param {Array<{id: string, status?: string, weight?: number}>} [rows] What
   *   is stored, as `outreach_variants` holds it.
   * @returns {ReadonlyArray<object>} A new frozen list in the registry's order.
   */
  function withSettings(variants = VARIANTS, rows = []) {
    const stored = new Map((rows ?? []).filter(row => row?.id).map(row => [row.id, row]))
    return Object.freeze(
      variants.map(entry => {
        const row = stored.get(entry.id)
        if (!row) return entry
        const status = VARIANT_STATUSES.includes(row.status) ? row.status : entry.status
        const weight =
          Number.isInteger(row.weight) && row.weight >= 0 && row.weight <= WEIGHT_MAX
            ? row.weight
            : entry.weight
        return Object.freeze({ ...entry, status, weight })
      })
    )
  }

  /** The variant an id names, or null where nothing does. */
  function variantById(id) {
    return VARIANTS.find(entry => entry.id === id) ?? null
  }

  return {
    VARIANTS,
    FIRST_FAMILY,
    OWN_LETTER_SOURCES,
    letterSourceOf,
    familyOf,
    familyHeld,
    familyAhead,
    fits,
    pickVariant,
    liveAhead,
    withSettings,
    variantById,
    // Carried through so a caller holding a bound registry has every function
    // the studio's own module exported, rather than two places to import from.
    stepOf,
    sendsAt,
    wouldEmptySegment: (variants = VARIANTS, id, change) =>
      wouldEmptySegment(variants, id, change),
    VARIANT_STATUSES,
    WEIGHT_MAX,
  }
}
