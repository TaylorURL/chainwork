# chainwork

Outreach chains. One file describes a chain; one engine runs them all.

A chain is a sequence of touches to one business — a letter, then a call, then
another letter — with the days between them, what puts a business on it, and
what takes it off. Writing that down once is the whole idea. Adding a chain is
adding a file.

This is TaylorURL's outreach lifted out of the studio so a second site can use
it. Every decision in here was already made and already running; what changed
is that the letters, the brand and the host now arrive as arguments.

## What it is for

A studio or agency that reaches out to businesses: finds them, works out which
are worth writing to, writes, follows up, reads the replies, and keeps a list
clean enough that the mail arrives. The hard parts are not the sending. They
are the warm-up ladder per address, the rest after a mail server refuses the
mailbox, the queue ordering that cannot truncate its own best leads, the
exclusion rules that read in both directions, and the sequence arithmetic that
does not drag a chain later every time a step slips. All of that is here.

## Layers

```
core        pure. no database, no network, no clock of its own.
engine      what a chain is owed next. pure.
adapters    the host's own: a database, a mail server, a lead finder.
chains      the manifests. one file per chain.
```

A caller only ever imports the layer beneath it. The core is browser-safe, so a
console can bundle it beside the table it draws, with one exception named out
loud: `core/prospects/address.js` asks DNS whether a domain can take mail, so
it is server-side and kept out of the barrel.

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

`channel` is how the step reaches somebody — `email`, `call`, `sms`, `post`,
`retarget`. A step that is not a letter is a step like any other: it falls due
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
detaches that history from the letter that made it. Ids are derived from the
chain id and the step's slug and the derivation is fixed: step one takes the
chain id alone, and every step after it takes the chain id and its slug. A step
may also state an id outright, which is how a chain adopts letters that were
registered by hand before it existed.

## Running the checks

```bash
npm test
```

Each check is its own file and its own process, because some of them install
something once — a zone, a held-domain list — and a check sharing a process
with one of those is reading a module somebody else configured.

## License

Proprietary; all rights reserved. See [LICENSE.md](LICENSE.md).
