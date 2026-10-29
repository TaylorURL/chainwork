/**
 * The engine: what a chain is owed next, and the ports a host fills in to act
 * on the answer.
 *
 * Pure. Nothing here opens a connection or hands anything to a mail server: a
 * channel is an object the host registers and a source is a function the host
 * writes, so the only code that reaches outside a process is the host's own.
 */

export * from './due.js'
export * from './channels.js'
export * from './sources.js'
