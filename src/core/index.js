/**
 * The core: everything that decides something without reaching a database, a
 * mail server or a clock of its own.
 *
 * It is one barrel rather than a dozen imports, and every name here is the
 * name TaylorURL already called it by. A caller that wants one module imports
 * it directly - `chainwork/core/sending/limits.js` - which is what a browser
 * bundle should do; the barrel is for a server that wants the lot.
 *
 * Browser-safe, with one exception stated out loud: `prospects/address.js`
 * asks DNS whether a domain can receive mail, so it imports Node's resolver
 * and is not part of this barrel. A console that needs the address *rules*
 * imports the shape half from that file on a server, or asks the engine.
 */

export * from './zone.js'
export * from './rows.js'
export * from './timed.js'
export * from './first-names.js'

export * from './audit/bands.js'

export * from './prospects/opportunity.js'
export * from './prospects/segments.js'
export * from './prospects/platforms.js'
export * from './prospects/youth.js'
export * from './prospects/stages.js'
export * from './prospects/map.js'
export * from './prospects/lawsuits.js'

export * from './sending/limits.js'
export * from './sending/schedule.js'
export * from './sending/ramp.js'
export * from './sending/rank.js'
export * from './sending/replies.js'

export * from './letters/registry.js'
export * from './chains/manifest.js'
export * from './chains/registry.js'
