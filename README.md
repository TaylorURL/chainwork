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
engine      what a chain is owed next, and the contracts a host fills in. pure.
adapters    one per source. the judging is pure. only site-health opens a socket.
chains      the chain files. one per chain.
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

## Channels and sources

A channel is how a step reaches somebody: an object with a `send`, registered
under the name a step uses. `assertChannelsFor` is given the chains and the
registered channels at startup and refuses the pair where a chain names one
nothing can send, so that fault arrives when the host starts rather than when a
business was due a call.

A source is where businesses come from, `{ id, find }`, answering rows shaped
`{ source, ref, payload }`. One `sweep` walks every registered source, and a
source that fails does not stop the others: a pipeline that stopped at the
first refused source is a pipeline one outage could empty.

## The triggers

A source is written per directory under `adapters`, and each splits the same
way: a judge that decides from one row and nothing else, and a thin source
around it that walks the rows and files what the judge marked. The judge is
where the arguing happens, so it can be exercised without a network.

- `site-health` visits a site, reads the certificate off the handshake, and
  files the ones that are actually broken: an expired certificate, a home page
  that errors, a domain about to lapse. What it deliberately does not file is
  as important. A redirect, a slow answer and a page that refuses a robot all
  read as faults in the obvious version of this, and each would mean writing to
  the owner of a working site to say it is down. It stops with one visit's
  worth of its budget still in hand, so a sweep ends itself rather than being
  killed with the table half read.
- `builder` reads what made a page off its generator tag and its footer credit.
  The builders worth a letter are listed, and the ones to leave alone are
  listed at greater length, because that is the list that stops a mistake. A
  real run over the studio's own rows found a site whose tag said Elementor,
  and without that name down as fine the page read as one worth replacing,
  which is a letter arguing with a decision somebody made on purpose.
- `listing` reads faults off the columns a map sweep already stores, in the
  order the owner would fix them: marked closed, then no site, then no photos,
  then too few reviews. A business that has genuinely shut is not a lead, and
  neither is a row with no review count at all, which has not been read rather
  than having nothing to show.
- `growth` compares the reviews a business has now against the count it was
  filed at. A gain of ten and a gain of half what it started with both have to
  hold. Four hundred reviews to four hundred and twelve gained twelve and is
  not growing; six to eighteen gained twelve and tripled. Either test on its
  own reads half the table as growing.
- `reactivation` is the cheapest list there is, businesses already on file and
  left alone for a hundred and eighty days: the site that never answered, the
  row a rule put aside, the one that was written to and never replied. A
  business that asked to stop is never on it, and neither is one somebody took
  out by hand. A person's own decision is not something for a timer to
  overturn.

Only `site-health` opens a socket. `builder` is handed a `read` and the other
three need nothing but the rows already stored, so those three cost nothing at
the map and need no second account anywhere.

Both spellings of a permanently closed listing are held in one place in the
core. Google's places data has used `CLOSED_PERMANENTLY` and
`PERMANENTLY_CLOSED` over the life of the API, and a judge that knew one of
them would read a listing marked with the other as trading.

A business a trigger finds keeps the source it was found under and carries the
chain it was moved onto in a column of its own, which `chainFor` reads first. A
shop swept off the map whose certificate has just expired is still a shop off
the map. Writing the chain over the source would lose the second fact to record
the first.

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
