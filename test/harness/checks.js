/**
 * The runner every check under scripts/ reports through.
 *
 * A check is a sentence and whatever decides it. A function is a case: `finish`
 * calls it later, in the order it was checked, and the first assertion to throw
 * inside it is its failure. Anything else is decided where it stands, which is
 * how a check walking a table or a tree says what held at each row without
 * stopping at the first that did not.
 *
 * A failure is printed the moment it is known and the run carries on, so one
 * pass reports every fault rather than the first. `finish` then ends the process
 * non-zero if anything failed, which is what `npm test` stops on, so the
 * sentence a script closes on is only ever printed by a run in which everything
 * held.
 */
import { basename } from 'node:path'
import { inspect } from 'node:util'

// Held as the console stood when this loaded. Several checks silence
// `console.error` while the code under test logs what it is right to log, and a
// failure found in that stretch still has to reach whoever is reading the run.
const print = console.log.bind(console)
const complain = console.error.bind(console)

/** Every check made so far, as `[sentence, decision]`, in the order it was made. */
export const cases = []

let failures = 0

function failed(name, cause) {
  failures += 1
  const said = cause === undefined ? [] : String(cause?.message ?? cause).split('\n')
  complain([`FAIL  ${name}`, ...said.map(line => `      ${line}`)].join('\n'))
}

/**
 * Checks one thing. `decide` is a function to run later, or a value already
 * known, where anything falsy is the failure.
 */
export function check(name, decide) {
  if (typeof name !== 'string') {
    throw new TypeError(
      `a check is named by its sentence, and this one was handed ${inspect(name)}`
    )
  }
  cases.push([name, decide])
  if (typeof decide !== 'function' && !decide) failed(name)
}

/** Records a failure found outside any case. */
export function fail(message) {
  check(message, false)
}

/** Records `complaint` as a failure unless `condition` holds, for checks that name the fault. */
export function expect(condition, complaint) {
  check(complaint, Boolean(condition))
}

const shown = value => inspect(value, { breakLength: Infinity })
const mismatch = (got, want, what) => `${what}: expected ${shown(want)}, got ${shown(got)}`

/** Records a failure unless `got` is `want`, for comparisons made outside any case. */
export function is(where, got, want) {
  check(got === want ? where : mismatch(got, want, where), got === want)
}

/** Ends a case unless `got` is `want`. */
export function same(got, want, what) {
  if (got !== want) throw new Error(mismatch(got, want, what))
}

/** Ends a case unless `condition` holds. */
export function ok(condition, what) {
  if (!condition) throw new Error(what)
}

/** Ends a case with every fault it collected, if it collected any. */
export function report(faults) {
  if (faults.length) throw new Error(faults.join('\n'))
}

/**
 * What `run` threw, or null when it did not throw. A refusal is often what a
 * case is about, so it is held as a value the case can ask about - its kind, its
 * code, its reason - rather than as a throw that would end the case.
 */
export async function raised(run) {
  try {
    await run()
    return null
  } catch (cause) {
    return cause
  }
}

/** The reason `run` refused, or null when it did not refuse. */
export async function refusal(run) {
  try {
    await run()
  } catch (cause) {
    return cause.message
  }
  return null
}

/**
 * Runs `run` with `console.error` held back, and answers what it answered. The
 * code under test logs the refusals it is right to log, and a passing run should
 * read as a passing run rather than as a page of the errors it proved were
 * handled.
 */
export async function quietly(run) {
  const held = console.error
  console.error = () => {}
  try {
    return await run()
  } finally {
    console.error = held
  }
}

// How far into `cases` the runner has got, so a script can finish one stretch
// of checks, say what held, and go on to check more without running the first
// stretch twice.
let ran = 0

/**
 * Runs every case not yet run, in the order it was checked, and answers how
 * many passed.
 *
 * A case that returns a promise is awaited before the next one starts, and a
 * case that returns nothing is followed straight away, so a run of synchronous
 * cases never yields between two of them. `listed` prints each case as it
 * passes. When anything has failed, the count is followed by `hint`, the line
 * that tells a reader where to look, and the process ends.
 */
export function finish({ hint, listed = false } = {}) {
  let passed = 0
  const pass = name => {
    passed += 1
    if (listed) print(`  ok  ${name}`)
  }
  const next = () => {
    while (ran < cases.length) {
      const [name, decide] = cases[ran]
      ran += 1
      if (typeof decide !== 'function') continue
      let outcome
      try {
        outcome = decide()
      } catch (cause) {
        failed(name, cause)
        continue
      }
      if (typeof outcome?.then === 'function') {
        return outcome
          .then(
            () => pass(name),
            cause => failed(name, cause)
          )
          .then(next)
      }
      pass(name)
    }
    if (failures) {
      const script = basename(process.argv[1] ?? 'check', '.js')
      complain(`\n${script}: ${failures} ${failures === 1 ? 'check' : 'checks'} failed`)
      if (hint) complain(hint)
      process.exit(1)
    }
    return passed
  }
  return next()
}
