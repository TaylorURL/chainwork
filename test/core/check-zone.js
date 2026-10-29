/**
 * The zone a schedule is read in, and why it closes.
 *
 * The zone is a fact about the host, so it can be moved. What it cannot do is
 * move halfway through a day: a schedule laid out in one zone and read back in
 * another is a day of letters at the wrong hour, and the reading that spots it
 * is the one nobody does. So the first time anything reads a time, the zone is
 * closed, and a later attempt to move it is refused rather than honoured.
 */

import { ZONE, clockIn, installZone } from '../../src/core/zone.js'
import { cases, check, finish, ok, refusal, same } from '../harness/checks.js'

check('it ships set to Central, which is where TaylorURL trades', () =>
  same(ZONE, 'America/Chicago', 'ZONE'))

check('installing the zone it is already on changes nothing', () => {
  installZone('America/Chicago')
  same(ZONE, 'America/Chicago', 'ZONE')
})

check('a zone Intl does not know is refused', async () =>
  ok(await refusal(() => installZone('Mars/Olympus')), 'it was accepted'))

check('an unnamed zone is refused', async () => {
  ok(await refusal(() => installZone('')), 'an empty name was accepted')
  ok(await refusal(() => installZone(null)), 'nothing was accepted')
})

check('the zone moves before anything has read a time', () => {
  installZone('America/New_York')
  same(ZONE, 'America/New_York', 'ZONE')
})

check('a caller that imported ZONE reads the zone in force, not the one it loaded under', () =>
  same(ZONE, 'America/New_York', 'ZONE'))

check('reading a time in New York reads it in New York', () => {
  // Eight in the evening UTC is four in the afternoon on the eastern seaboard.
  const read = clockIn(new Date(Date.UTC(2026, 9, 28, 20, 0, 0)))
  same(read.date, '2026-10-28', 'the date')
  same(read.minutes, 16 * 60, 'the minutes past midnight')
})

check('the zone is refused once a time has been read in it', async () => {
  const said = await refusal(() => installZone('Europe/London'))
  ok(said, 'it was accepted after a time had been read')
  ok(said.includes('before anything reads a time'), `the refusal said ${JSON.stringify(said)}`)
  same(ZONE, 'America/New_York', 'the zone still in force')
})

await finish({ hint: 'src/core/zone.js holds the zone and closes it.' })

console.log(`zone: ${cases.length} checks passed`)
