/**
 * Where businesses come from, behind one shape, and what a sweep does when one
 * source fails.
 *
 * The behaviour worth pinning is that it carries on. A pipeline that stopped
 * at the first refused source is a pipeline a single outage could empty, and
 * the emptying would read from the run rows as ordinary work.
 */

import { createSources, deduped, sweep } from '../../src/engine/sources.js'
import { cases, check, finish, ok, refusal, same } from '../harness/checks.js'

const row = (source, ref, payload = {}) => ({ source, ref, payload })

const map = { id: 'places', find: () => [row('places', 'a'), row('places', 'b')] }
const docket = { id: 'lawsuits', find: () => [row('lawsuits', 'c')] }
const broken = {
  id: 'broken-site',
  find: () => {
    throw new Error('the certificate reader timed out')
  },
}
const sloppy = {
  id: 'sloppy',
  find: () => [row('sloppy', 'd'), { source: 'sloppy' }, null, { ref: 'e' }],
}

check('a source is registered under its own id', () => {
  const sources = createSources([map, docket])
  same(sources.ids.join(' '), 'places lawsuits', 'the sources')
})

check('a source with no way to find anything is refused', async () =>
  ok(await refusal(() => createSources([{ id: 'empty' }])), 'it was accepted')
)

check('two sources with one id are refused', async () => {
  const said = await refusal(() => createSources([map, { id: 'places', find: () => [] }]))
  ok(said, 'it was accepted')
  ok(said.includes('places'), `the refusal said ${JSON.stringify(said)}`)
})

check('no sources at all is refused', async () =>
  ok(await refusal(() => createSources([])), 'an empty list was accepted')
)

check('a sweep answers every row every source found', async () => {
  const found = await sweep({ sources: createSources([map, docket]) })
  same(found.found.map(one => one.ref).join(' '), 'a b c', 'the rows')
  same(found.ran.map(one => `${one.id}:${one.found}`).join(' '), 'places:2 lawsuits:1', 'the run')
})

check('a sweep carries on past a source that failed', async () => {
  const found = await sweep({ sources: createSources([broken, map]) })
  same(found.found.map(one => one.ref).join(' '), 'a b', 'the rows the others found')
  const failed = found.ran.find(one => one.id === 'broken-site')
  ok(failed.error.includes('timed out'), `it recorded ${JSON.stringify(failed.error)}`)
  same(found.ran.find(one => one.id === 'places').error, null, 'the source that worked')
})

check('a row nothing could find again is counted and left', async () => {
  const found = await sweep({ sources: createSources([sloppy]) })
  same(found.found.map(one => one.ref).join(' '), 'd', 'the rows kept')
  same(found.ran[0].dropped, 3, 'the rows dropped')
})

check('a sweep can be held to the sources named', async () => {
  const found = await sweep({ sources: createSources([map, docket]), only: ['lawsuits'] })
  same(found.found.map(one => one.ref).join(' '), 'c', 'the rows')
  same(found.ran.length, 1, 'the sources swept')
})

check('a source is handed whatever the host put in the context', async () => {
  let given = null
  const asks = {
    id: 'asks',
    find: context => {
      given = context
      return []
    },
  }
  await sweep({ sources: createSources([asks]), context: { key: 'a key', db: 'a client' } })
  same(given.key, 'a key', 'the key')
  same(given.db, 'a client', 'the client')
})

check('a source that answers nothing at all is not a failure', async () => {
  const quiet = { id: 'quiet', find: () => undefined }
  const found = await sweep({ sources: createSources([quiet]) })
  same(found.ran[0].error, null, 'the error')
  same(found.ran[0].found, 0, 'what it found')
})

// ── The same thing found twice ──────────────────────────────────────────

check('a thing found twice by one source is one row', () =>
  same(deduped([row('places', 'a'), row('places', 'a')]).length, 1, 'rows')
)

check('the same reference under two sources is two rows', () =>
  same(deduped([row('places', 'a'), row('lawsuits', 'a')]).length, 2, 'rows')
)

check('the first of a pair stands, since the host registered that order', () => {
  const first = row('places', 'a', { from: 'the map' })
  const second = row('places', 'a', { from: 'the docket' })
  same(deduped([first, second])[0].payload.from, 'the map', 'the row kept')
})

await finish({ hint: 'src/engine/sources.js holds the shape; the host writes the sources.' })

console.log(`sources: ${cases.length} checks passed`)
