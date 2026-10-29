/**
 * What a business is owed next, and when.
 *
 * This is the arithmetic that replaces one constant holding a fortnight for
 * two chains, a separate array holding three, eight and eighteen for a third,
 * and nothing at all for the fourth. Each chain now states its own days, so
 * the checks here are mostly about reading them back - and about the two
 * places the studio's version and this one disagree, both of which are stated
 * out loud below.
 */

import { createChains } from '../../src/core/chains/registry.js'
import { ENDINGS, dueOn, readyNow } from '../../src/engine/due.js'
import { FIVE, SEGMENTS, segmentOf } from '../fixtures/chains.js'
import { cases, check, finish, ok, refusal, same } from '../harness/checks.js'

const registry = createChains({ chains: FIVE, segments: SEGMENTS, segmentOf })
const intro = registry.chainById('intro')
const preview = registry.chainById('preview')
const once = registry.chainById('new-business')
const broken = registry.chainById('broken-site')

const day = n => new Date(Date.UTC(2026, 9, n, 15, 0, 0))
const sentOn = (step, n) => ({ step, sent_at: day(n).toISOString() })
const business = { id: 'a', name: 'A Shop' }

// ── Nothing sent yet ────────────────────────────────────────────────────

check('a business nothing has been sent is owed its first step, at once', () => {
  const owed = dueOn({ chain: intro, prospect: business, sent: [], now: day(1) })
  same(owed.owed, 1, 'the step owed')
  same(owed.ready, true, 'ready')
  same(owed.ended, null, 'ended')
  same(owed.dueAt, null, 'a first letter has no calendar day')
  same(owed.startedAt, null, 'startedAt')
})

// ── Each chain's own days ───────────────────────────────────────────────

check("the cold intro's reminder falls due a fortnight after the first letter", () => {
  const sent = [sentOn(1, 1)]
  same(dueOn({ chain: intro, prospect: business, sent, now: day(14) }).ready, false, 'on day 13')
  const due = dueOn({ chain: intro, prospect: business, sent, now: day(15) })
  same(due.owed, 2, 'the step owed')
  same(due.ready, true, 'on the fourteenth day')
  same(due.dueAt, day(15).toISOString(), 'the day it falls due')
})

check("the preview's follow-ups fall due on its own three, eight and eighteen", () => {
  const first = [sentOn(1, 1)]
  same(
    dueOn({ chain: preview, prospect: business, sent: first, now: day(3) }).ready,
    false,
    'on day 2'
  )
  same(
    dueOn({ chain: preview, prospect: business, sent: first, now: day(4) }).ready,
    true,
    'on day 3'
  )
  const third = [sentOn(1, 1), sentOn(2, 4)]
  same(
    dueOn({ chain: preview, prospect: business, sent: third, now: day(9) }).owed,
    3,
    'the step owed'
  )
  same(
    dueOn({ chain: preview, prospect: business, sent: third, now: day(9) }).ready,
    true,
    'on day 8'
  )
})

check('a chain of one letter ends after it', () => {
  const owed = dueOn({ chain: once, prospect: business, sent: [sentOn(1, 1)], now: day(60) })
  same(owed.ended, ENDINGS.COMPLETE, 'ended')
  same(owed.owed, null, 'the step owed')
})

check('a chain ends when its last step has gone', () => {
  const owed = dueOn({
    chain: intro,
    prospect: business,
    sent: [sentOn(1, 1), sentOn(2, 15)],
    now: day(90),
  })
  same(owed.ended, ENDINGS.COMPLETE, 'ended')
})

// ── Counted from the first letter, not the last ─────────────────────────

check('a late step does not push the steps behind it later', () => {
  // The studio counted the gap from the moment a business was last written to,
  // so a letter held back a day moved every letter behind it a day later. Here
  // step two going out four days late leaves step three on its own day.
  const late = [sentOn(1, 1), sentOn(2, 8)]
  const third = dueOn({ chain: preview, prospect: business, sent: late, now: day(9) })
  same(third.owed, 3, 'the step owed')
  same(third.dueAt, day(9).toISOString(), 'still day eight from the first letter')
  same(third.ready, true, 'ready on its own day rather than five days later')
})

check('a step whose day has already passed is due at once rather than skipped', () => {
  const held = [sentOn(1, 1), sentOn(2, 20)]
  const third = dueOn({ chain: preview, prospect: business, sent: held, now: day(21) })
  same(third.owed, 3, 'the step owed')
  same(third.ready, true, 'ready')
})

check('a step delivered twice is counted once, from the earlier delivery', () => {
  const twice = [sentOn(1, 5), sentOn(1, 1)]
  const owed = dueOn({ chain: intro, prospect: business, sent: twice, now: day(15) })
  same(owed.startedAt, day(1).toISOString(), 'the chain started on the earlier one')
  same(owed.ready, true, 'ready a fortnight after the earlier one')
})

check('a send with no moment on it is passed over rather than read as now', () => {
  const owed = dueOn({
    chain: intro,
    prospect: business,
    sent: [{ step: 1, sent_at: null }],
    now: day(15),
  })
  same(owed.owed, 1, 'still owed its first step')
})

// ── What ends a chain ───────────────────────────────────────────────────

for (const [column, ending] of [
  ['replied_at', ENDINGS.REPLIED],
  ['unsubscribed_at', ENDINGS.UNSUBSCRIBED],
  ['bounced_at', ENDINGS.BOUNCED],
]) {
  check(`${column} ends every chain, whatever the chain says`, () => {
    const owed = dueOn({
      chain: intro,
      prospect: { ...business, [column]: day(2).toISOString() },
      sent: [sentOn(1, 1)],
      now: day(15),
    })
    same(owed.ended, ending, 'ended')
    same(owed.ready, false, 'ready')
  })
}

check('a suppressed business is off every chain', () =>
  same(
    dueOn({ chain: intro, prospect: { ...business, suppressed: true }, sent: [], now: day(1) })
      .ended,
    ENDINGS.UNSUBSCRIBED,
    'ended'
  )
)

check("a chain's own exit column ends it", () => {
  const fixed = { ...business, cert_fixed: true }
  same(
    dueOn({ chain: broken, prospect: fixed, sent: [sentOn(1, 1)], now: day(6) }).ended,
    ENDINGS.EXITED,
    'ended'
  )
  same(
    dueOn({ chain: broken, prospect: business, sent: [sentOn(1, 1)], now: day(6) }).ended,
    null,
    'a business whose certificate is still expired stays on'
  )
})

check('a chain exit written as a function is asked about the row', () => {
  const chain = { ...broken, exits: [row => row.name === 'A Shop'] }
  same(dueOn({ chain, prospect: business, sent: [], now: day(1) }).ended, ENDINGS.EXITED, 'ended')
})

check('an unclaimed draft comes down on its own day, whatever step it reached', () => {
  const sent = [sentOn(1, 1)]
  same(dueOn({ chain: preview, prospect: business, sent, now: day(21) }).ended, null, 'on day 20')
  const gone = dueOn({ chain: preview, prospect: business, sent, now: day(22) })
  same(gone.ended, ENDINGS.EXPIRED, 'on day 21')
  same(gone.owed, null, 'the step owed')
})

check('a chain with no expiry never expires, it only runs out of steps', () => {
  const whole = [sentOn(1, 1), sentOn(2, 15)]
  same(
    dueOn({ chain: intro, prospect: business, sent: whole, now: day(400) }).ended,
    ENDINGS.COMPLETE,
    'the cold intro'
  )
  // The preview would have expired on day twenty-one; the intro has no expiry
  // and simply ends when its last step has gone.
  same(
    dueOn({ chain: preview, prospect: business, sent: [sentOn(1, 1)], now: day(400) }).ended,
    ENDINGS.EXPIRED,
    'the preview'
  )
})

check('a chain that has ended is never reopened', () => {
  const replied = { ...business, replied_at: day(2).toISOString() }
  for (const n of [3, 15, 30, 100]) {
    same(
      dueOn({ chain: intro, prospect: replied, sent: [sentOn(1, 1)], now: day(n) }).ready,
      false,
      `day ${n}`
    )
  }
})

check('dueOn refuses to work without the moment it is being asked about', async () =>
  ok(
    await refusal(() => dueOn({ chain: intro, prospect: business, sent: [] })),
    'it answered anyway'
  )
)

// ── A step that is not a letter ─────────────────────────────────────────

check('a call is a step like any other and falls due on its own day', () => {
  const owed = dueOn({ chain: broken, prospect: business, sent: [sentOn(1, 1)], now: day(6) })
  same(owed.owed, 2, 'the step owed')
  same(owed.step.channel, 'call', 'the channel')
  same(owed.ready, true, 'ready on day five')
})

check('a letter after a call falls due counted from the first letter', () => {
  const owed = dueOn({
    chain: broken,
    prospect: business,
    sent: [sentOn(1, 1), sentOn(2, 6)],
    now: day(15),
  })
  same(owed.owed, 3, 'the step owed')
  same(owed.step.channel, 'email', 'the channel')
  same(owed.ready, true, 'ready on day fourteen')
})

// ── Everybody ready at once ─────────────────────────────────────────────

const rows = [
  { id: 'new', name: 'New', source: 'places' },
  { id: 'waiting', name: 'Waiting', source: 'places' },
  { id: 'due', name: 'Due', source: 'places' },
  { id: 'replied', name: 'Replied', source: 'places', replied_at: day(2).toISOString() },
  { id: 'preview-due', name: 'Preview', source: 'preview' },
]
const sent = new Map([
  ['waiting', [sentOn(1, 10)]],
  ['due', [sentOn(1, 1)]],
  ['replied', [sentOn(1, 1)]],
  ['preview-due', [sentOn(1, 1)]],
])

check('only the businesses actually ready come back', () => {
  const ready = readyNow({ registry, prospects: rows, sent, now: day(15) }).map(
    one => one.prospect.id
  )
  // The preview's second letter fell due on day three and the intro's reminder
  // on day fourteen, so the preview leads; the business owed a first letter
  // has no calendar day and comes last.
  same(ready.join(' '), 'preview-due due new', 'the businesses ready')
})

check('each one comes back with the chain it is on and the step it is owed', () => {
  const ready = readyNow({ registry, prospects: rows, sent, now: day(15) })
  const found = new Map(ready.map(one => [one.prospect.id, one]))
  same(found.get('due').chain.id, 'intro', "the mapped business's chain")
  same(found.get('due').owed, 2, 'its step')
  same(found.get('preview-due').chain.id, 'preview', "the preview business's chain")
  same(found.get('preview-due').owed, 2, 'its step')
})

check('the oldest due comes first, and a first letter last', () => {
  const ready = readyNow({ registry, prospects: rows, sent, now: day(30) }).map(
    one => one.prospect.id
  )
  // 'due' fell due on day 14 and 'waiting' on day 23, so 'due' leads; 'new'
  // has no calendar day at all and sorts behind both.
  same(ready.join(' '), 'due waiting new', 'the order')
})

check('asking for one step gives only the businesses owed that step', () => {
  const firsts = readyNow({ registry, prospects: rows, sent, now: day(15), step: 1 })
  same(firsts.map(one => one.prospect.id).join(' '), 'new', 'first letters')
  const seconds = readyNow({ registry, prospects: rows, sent, now: day(15), step: 2 })
  same(seconds.map(one => one.prospect.id).join(' '), 'preview-due due', 'second letters')
})

check('two runs over the same rows answer in the same order', () => {
  const once = readyNow({ registry, prospects: rows, sent, now: day(30) })
  const twice = readyNow({ registry, prospects: [...rows].reverse(), sent, now: day(30) })
  same(
    once.map(one => one.prospect.id).join(' '),
    twice.map(one => one.prospect.id).join(' '),
    'the order'
  )
})

await finish({ hint: 'src/engine/due.js reads the days off each chain.' })

console.log(`due: ${cases.length} checks passed`)
