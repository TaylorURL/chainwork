/**
 * Four chains shaped exactly like TaylorURL's, with placeholder words.
 *
 * The ids, the families, the sources, the day offsets and the per-step
 * footers are the studio's real ones, because the ids are stored on live
 * messages and the whole point of the manifests is that they take over without
 * a single stored id moving. The paragraphs are placeholders: a package's test
 * suite has no business holding one studio's sales copy, and nothing here
 * depends on what a letter says.
 */

import { defineChain, fromCode, fromRow } from '../../src/core/chains/manifest.js'

const words = name =>
  fromCode(prospect => ({
    subject: `${name} for ${prospect?.name ?? 'a business'}`,
    paragraphs: [`${name} body`],
  }))

/** The cold intro. Its id and its family differ, and both are already stored. */
export const INTRODUCTION = defineChain({
  id: 'intro',
  family: 'introduction',
  name: 'Introduction',
  about: 'Who is writing, what they do, and nothing asked for.',
  source: null,
  steps: [
    { at: 0, channel: 'email', letter: words('Introduction'), plain: true },
    {
      at: 14,
      slug: 'meeting',
      channel: 'email',
      letter: words('Meeting Ask'),
      plain: true,
      unsubscribeLink: false,
    },
  ],
})

export const LAWSUIT = defineChain({
  id: 'lawsuit',
  name: 'Accessibility Lawsuit',
  source: 'lawsuits',
  steps: [
    { at: 0, channel: 'email', letter: words('Lawsuit'), needs: ['case_filed_on'], plain: true },
    {
      at: 14,
      slug: 'follow-up',
      channel: 'email',
      letter: words('Lawsuit Follow-Up'),
      plain: true,
      unsubscribeLink: false,
    },
  ],
})

/** The draft preview: words written per business and filed on the row. */
export const PREVIEW = defineChain({
  id: 'preview',
  name: 'Draft preview',
  source: 'preview',
  sender: { name: 'Trenton Taylor' },
  expiresAfter: 21,
  steps: [
    { at: 0, channel: 'email', letter: fromRow('letter', { version: 2 }) },
    { at: 3, slug: 'second', channel: 'email', letter: fromRow('letter', { version: 2 }) },
    { at: 8, slug: 'third', channel: 'email', letter: fromRow('letter', { version: 2 }) },
    { at: 18, slug: 'last', channel: 'email', letter: fromRow('letter', { version: 2 }) },
  ],
})

export const NEW_BUSINESS = defineChain({
  id: 'new-business',
  name: 'New business',
  source: 'filings',
  steps: [{ at: 0, channel: 'email', letter: words('New business'), plain: true }],
})

/** A chain with a call in the middle, which is what the email-only one could not do. */
export const BROKEN_SITE = defineChain({
  id: 'broken-site',
  name: 'Broken site',
  source: 'broken-site',
  exits: ['cert_fixed'],
  steps: [
    { at: 0, channel: 'email', letter: words('Broken site'), needs: ['cert_expires_at'] },
    { at: 5, slug: 'call', channel: 'call' },
    {
      at: 14,
      slug: 'last',
      channel: 'email',
      letter: words('Broken site last'),
      unsubscribeLink: false,
    },
  ],
})

export const FOUR = Object.freeze([INTRODUCTION, LAWSUIT, PREVIEW, NEW_BUSINESS])
export const FIVE = Object.freeze([...FOUR, BROKEN_SITE])

/** The studio's segments, in the order its registry lists them. */
export const SEGMENTS = Object.freeze(['scored', 'social', 'unmeasured'])

/** A stand-in for how a row's segment is read, which the core does for real. */
export const segmentOf = row =>
  row?.site_kind === 'social' ? 'social' : row?.audit_score == null ? 'unmeasured' : 'scored'
