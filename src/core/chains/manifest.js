/**
 * What a chain is, as one declaration.
 *
 * A chain used to be spread across a registry of letters, a switch in the send
 * route that said which business was on which chain, a constant holding the
 * days between two letters, and a report that worked out a letter's chain by
 * looking for a word in its name. Adding a fifth meant finding all four.
 *
 * So a chain is written down once instead. `defineChain` takes the whole of
 * one - what puts a business on it, the steps in order, how each step reaches
 * somebody, and what takes a business off it - checks it over, and freezes it.
 * Nothing else has to be edited to add a chain: ./registry.js derives the
 * letters, the families and the lookup from whatever chains it is handed.
 *
 * The checking is strict and it is done at load rather than at send. A chain
 * with two steps on the same day, a step naming no channel, or a second chain
 * claiming an id already taken is a mistake somebody makes while writing one,
 * and the cheapest moment to hear about it is the moment the file is read. A
 * chain that reaches a send run unchecked is a chain that fails per business,
 * at a point where the failure reads as a bad row.
 *
 * ## A step
 *
 * `at` is days after the business's first letter on this chain, so a step that
 * slips over a weekend does not push the ones behind it later. Step one is
 * always day nought.
 *
 * `channel` is how the step reaches somebody - 'email', 'call', 'sms', 'post'.
 * The engine refuses a chain whose channel the host has not registered, rather
 * than skipping the step quietly.
 *
 * `letter` is where the words come from, and there are two kinds. `fromCode`
 * is a function of the business, which is how three of the studio's four
 * chains are written. `fromRow` names a column holding a letter written for
 * that one business ahead of time, which is how the draft preview works: its
 * words are composed on another machine and filed on the row, and a row
 * without a written set is not sent at all rather than sent something
 * generic.
 *
 * ## Two letters at one step
 *
 * A step may carry `variants`, which are letters written for the same day and
 * drawn between by weight. That is how a subject line is tested: the step is
 * one step, the business hears one letter, and which one is a weighted draw.
 * The first variant keeps the step's own slug - and therefore the id already
 * stored - and every one after it names its own.
 *
 * A step with no `variants` is one letter, which is what the studio's four
 * chains are, and reads exactly as it did before the field existed.
 *
 * `id` is the one field that must never move. It is stored on every message
 * ever sent under the step, so a renamed id is a letter whose history is
 * suddenly attributed to nothing. Where a step names none, the id is derived
 * from the chain and the step's slug, and the derivation is fixed for that
 * reason.
 *
 * Strings and pure functions only.
 */

/** The ways a step can reach somebody. A host registers an adapter per channel. */
export const CHANNELS = Object.freeze(['email', 'call', 'sms', 'post', 'retarget'])

/** What a chain says about whether its steps spend the day's sending cap. */
export const CAP_POLICIES = Object.freeze(['first-step-only', 'every-step', 'never'])

/** The exits every chain has whether it names them or not. */
export const STANDING_EXITS = Object.freeze(['replied', 'unsubscribed', 'bounced'])

/**
 * Words written in code, as a function of the business.
 *
 * @param {(prospect: object, context: object) => object} write Answers the
 *   subject and the paragraphs, the way the studio's openers do.
 */
export function fromCode(write) {
  if (typeof write !== 'function') throw new TypeError('fromCode needs a function')
  return Object.freeze({ kind: 'code', write })
}

/**
 * Words written for one business ahead of time and filed on its row.
 *
 * @param {string} column The column holding them.
 * @param {{version?: number, ready?: (held: object) => boolean}} [what]
 *   `version` is the shape expected, and `ready` is the test a row has to pass
 *   before the step will send; a row that fails it is held rather than sent
 *   something written for nobody.
 */
export function fromRow(column, { version = null, ready = null } = {}) {
  if (typeof column !== 'string' || !column) throw new TypeError('fromRow needs a column name')
  if (ready !== null && typeof ready !== 'function') {
    throw new TypeError('fromRow ready, where given, is a function')
  }
  return Object.freeze({ kind: 'row', column, version, ready })
}

/** The slug a step's derived id is built on, which is its own name lower-cased. */
const slugOf = step => (step.slug ?? '').trim()

/**
 * The id a step is registered under for one segment.
 *
 * Step one takes the chain's id alone, and every step after it takes the
 * chain's id and its own slug. That is exactly how the studio's four letters
 * were already named, which is what lets the manifests take over without a
 * single stored id changing.
 */
export function letterIdFor(chain, step, segment) {
  const slug = slugOf(step)
  return slug ? `${segment}-${chain}-${slug}` : `${segment}-${chain}`
}

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function checkStep(step, index, chain, faults) {
  const where = `${chain.id} step ${index + 1}`
  if (!isPlainObject(step)) {
    faults.push(`${where} is not an object`)
    return
  }
  if (!Number.isInteger(step.at) || step.at < 0) {
    faults.push(`${where} needs \`at\`, whole days after the first letter, and nought or more`)
  }
  if (index === 0 && step.at !== 0) {
    faults.push(`${where} is the first step, so its \`at\` is nought`)
  }
  if (!CHANNELS.includes(step.channel)) {
    faults.push(
      `${where} names channel ${JSON.stringify(step.channel)}, which is not one of ${CHANNELS.join(', ')}`
    )
  }
  if (index > 0 && !slugOf(step)) {
    faults.push(
      `${where} needs a \`slug\`, since its id is built from it and step one took the bare chain id`
    )
  }
  const alternatives = Array.isArray(step.variants) && step.variants.length ? step.variants : [step]
  if (step.variants != null && !Array.isArray(step.variants)) {
    faults.push(`${where} has \`variants\` that is not a list of letters`)
  }
  alternatives.forEach((one, nth) => {
    const which = alternatives.length > 1 ? `${where} variant ${nth + 1}` : where
    if (one.letter != null && !['code', 'row'].includes(one.letter.kind)) {
      faults.push(`${which} has a \`letter\` that is neither fromCode nor fromRow`)
    }
    if (step.channel === 'email' && one.letter == null) {
      faults.push(`${which} sends email and names no \`letter\`, so it has no words`)
    }
    if (nth > 0 && !slugOf(one)) {
      faults.push(
        `${which} is a second letter at the same step and names no \`slug\`, so it would take ` +
          'the id of the first'
      )
    }
    if (one.weight != null && (!Number.isInteger(one.weight) || one.weight < 0)) {
      faults.push(`${which} has a \`weight\` that is not nought or a positive whole number`)
    }
  })
  if (step.needs != null && !Array.isArray(step.needs)) {
    faults.push(`${where} has \`needs\` that is not a list of column names`)
  }
  if (step.when != null && typeof step.when !== 'function') {
    faults.push(`${where} has a \`when\` that is not a function`)
  }
  if (step.weight != null && (!Number.isInteger(step.weight) || step.weight < 0)) {
    faults.push(`${where} has a \`weight\` that is not nought or a positive whole number`)
  }
}

/** One letter at a step, frozen. */
function alternative(one, step) {
  return Object.freeze({
    slug: one.slug ?? step.slug ?? '',
    id: one.id ?? null,
    name: one.name ?? step.name ?? null,
    about: one.about ?? step.about ?? null,
    letter: one.letter ?? null,
    needs: Object.freeze([...(one.needs ?? step.needs ?? [])]),
    when: one.when ?? step.when ?? null,
    condition: one.condition ?? step.condition ?? null,
    weight: one.weight ?? step.weight ?? 1,
    status: one.status ?? step.status ?? 'live',
    repeats: one.repeats ?? step.repeats ?? false,
    plain: one.plain ?? step.plain ?? true,
    styled: one.styled ?? step.styled ?? false,
    unsubscribeLink: one.unsubscribeLink ?? step.unsubscribeLink ?? true,
  })
}

/** One step, frozen, with the defaults a step ships with filled in. */
function step({
  at,
  channel,
  slug = '',
  id = null,
  letter = null,
  needs = [],
  when = null,
  weight = 1,
  status = 'live',
  repeats = false,
  plain = true,
  styled = false,
  unsubscribeLink = true,
  name = null,
  about = null,
  condition = null,
  variants = null,
}) {
  const shape = {
    at,
    channel,
    slug,
    id,
    name,
    about,
    letter,
    needs,
    when,
    condition,
    weight,
    status,
    repeats,
    plain,
    styled,
    unsubscribeLink,
  }
  const letters = (Array.isArray(variants) && variants.length ? variants : [shape]).map(one =>
    alternative(one, shape)
  )
  return Object.freeze({
    ...shape,
    needs: Object.freeze([...needs]),
    // Every letter this step may send. One, unless the step is testing two
    // against each other; the registry draws between them by weight.
    variants: Object.freeze(letters),
  })
}

/**
 * One chain, checked and frozen.
 *
 * @param {object} spec
 * @param {string} spec.id Short, stable, and part of every letter id it makes.
 * @param {string} spec.name What a person reads on a report.
 * @param {string} [spec.about] One line on what the chain is for.
 * @param {string} [spec.family] The family its letters group under, which is
 *   its own id unless it says otherwise. The studio's cold intro is the one
 *   chain whose family and id differ, because both are already stored.
 * @param {string|null} [spec.source] The `source` a business carries to be on
 *   this chain. Null means the chain takes whatever no other chain claims,
 *   which is what the cold intro does, and only one chain may be the default.
 * @param {ReadonlyArray<string>|'all'} [spec.segments] The segments its letters
 *   are registered for.
 * @param {object[]} spec.steps In order, first to last.
 * @param {object} [spec.sender] `{ name }` to sign every letter with one name,
 *   the way the preview chain signs them from a person rather than the studio.
 * @param {string} [spec.spendsDailyCap] Which steps count against the day's cap.
 * @param {Array<string|Function>} [spec.exits] What takes a business off the
 *   chain, beyond the three every chain has.
 * @param {number|null} [spec.expiresAfter] Days after the first letter that
 *   whatever the chain built comes down. The preview sets twenty-one.
 * @returns {Readonly<object>}
 */
export function defineChain(spec) {
  const faults = []
  if (!isPlainObject(spec)) throw new TypeError('defineChain takes an object')
  const { id, name } = spec
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) {
    faults.push(
      `a chain id is lower case, starts with a letter, and holds only letters, digits and hyphens; this one is ${JSON.stringify(id)}`
    )
  }
  if (typeof name !== 'string' || !name) faults.push(`chain ${id} needs a name`)
  const steps = Array.isArray(spec.steps) ? spec.steps : null
  if (!steps || !steps.length) {
    faults.push(`chain ${id} needs at least one step`)
  } else {
    steps.forEach((one, index) => checkStep(one, index, { id }, faults))
    const days = steps.map(one => one?.at)
    for (let i = 1; i < days.length; i += 1) {
      if (!(days[i] > days[i - 1])) {
        faults.push(
          `chain ${id} has step ${i + 1} on day ${days[i]}, which is not after step ${i} on day ${days[i - 1]}`
        )
      }
    }
    const slugs = steps.flatMap((one, index) => {
      const alternatives =
        Array.isArray(one?.variants) && one.variants.length ? one.variants : [one]
      return alternatives.map((each, nth) =>
        index === 0 && nth === 0 ? '' : slugOf(each) || slugOf(one)
      )
    })
    if (new Set(slugs).size !== slugs.length) {
      faults.push(`chain ${id} uses one slug for two letters, which would give them one id`)
    }
  }
  if (spec.spendsDailyCap != null && !CAP_POLICIES.includes(spec.spendsDailyCap)) {
    faults.push(
      `chain ${id} has spendsDailyCap ${JSON.stringify(spec.spendsDailyCap)}, which is not one of ${CAP_POLICIES.join(', ')}`
    )
  }
  if (
    spec.expiresAfter != null &&
    (!Number.isInteger(spec.expiresAfter) || spec.expiresAfter <= 0)
  ) {
    faults.push(
      `chain ${id} has expiresAfter ${JSON.stringify(spec.expiresAfter)}, which is not a positive whole number of days`
    )
  }
  if (spec.segments != null && spec.segments !== 'all' && !Array.isArray(spec.segments)) {
    faults.push(`chain ${id} has segments that are neither 'all' nor a list`)
  }
  if (faults.length)
    throw new Error(`chain ${id ?? '(unnamed)'} is not valid:\n- ${faults.join('\n- ')}`)

  return Object.freeze({
    id,
    name,
    about: spec.about ?? '',
    family: spec.family ?? id,
    source: spec.source ?? null,
    segments:
      spec.segments === 'all' || spec.segments == null ? 'all' : Object.freeze([...spec.segments]),
    sender: Object.freeze({ ...(spec.sender ?? {}) }),
    spendsDailyCap: spec.spendsDailyCap ?? 'first-step-only',
    exits: Object.freeze([...STANDING_EXITS, ...(spec.exits ?? [])]),
    expiresAfter: spec.expiresAfter ?? null,
    steps: Object.freeze(steps.map(step)),
  })
}
