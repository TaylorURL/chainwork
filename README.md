# chainwork

Outreach chains. One file describes a chain, one engine runs them all.

A chain is a sequence of touches to one business, a letter then a call then
another letter, with the days between them, what puts a business on it, and
what takes it off. Writing that down once is the whole idea. Adding a chain is
adding a file.

This is TaylorURL's outreach lifted out of the studio so a second site can use
it. Every decision in here was already made and already running. What changed
is that the letters, the brand and the host now arrive as arguments.

## Layers

```
core        pure. no database, no network, no clock of its own.
engine      what a chain is owed next. pure.
chains      the manifests. one file per chain, the host's own.
adapters    the host's own: a database, a mail server, a lead finder.
```

Only the first two ship here. A caller only ever imports the layer beneath it.
The core is browser-safe, so a console can bundle it beside the table it draws,
with one exception named out loud: `core/prospects/address.js` asks DNS whether
a domain can take mail, so it is server-side and kept out of the barrel.

## A chain

```js
import { defineChain, fromCode } from 'chainwork/core'

export default defineChain({
  id: 'broken-site',
  name: 'Broken site',
  source: 'broken-site',
  exits: ['cert_fixed'],
  steps: [
    { at: 0, channel: 'email', letter: fromCode(openingLetter), needs: ['cert_expires_at'] },
    { at: 5, slug: 'call', channel: 'call' },
    { at: 14, slug: 'last', channel: 'email', letter: fromCode(lastLetter) },
  ],
})
```

`at` is days after the business's **first** letter on the chain, not after the
one before. A step held back over a weekend therefore catches up rather than
pushing every step behind it later, which is the one thing the studio's own
version got wrong and only showed on a Monday.

`channel` is how the step reaches somebody: `email`, `call`, `sms`, `post` or
`retarget`. A step that is not a letter is a step like any other. It falls due
on its own day and it is recorded on the same timeline.

A step may carry `variants`, two letters written for the same day and drawn
between by weight. That is how a subject line is tested. The first keeps the
id already stored; each one after it names its own slug.

## Putting one together

```js
import { createChains } from 'chainwork/core'
import { readyNow } from 'chainwork/engine'

const registry = createChains({ chains, segments, segmentOf })

const due = readyNow({ registry, prospects, sent, now: new Date() })
```

`registry` answers everything that used to be worked out in three places: the
letters, which chain a letter belongs to, which chain a business is on, and
what day each step falls due. `readyNow` answers who is owed what, in the order
they fell due, oldest first and first letters last.

Nothing in either of those sends anything. The host does that, through its own
adapters, which is what keeps a package that is imported from being a package
that can mail on import.

## Ids never move

A letter's id is stored on every message ever sent under it, so renaming one
detaches that history from the letter that made it. An id is the segment, the
chain id and the step's slug, and the derivation is fixed: step one leaves the
slug off, which is what the studio's four letters were already called, and
every step after it carries its own. A step may also state an id outright,
which is how a chain adopts letters that were registered by hand before it
existed.

## The rest of the core

Chains are the new half. The rest came over as it was, because the hard parts
of outreach were never the sending.

- `sending/ramp.js` moves the day's cap on its own while the trailing bounce
  rate stays clean, and rolls it back and stops on a breach. A ceiling somebody
  has to raise by hand every morning is a ceiling never reached.
- `sending/mailbox.js` tells a refusal about one recipient from a refusal of
  the mailbox, and rests the mailbox on the second. Knocking again after Gmail
  has closed the door reads worse than the letters do.
- `sending/rank.js` holds the queue's whole ordering in one place, so the read
  that pages the queue and the comparator that sorts it cannot disagree. When
  they do, the best leads are never in the rows anybody looked at and a
  truncated read looks exactly like a healthy one.
- `prospects/exclusions.js` marks the rows cold outreach does not write to.
  Every rule marks and none removes, so a row skipped this week is found again
  next week and stays skipped rather than being weighed from nothing.

## Running the checks

```bash
npm test
```

Each check is its own file and its own process, because some of them install
something once, a zone or a held-domain list, and a check sharing a process
with one of those is reading a module somebody else configured. The first
failure stops the run.

Built with Node 22 and no dependencies. Proprietary; all rights reserved, see
[LICENSE.md](LICENSE.md).
