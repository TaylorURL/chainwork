/**
 * The domains the host owns or has built, which are the ones no cold letter
 * may ever reach.
 *
 * A client trades in the towns the sourcing searches, under a trade it
 * searches for, so it turns up in the queue like any other business. A letter
 * offering to build the site the studio already built is the one message that
 * costs a relationship rather than a stranger's attention, and it arrives
 * signed by the person they pay.
 *
 * Which domains those are used to be written into this module. It is the
 * host's list, not the package's, so it is installed - and the two lists stay
 * apart, because a domain held at somebody's request and a site the host built
 * are two different reasons and a person reading the console is owed the right
 * one.
 */

import {
  HELD_REASON,
  STUDIO_REASON,
  heldDomainOf,
  heldReasonOf,
  installHeldDomains,
  installOwnDomains,
  ownDomainsHeld,
} from '../../src/core/prospects/exclusions.js'
import { cases, check, finish, ok, refusal, same } from '../harness/checks.js'

// Asked before anything is installed, and asked now rather than deferred to
// the run: the installs below happen when this file loads, so a deferred case
// would be reading a module somebody had already configured.
const beforeLoading = await refusal(() => heldDomainOf('example.com'))
check('nothing can be judged before the held list has been read', () => {
  ok(beforeLoading, 'it answered with no list loaded')
  ok(beforeLoading.includes('never loaded'), `the refusal said ${JSON.stringify(beforeLoading)}`)
})

installHeldDomains(['asked-to-stop.example'])
installOwnDomains([
  'taylorurl.com',
  'baytownwebdevelopment.com',
  // As a full address, which is how a portfolio entry gives one.
  'https://www.a-client.example/work',
])

check('a domain nobody held is free to write to', () =>
  same(heldDomainOf('a-stranger.example'), null, 'heldDomainOf'))

check('a domain held at somebody’s request is held', () =>
  same(heldDomainOf('asked-to-stop.example'), 'asked-to-stop.example', 'heldDomainOf'))

check('a domain the host owns is held', () =>
  same(heldDomainOf('taylorurl.com'), 'taylorurl.com', 'heldDomainOf'))

check('a site the host built is held', () =>
  same(heldDomainOf('a-client.example'), 'a-client.example', 'heldDomainOf'))

check('a subdomain of a held domain is held', () =>
  same(heldDomainOf('shop.a-client.example'), 'a-client.example', 'heldDomainOf'))

check('the two lists keep their own reasons apart', () => {
  same(heldReasonOf('asked-to-stop.example'), HELD_REASON, 'a domain held by request')
  same(heldReasonOf('a-client.example'), STUDIO_REASON, 'a site the host built')
  same(heldReasonOf('taylorurl.com'), STUDIO_REASON, 'a domain the host owns')
})

check('an address is read down to its host', () =>
  ok(ownDomainsHeld().includes('a-client.example'), `the list holds ${ownDomainsHeld().join(', ')}`))

check('anything that does not read as a host is left out rather than guessed at', () => {
  installOwnDomains(['taylorurl.com', '', null, undefined, '   '])
  same(ownDomainsHeld().join(' '), 'taylorurl.com', 'the list')
})

check('a host that owns nothing is an ordinary state', () => {
  installOwnDomains([])
  same(ownDomainsHeld().length, 0, 'the list')
  same(heldDomainOf('taylorurl.com'), null, 'a domain nothing holds any more')
  same(heldDomainOf('asked-to-stop.example'), 'asked-to-stop.example', 'the requested list stands')
})

await finish({ hint: 'src/core/prospects/exclusions.js holds both lists.' })

console.log(`own domains: ${cases.length} checks passed`)
