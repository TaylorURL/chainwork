/**
 * The engine: what a chain is owed next, and the ports a host fills in to act
 * on the answer.
 *
 * Pure so far. Nothing here opens a connection or hands anything to a mail
 * server; the adapters under src/adapters do that, and a host may write its
 * own instead.
 */

export * from './due.js'
