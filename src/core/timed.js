/**
 * A request that gives up rather than holding a function open on a stalled
 * read.
 *
 * A serverless function billed by the second and killed at its ceiling has two
 * ways to end badly on a slow upstream: it holds the whole allowance open and
 * then dies with nothing to say, or it dies mid-write. Both start the same way,
 * with a fetch that has no clock on it, so every request leaving this codebase
 * carries one.
 */

/** How long a request is given when the caller names no ceiling of its own. */
const DEFAULT_TIMEOUT_MS = 10_000

/**
 * `fetch`, with a deadline.
 *
 * @param {string|URL|Request} input What to ask for.
 * @param {RequestInit} [init] The request, less its signal, which this owns.
 * @param {number} [timeoutMs] The deadline.
 * @returns {Promise<Response>} Rejects with a `TimeoutError` at the deadline.
 */
export function timedFetch(input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}
