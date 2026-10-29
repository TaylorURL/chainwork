/**
 * What a business is owed next, and whether today is the day.
 *
 * This is the arithmetic that was spread across three places: one constant
 * holding a fortnight for the two cold chains, an array holding three, eight
 * and eighteen for the draft preview, and nothing at all for the
 * new-business letter, which sent once and stopped. Each of those is now a
 * manifest's own days, and this reads them.
 *
 * It takes data and answers a value. No database, no clock of its own, no mail
 * server: the caller passes the moment, which is what lets a whole chain be
 * walked through in a test, and the engine's run step is the only thing that
 * acts on the answer.
 *
 * ## What the answer means
 *
 * `owed` is the step number a business should be sent next, counting from one.
 * `dueAt` is the moment it falls due, which is the first letter's moment plus
 * the step's own days. `ready` is whether that moment has passed.
 *
 * `ended` says a chain is finished and why - every step sent, a step reached
 * that the chain does not have, the business replied, unsubscribed or bounced,
 * or one of the chain's own exits. A chain that has ended is never reopened
 * here: ending is what stops a business being counted as deferred on every run
 * for the rest of time, which is what a chain with no end does.
 *
 * ## Why it counts from the first letter rather than the last
 *
 * The studio's cold chains counted the gap from the moment a business was last
 * written to, and the preview counted every follow-up from the first letter.
 * The second is right and the first is a bug that only showed itself on a
 * weekend: a letter held back a day pushes every letter behind it a day later,
 * and a chain that slips twice arrives at its last step a week after it was
 * planned. Counting from the first letter means a late step catches up rather
 * than dragging the chain.
 *
 * A step whose day has already passed when the step before it finally sends is
 * due at once rather than skipped. Skipping would quietly shorten a chain
 * whose earlier step was held, which is the opposite of what a hold is for.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** The reasons a chain ends, in the order they are read. */
export const ENDINGS = Object.freeze({
  REPLIED: 'replied',
  UNSUBSCRIBED: 'unsubscribed',
  BOUNCED: 'bounced',
  EXPIRED: 'expired',
  COMPLETE: 'complete',
  EXITED: 'exited',
})

const instantOf = value => {
  const at = value instanceof Date ? value.getTime() : Date.parse(value ?? '')
  return Number.isFinite(at) ? at : null
}

/**
 * The standing exits, read off the row the same way for every chain.
 *
 * These three are not a chain's business to declare. A business that has
 * written back is in a conversation and a scheduled letter would talk over it;
 * one that has asked to stop has asked every chain to stop; one whose address
 * does not exist cannot be reached by any of them. So they are checked here
 * rather than left to each manifest to remember.
 */
function standingEnd(prospect) {
  if (prospect?.replied_at) return ENDINGS.REPLIED
  if (prospect?.unsubscribed_at || prospect?.suppressed) return ENDINGS.UNSUBSCRIBED
  if (prospect?.bounced_at) return ENDINGS.BOUNCED
  return null
}

/**
 * The chain's own exits. A string names a column that ends the chain when it
 * holds anything; a function is asked about the row.
 */
function ownEnd(chain, prospect) {
  for (const exit of chain.exits) {
    if (typeof exit === 'function') {
      if (exit(prospect)) return ENDINGS.EXITED
      continue
    }
    // The three standing exits are in every chain's list and are read above,
    // off the columns they actually live in, so they are passed over here
    // rather than read a second time against a column of the same name.
    if (['replied', 'unsubscribed', 'bounced'].includes(exit)) continue
    if (prospect?.[exit]) return ENDINGS.EXITED
  }
  return null
}

/**
 * What a business is owed on one chain.
 *
 * @param {object} what
 * @param {object} what.chain The manifest.
 * @param {object} what.prospect The business's row.
 * @param {object[]} [what.sent] What has already gone to it on this chain,
 *   each `{ step, sent_at }`, in any order. A step sent twice counts once.
 * @param {Date} what.now The moment being asked about.
 * @returns {{owed: number|null, dueAt: string|null, ready: boolean,
 *   ended: string|null, step: object|null, sentSteps: number[],
 *   startedAt: string|null}}
 */
export function dueOn({ chain, prospect, sent = [], now }) {
  const at = instantOf(now)
  if (at === null) throw new TypeError('dueOn needs the moment it is being asked about')

  const steps = new Map()
  for (const row of sent) {
    const step = Number.isInteger(row?.step) ? row.step : 1
    const when = instantOf(row?.sent_at)
    if (when === null) continue
    // The earliest send of a step is the one the chain is measured from, since
    // a step delivered twice was owed once.
    if (!steps.has(step) || when < steps.get(step)) steps.set(step, when)
  }
  const sentSteps = [...steps.keys()].sort((a, b) => a - b)
  const started = steps.has(1) ? steps.get(1) : sentSteps.length ? steps.get(sentSteps[0]) : null
  const startedAt = started === null ? null : new Date(started).toISOString()

  const nothing = ended => ({
    owed: null,
    dueAt: null,
    ready: false,
    ended,
    step: null,
    sentSteps,
    startedAt,
  })

  const stopped = standingEnd(prospect) ?? ownEnd(chain, prospect)
  if (stopped) return nothing(stopped)

  // An unclaimed thing the chain built comes down on its own day, whatever step
  // the letters had reached. The preview's twenty-one days is this.
  if (chain.expiresAfter !== null && started !== null) {
    if (at >= started + chain.expiresAfter * DAY_MS) return nothing(ENDINGS.EXPIRED)
  }

  const owed = (sentSteps.length ? Math.max(...sentSteps) : 0) + 1
  const step = chain.steps[owed - 1] ?? null
  if (!step) return nothing(ENDINGS.COMPLETE)

  // Nothing sent yet: the first step is due the moment the business is
  // eligible, which is what the queue decides rather than the calendar.
  if (started === null) {
    return {
      owed,
      dueAt: null,
      ready: true,
      ended: null,
      step,
      sentSteps,
      startedAt,
    }
  }

  const due = started + step.at * DAY_MS
  return {
    owed,
    dueAt: new Date(due).toISOString(),
    ready: at >= due,
    ended: null,
    step,
    sentSteps,
    startedAt,
  }
}

/**
 * Every business that is ready for its next step, in the order they fell due.
 *
 * Oldest first, because a business kept waiting longest is the one whose chain
 * is most at risk of reading as abandoned, and because a stable order is what
 * makes two runs of the same data send the same letters.
 *
 * @param {object} what
 * @param {object} what.registry What `createChains` returned.
 * @param {object[]} what.prospects The rows.
 * @param {Map<string, object[]>} what.sent What has gone to each, by row id.
 * @param {Date} what.now
 * @param {number} [what.step] Only businesses owed this step, where the caller
 *   wants the first letters and the reminders separately, as the send job does.
 * @returns {Array<{prospect: object, chain: object, owed: number, step: object,
 *   dueAt: string|null}>}
 */
export function readyNow({ registry, prospects, sent, now, step = null }) {
  const found = []
  for (const prospect of prospects ?? []) {
    const chain = registry.chainFor(prospect)
    if (!chain) continue
    const answer = dueOn({
      chain,
      prospect,
      sent: sent?.get?.(prospect.id) ?? [],
      now,
    })
    if (!answer.ready || answer.ended) continue
    if (step !== null && answer.owed !== step) continue
    found.push({
      prospect,
      chain,
      owed: answer.owed,
      step: answer.step,
      dueAt: answer.dueAt,
    })
  }
  // Oldest due first, and a business owed its first step last. A first step
  // has no calendar day - it falls due the moment the business is eligible,
  // which the queue's own ranking decides rather than the chain - so putting
  // it behind the reminders is what keeps a chain already under way from being
  // crowded out by a fresh lead. Two with the same day are settled on their id,
  // so two runs over the same rows answer in the same order.
  return found.sort((a, b) => {
    if (a.dueAt === null || b.dueAt === null) {
      if (a.dueAt === b.dueAt) return String(a.prospect.id).localeCompare(String(b.prospect.id))
      return a.dueAt === null ? 1 : -1
    }
    if (a.dueAt === b.dueAt) return String(a.prospect.id).localeCompare(String(b.prospect.id))
    return a.dueAt < b.dueAt ? -1 : 1
  })
}
