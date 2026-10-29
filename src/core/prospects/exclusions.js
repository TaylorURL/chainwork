/**
 * The businesses cold outreach does not write to.
 *
 * Five rules live in one file because all five answer the same question at
 * the same moment: whether a row off a map search is a business that can hire
 * a studio this size. A brand list and a domain count between them catch
 * national franchises; a category list catches the organisations that cannot
 * buy from one at all; a size list catches the companies with a department
 * between the website and anybody who could say yes; and a held list carries
 * the domains a person has decided are not to be written to, whatever the
 * listing says. A host list in lib/outreach/prospects/platforms.js catches a listing
 * whose website belongs to a platform rather than to the business, and is
 * re-exported here so the rules read as one set.
 *
 * Every rule marks a row and none removes one. A prospect skipped this week is
 * found again next week under the same place id, and the sourcing job rewrites
 * a row's details without touching its stage, so a skipped row stays skipped
 * rather than being weighed again from nothing.
 */

import { bareHost, hostOf, platformOf, under } from './platforms.js'

export { bareHost, hostOf, platformOf } from './platforms.js'

/**
 * Separate towns one host appears in before that host reads as a chain.
 *
 * Two towns is a shop and a second shop. A business trading in Baytown and
 * again in Mont Belvieu is a successful independent, which is the best
 * customer on the list: there is revenue behind it and the person who decides
 * is still in the building. A national franchise occupies far more than two of
 * sixteen towns, so three costs the count nothing real and keeps the strongest
 * leads on the list.
 */
const CHAIN_TOWN_MIN = 3

// Characters a brand carries before it is looked for in a host at all. Below
// this a brand is short enough to be an ordinary syllable, and a franchise
// whose brand is shorter is still caught by its name.
const BRAND_HOST_MIN = 5

/**
 * National franchises, grouped by the trade each brand operates in.
 *
 * A franchise location has its website, its brand and its marketing settled at
 * a head office in another state. Nobody at the local number can commission a
 * site, so a message to one is spend against an answer that cannot arrive.
 *
 * A name counts as a franchise only where the prospect's trade agrees with the
 * group the brand sits in. 'Midas' filed under auto repair is a franchise and
 * 'Midas Touch Cleaning' is a cleaning company, and the two are the same
 * string; a haircut brand inside a plumber's name is a coincidence at the
 * level of the words. The trade is what separates them, and a brand ambiguous
 * enough that no group holds it falls to the domain count, which needs no list
 * and cares nothing for what a business calls itself.
 *
 * The host is read without the trade. A franchise domain belongs to the
 * franchise whatever a listing filed the location under.
 *
 * A group grows by one more name in its brands, or one more term in the trades
 * that reach it.
 */
const CHAIN_BRANDS = [
  {
    trades: [
      'plumber',
      'plumbing',
      'drain',
      'drains',
      'drain cleaning',
      'sewer',
      'septic',
      'rooter',
      'water heater',
      'water treatment',
      'leak detection',
      'well drilling',
    ],
    brands: [
      'Roto-Rooter',
      'Mr. Rooter',
      'Rooter-Man',
      'Benjamin Franklin Plumbing',
      'bluefrog Plumbing',
      'Zoom Drain',
      'Rescue Rooter',
      'ARS Rescue Rooter',
      'Len The Plumber',
      'Culligan',
      'Kinetico',
    ],
  },
  {
    trades: [
      'hvac',
      'hvac contractor',
      'heating',
      'cooling',
      'air conditioning',
      'ac repair',
      'furnace',
      'ductwork',
      'electrician',
      'electrical',
      'electric',
    ],
    brands: [
      'One Hour Heating',
      'One Hour Air Conditioning',
      'Aire Serv',
      'Service Experts',
      'Mr. Electric',
      'Mister Sparky',
      'Horizon Services',
      'Trane Comfort Specialist',
      'Airtron',
    ],
  },
  {
    trades: [
      'auto',
      'auto repair',
      'automotive',
      'car repair',
      'mechanic',
      'tire',
      'tires',
      'tyre',
      'oil change',
      'lube',
      'collision',
      'body shop',
      'muffler',
      'brake',
      'brakes',
      'transmission',
      'towing',
      'towing service',
      'tow truck',
      'wrecker',
      'windshield',
      'auto glass',
      'auto parts',
      'car wash',
      'auto detailing',
    ],
    brands: [
      'Jiffy Lube',
      'Valvoline Instant Oil Change',
      'Take 5 Oil Change',
      'Grease Monkey',
      'Express Oil Change',
      'Kwik Kar',
      'Midas',
      'Meineke',
      'AAMCO',
      'Firestone Complete Auto Care',
      'Goodyear Auto Service',
      'Pep Boys',
      'Monro Auto Service',
      'Mavis Tire',
      'Discount Tire',
      'Tires Plus',
      'Big O Tires',
      'Les Schwab',
      'NTB National Tire',
      'Christian Brothers Automotive',
      'Caliber Collision',
      'Gerber Collision',
      'Service King Collision',
      'Maaco',
      'Ziebart',
      'Precision Tune Auto Care',
      'Brakes Plus',
      'Tuffy Tire',
      'Sun Auto Service',
      'AutoZone',
      "O'Reilly Auto Parts",
      'Advance Auto Parts',
      'NAPA Auto Parts',
      'Batteries Plus',
    ],
  },
  {
    trades: [
      'barber',
      'barber shop',
      'barbershop',
      'hair',
      'hair salon',
      'haircut',
      'haircuts',
      'salon',
      'beauty salon',
      'hair stylist',
      'beauty',
      'nail salon',
      'day spa',
    ],
    brands: [
      'Great Clips',
      'Supercuts',
      'Sport Clips',
      'Fantastic Sams',
      'Cost Cutters',
      'SmartStyle',
      'Hair Cuttery',
      'Master Cuts',
      'Regis Salon',
      "Floyd's 99 Barbershop",
      "Roosters Men's Grooming",
      "V's Barbershop",
      'Bishops Cuts',
      "Sharkey's Cuts",
      'Pigtails and Crewcuts',
      'Drybar',
      'Sola Salon Studios',
      'Ulta Beauty',
      'My Salon Suite',
      'Phenix Salon Suites',
      'Salons by JC',
      'The Barbers',
    ],
  },
  {
    trades: [
      'pest control',
      'pest',
      'exterminator',
      'extermination',
      'termite',
      'mosquito',
      'wildlife removal',
      'lawn care',
      'lawn',
      'landscaping',
      'landscape',
      'tree service',
      'irrigation',
      'sprinkler',
    ],
    brands: [
      'Terminix',
      'Orkin',
      'Truly Nolen',
      'Massey Services',
      'Arrow Exterminators',
      'Aptive Environmental',
      'Mosquito Joe',
      'TruGreen',
      'Weed Man',
      'Lawn Doctor',
      'The Grounds Guys',
      'U.S. Lawns',
    ],
  },
  {
    trades: [
      'cleaning',
      'cleaning service',
      'cleaner',
      'maid service',
      'janitorial',
      'carpet cleaning',
      'pressure washing',
      'restoration',
      'water damage',
      'fire damage',
      'mold remediation',
      'handyman',
      'remodeling',
      'remodeler',
      'home improvement',
      'roofing',
      'roofing contractor',
      'roofer',
      'gutters',
      'siding',
      'window replacement',
      'windows',
      'garage door',
      'foundation repair',
      'painting',
      'painter',
    ],
    brands: [
      'Servpro',
      'Stanley Steemer',
      'Chem-Dry',
      'Rainbow Restoration',
      'Paul Davis Restoration',
      '911 Restoration',
      'Molly Maid',
      'Merry Maids',
      'The Maids',
      'Mr. Handyman',
      'Handyman Connection',
      'Ace Handyman Services',
      'LeafFilter',
      'Leaf Home',
      'Renewal by Andersen',
      'Champion Windows',
      'Bath Fitter',
      'Re-Bath',
      'Power Home Remodeling',
      'Erie Home',
      'Precision Garage Door',
      'Overhead Door',
      'Ram Jack',
      'Olshan Foundation',
      'Groundworks Foundation',
    ],
  },
  {
    trades: [
      'restaurant',
      'cafe',
      'coffee',
      'coffee shop',
      'diner',
      'pizza',
      'pizzeria',
      'bakery',
      'fast food',
      'sandwich shop',
      'taqueria',
      'barbecue',
      'bbq',
      'grill',
      'ice cream',
      'catering',
    ],
    brands: [
      "McDonald's",
      'Subway Sandwiches',
      'Starbucks',
      'Chick-fil-A',
      'Whataburger',
      'Taco Bell',
      'Burger King',
      "Wendy's",
      'Popeyes',
      'Sonic Drive-In',
      'Dairy Queen',
      'Jack in the Box',
      "Domino's",
      'Pizza Hut',
      'Papa Johns',
      'Little Caesars',
      'Chipotle',
      'Panda Express',
      'Panera Bread',
      'Jimmy Johns',
      'Firehouse Subs',
      "Raising Cane's",
      "Dunkin'",
      "Applebee's",
      "Chili's",
      'Olive Garden',
      'Cracker Barrel',
      'Waffle House',
      'Golden Corral',
      'Buffalo Wild Wings',
      'Wingstop',
      "Church's Chicken",
      "Arby's",
      'Del Taco',
      'Baskin-Robbins',
      'Chuck E. Cheese',
      "Bubba's 33",
      'Texas Roadhouse',
      'Panda Express',
      "Rotolo's",
      'Twin Peaks',
      'Torchy',
    ],
  },
  {
    trades: ['dentist', 'dental', 'orthodontist', 'orthodontics', 'dentures', 'oral surgeon'],
    brands: [
      'Aspen Dental',
      'Western Dental',
      'Comfort Dental',
      'Affordable Dentures',
      'Heartland Dental',
      'Ideal Dental',
    ],
  },
  {
    trades: ['chiropractor', 'chiropractic', 'physical therapy', 'massage therapy'],
    brands: [
      'The Joint Chiropractic',
      'HealthSource Chiropractic',
      'Airrosti',
      'ATI Physical Therapy',
      'Massage Envy',
    ],
  },
  {
    trades: ['accountant', 'accounting', 'bookkeeping', 'tax', 'tax preparation', 'cpa', 'payroll'],
    brands: ['H&R Block', 'Jackson Hewitt', 'Liberty Tax'],
  },
  {
    trades: ['law firm', 'lawyer', 'attorney', 'legal', 'law office'],
    brands: ['Morgan and Morgan'],
  },
  {
    trades: ['storage', 'self storage', 'moving', 'movers', 'truck rental', 'warehouse'],
    brands: [
      'Public Storage',
      'Extra Space Storage',
      'CubeSmart',
      'Life Storage',
      'U-Haul',
      'StorQuest',
      'Storage King',
      'Devon Self Storage',
      'Right Move Storage',
      'Anytime Storage',
      'Baytown Secure Spots',
      'Simply Self Storage',
      'iStorage',
      'Lineage',
      'SROA',
      'Storage Rentals of America',
    ],
  },
  {
    trades: ['shipping', 'printing', 'print shop', 'copy shop', 'courier', 'mailbox'],
    brands: ['The UPS Store', 'FedEx Office'],
  },
  {
    trades: ['gym', 'fitness', 'health club', 'personal training'],
    brands: ['Anytime Fitness', 'Planet Fitness'],
  },
]

/**
 * The organisations that cannot buy a website from a studio this size at all,
 * matched against the business name, the trade a search filed the row under,
 * and the top-level domain of the website.
 *
 * A hospital or a medical group buys through procurement against a vendor list
 * and a compliance review. A school district or a university buys through a
 * public bid, and a government office buys through the same process with a
 * budget cycle in front of it, which is a sale measured in months and won by
 * whoever employs somebody to answer bids. A web or marketing agency already
 * sells what the message offers, so the message reaches a competitor.
 *
 * Each rule carries its own reason so a skipped row says which one stopped it.
 * The suffixes are the strongest single signal on a listing, since .gov and
 * .edu are issued against exactly the two classes they name.
 */
export const UNSELLABLE = [
  {
    reason: 'cannot buy: hospital or medical group',
    terms: [
      'hospital',
      'medical center',
      'medical centre',
      'medical group',
      'medical associates',
      'health system',
      'healthcare system',
      'health network',
      'physicians group',
      'physician group',
      'surgery center',
      'surgical center',
      'cancer center',
      'dialysis',
      'emergency room',
      'freestanding er',
      'memorial hermann',
      'houston methodist',
      'texas children',
      'md anderson',
      'kelsey seybold',
      'harris health',
      'ut health',
      'hca houston',
      'baylor scott and white',
    ],
    suffixes: [],
  },
  {
    // 'college' on its own is left out and the .edu suffix does its work
    // instead. It reads a street address as a campus, and College Street runs
    // through half the towns on the list.
    reason: 'cannot buy: school or university',
    terms: [
      'school district',
      'independent school district',
      'isd',
      'cisd',
      'elementary school',
      'middle school',
      'high school',
      'junior high',
      'charter school',
      'university',
      'community college',
      'junior college',
      'college of',
      'college district',
      'campus police',
      'board of education',
      'head start',
    ],
    suffixes: ['.edu', '.k12.tx.us'],
  },
  {
    reason: 'cannot buy: government office',
    terms: [
      'city of',
      'town of',
      'county of',
      'municipal',
      'city hall',
      'county clerk',
      'district clerk',
      'district court',
      'justice of the peace',
      'police department',
      'fire department',
      'sheriff',
      'public works',
      'public library',
      'housing authority',
      'water authority',
      'navigation district',
      'drainage district',
      'appraisal district',
      'department of',
      'post office',
      'state of texas',
      'texas department',
    ],
    suffixes: ['.gov', '.mil'],
  },
  {
    reason: 'competitor: web or marketing agency',
    terms: [
      'web design',
      'website design',
      'web development',
      'website development',
      'web designer',
      'web developer',
      'web agency',
      'web solutions',
      'website solutions',
      'digital agency',
      'digital marketing',
      'internet marketing',
      'online marketing',
      'marketing agency',
      'marketing firm',
      'advertising agency',
      'ad agency',
      'creative agency',
      'branding agency',
      'design studio',
      'graphic design',
      'seo',
      'search engine optimization',
    ],
    suffixes: [],
  },
]

/** A value as spaced lowercase words, bounded so a term matches whole ones. */
function words(value) {
  return ` ${String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

/**
 * A value with every separator taken out: the shape a host writes a brand in,
 * and what two spellings of one name or one town have in common.
 */
export function squash(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * The national brand a business belongs to, out of its name, its trade and its
 * host.
 *
 * A name is read as whole words against the brands of the groups its trade
 * reaches, so a brand cannot match inside a longer word and cannot match
 * across a trade it does not operate in. A row filed under no trade reaches no
 * group, which leaves the host and the domain count to answer for it.
 *
 * A host carries no separators to read, and a brand looked for anywhere inside
 * one lands in the middle of ordinary words: 'orkin' sits inside
 * workingmanplumbing.com and 'wingstop' inside sewingstopbaytown.com. A
 * franchise puts its brand at the front of a label instead, as rotorooter.com
 * and greatclipsofbaytown.com both do, so a host matches on a label opening
 * with the brand.
 */
function chainBrandOf(name, trade, host) {
  const text = words(name)
  const filed = words(trade)
  const labels = host ? String(host).split('.').map(squash) : []

  for (const group of CHAIN_BRANDS) {
    const agrees = group.trades.some(term => filed.includes(words(term)))
    for (const brand of group.brands) {
      if (agrees && text.includes(words(brand))) return brand
      const compact = squash(brand)
      if (compact.length < BRAND_HOST_MIN) continue
      if (labels.some(label => label.startsWith(compact))) return brand
    }
  }
  return null
}

/** The rule that puts a business out of reach of a sale, or null when none does. */
function unsellableReason(name, trade, host) {
  const text = `${words(name)}${words(trade)}`
  for (const rule of UNSELLABLE) {
    if (rule.terms.some(term => text.includes(words(term)))) return rule.reason
    if (host && rule.suffixes.some(suffix => host.endsWith(suffix))) return rule.reason
  }
  return null
}

/**
 * The hosts that carry a chain, counted across a set of prospect rows.
 *
 * A franchise runs every location off one corporate site, so a host attached
 * to businesses in three or more separate towns is a chain whatever it calls
 * itself. The signal needs no list to maintain and keeps working on the
 * regional operators no list holds, and it only becomes visible once enough
 * towns have been searched, which is why it is counted over stored rows rather
 * than over one batch.
 *
 * Towns are counted distinct rather than by listing. One shop turns up once
 * per trade it was searched under, and a shop counted twice for its own town
 * would read as a second location it does not have.
 *
 * The answer maps each such host to the number of towns it was found in, which
 * is what a skipped row records as its reason.
 */
export function chainDomainsIn(rows) {
  const towns = new Map()
  for (const row of rows) {
    const host = hostOf(row.website)
    if (!host || platformOf(host)) continue
    const town = String(row.town ?? '')
      .trim()
      .toLowerCase()
    if (!town) continue
    if (!towns.has(host)) towns.set(host, new Set())
    towns.get(host).add(town)
  }

  const chains = new Map()
  for (const [host, seen] of towns) {
    if (seen.size >= CHAIN_TOWN_MIN) chains.set(host, seen.size)
  }
  return chains
}

/** What a row skipped by the brand list records. */
export const brandReason = brand => `national chain: ${brand}`

/** What a row skipped by the domain count records. */
export const chainDomainReason = (host, towns) => `chain domain: ${host} across ${towns} towns`

/**
 * Domains outreach never writes to, whatever the listing says.
 *
 * A business that has asked not to hear from the studio, or that a person has
 * decided is not to be written to, is held by domain rather than by address.
 * The suppression table holds one address, and a company with more than one
 * mailbox is back in the queue the moment the enricher reads a second one off
 * its site. A domain covers every mailbox at it and everything underneath it,
 * so 'example.com' holds mail.example.com too.
 *
 * That gap is the whole reason a domain list exists beside the address list.
 * Somebody who answers a cold letter with 'stop contacting' has said it about
 * the company and not about the mailbox they happened to be reading, and
 * holding the one address leaves the enricher free to lift a second off the
 * same site next week and start again. The address goes on the suppression
 * list, which every system reads, and the domain goes in
 * `outreach_held_domains`.
 *
 * The list is not in this file. Who asked the studio to stop writing to them is
 * a fact about those businesses, this repository is public, and a list of
 * companies that objected to being contacted is the last thing that belongs in
 * one. It is read from the database at the start of a run and installed here.
 */
let byRequest = null

/**
 * Install the held domains a run has read.
 *
 * @param {string[]} domains Domains held at somebody's request.
 */
export function installHeldDomains(domains) {
  byRequest = Object.freeze([...new Set((domains || []).map(bareHost).filter(Boolean))])
}

/**
 * Read the held domains from the database and install them.
 *
 * @param {object} db A service-role Supabase client.
 * @returns {Promise<boolean>} Whether the list was installed.
 */
export async function loadHeldDomains(db) {
  const { data, error } = await db.from('outreach_held_domains').select('domain')
  if (error) {
    console.error('outreach: the held-domain list could not be read', error.message)
    return false
  }
  installHeldDomains((data || []).map(row => row?.domain))
  return true
}

/**
 * Whether a run has installed the held list yet.
 *
 * @returns {boolean}
 */
export function heldDomainsLoaded() {
  return byRequest !== null
}

/**
 * The studio's own addresses, and every site it has built.
 *
 * A client trades in the towns the sourcing job searches, under a trade it
 * searches for, with a site worth measuring, so it turns up in the queue like
 * any other business. A cold letter offering to build the site the studio
 * already built is the one message here that costs a relationship rather than
 * a stranger's attention, and it arrives signed by the person they pay.
 *
 * Which domains those are is the host's to say, not this module's: a second
 * studio holds a different list and builds for different clients. So the list
 * is installed rather than written here, the way the held list already is, and
 * the host installs it where it can read its own portfolio. It defaults to
 * empty rather than to unset, because a host that holds no sites of its own is
 * an ordinary state while a host that forgot to say is not something this
 * module can tell apart.
 */
let ownDomains = []

/**
 * Says which domains the host owns or has built, as bare hosts or as full
 * addresses; anything that does not read as a host is left out rather than
 * guessed at.
 *
 * @param {Iterable<string>} domains
 */
export function installOwnDomains(domains) {
  ownDomains = [...(domains ?? [])]
    .map(one => String(one ?? '').trim())
    .map(one => hostOf(one) || bareHost(one))
    .filter(Boolean)
}

/** The domains the host said it owns or built, which is what a check reads back. */
export function ownDomainsHeld() {
  return [...ownDomains]
}

const studioDomains = () => ownDomains

/**
 * Every domain outreach is held off, the studio's own and the ones asked for.
 *
 * Reading this before a run has installed the held list is a bug that would
 * write to somebody who asked the studio to stop, so it throws rather than
 * answering from the studio's half alone. An empty list is a different thing
 * from a list that was never read, and only one of them is safe.
 *
 * @returns {string[]}
 */
function heldDomains() {
  if (byRequest === null) {
    throw new Error(
      'outreach: the held-domain list was never loaded, so no domain can be judged free to write to'
    )
  }
  return [...byRequest, ...studioDomains()]
}

/** What a row held at somebody's request records. */
export const HELD_REASON = 'held off outreach by request'

/** What a row held because the studio owns or built the site records. */
export const STUDIO_REASON = 'a site the studio owns or built'

/** The held domain a host or a mail domain falls under, or null when it is free to write to. */
export function heldDomainOf(host) {
  const value = bareHost(host)
  if (!value) return null
  return heldDomains().find(root => under(value, root)) ?? null
}

/**
 * Why a host or a mail domain is held, or null where it is free to write to.
 *
 * The two lists record different facts, and a client row saying it was held
 * 'by request' would have somebody reading the console looking for a request
 * nobody made.
 */
export function heldReasonOf(host) {
  const root = heldDomainOf(host)
  if (!root) return null
  return studioDomains().includes(root) ? STUDIO_REASON : HELD_REASON
}

/**
 * The words a business too large to buy from a studio this size puts in its
 * own name.
 *
 * A ready-mix supplier, a refinery contractor or a logistics firm has a
 * marketing department and an IT department between its website and anybody
 * who could say yes, and a message offering to build the site reaches a
 * person whose job is to route it to one of them. The name is the cheapest
 * signal there is, since it is the business's own claim about itself.
 *
 * The trade a search filed the row under is deliberately not read. 'industrial
 * contractor' is a search term, and a two-person welding shop turns up under
 * it as readily as a refinery contractor does.
 *
 * A term is read as whole words. 'Enterprises' and 'energy' are left off
 * because a one-truck operation calls itself the first and an electrician the
 * second. The same test takes out the words a shop on the ship channel writes
 * about its own work: a twenty-person fabricator manufactures things, puts
 * Industries on the sign because its grandfather did, and carries Corporation
 * after its name because that is what it filed as with the state. None of the
 * three counts anybody in the building. What is left is the words that put
 * departments between the website and the person who could say yes: a quarry
 * or a refinery because nobody runs one out of a truck, a staffing firm or a
 * distributor because the work is done by a payroll rather than by a crew, and
 * Worldwide on a sign because a business trading under it has an office that
 * is not this one.
 */
export const OVERSIZED_TERMS = [
  'ready mix',
  'ready-mix',
  'readymix',
  'aggregates',
  'quarry',
  'refinery',
  'refineries',
  'petrochemical',
  'petrochemicals',
  'chemical plant',
  'chemical company',
  'chemicals',
  'pipelines',
  'pipeline company',
  'terminal',
  'terminals',
  'offshore',
  'oilfield',
  'oil and gas',
  'oil & gas',
  'power plant',
  'utilities',
  'utility company',
  'industrial services',
  'logistics',
  'distribution',
  'distributors',
  'shipyard',
  'shipyards',
  'staffing',
  'holdings',
  'international',
  'worldwide',
  'credit union',
]

/**
 * The same words as a host writes them, with the spaces taken out.
 *
 * A host carries no word boundaries, so only the terms long and specific
 * enough not to sit inside an ordinary word are read there: 'energy' inside
 * synergyplumbing.com and 'pipeline' inside pipelineplumbing.com are why
 * neither is on this list.
 */
export const OVERSIZED_HOST_TERMS = [
  'readymix',
  'aggregates',
  'refinery',
  'refineries',
  'petrochem',
  'chemicals',
  'terminals',
  'offshore',
  'oilfield',
  'logistics',
  'shipyard',
  'holdings',
  'worldwide',
  'international',
  'utilities',
]

/**
 * Size words that were read off a name or a host and are not any more.
 *
 * The two lists above are what the rules read, and they are also what the
 * sweep reads on the way back, since a stored reason is recognised by being
 * spelled the way a rule spells one. So a word taken out of them takes its own
 * reason with it on the same commit, and every row already sitting at 'skipped'
 * under that reason loses the only path it had back to the queue - which is the
 * exact opposite of what taking the word out was for. This holds those
 * spellings open long enough for one sweep to use them.
 *
 * ROW_RULE_REASONS reads both spellings of every word here, the plain one and
 * the one the host rule writes, because which of the two stopped a row is not
 * worth working out from this end and neither costs anything: a word in
 * neither live list stops nobody either way.
 *
 * It shrinks, the way RETIRED_SIGNS below does. A word is here so the rows it
 * stopped can come back once, and it comes out on any commit after that.
 */
const RETIRED_TERMS = [
  'manufacturing',
  'manufacturer',
  'manufacturers',
  'industries',
  'corporation',
]

/**
 * How a business writes down that it belongs to somebody else.
 *
 * A listing named "Texas Materials (a CRH Company)" is a subsidiary saying so
 * in its own name, and the site it runs on is the parent's. The marketing
 * decision was made somewhere else and nobody at this address can buy a
 * website. The wording is a convention rather than an accident, which is what
 * makes it worth reading: a business that owns itself has no reason to put
 * another company's name in brackets after its own.
 */
const OWNED_BY = [
  /\((?:an?|the)\s+[\w&.,' -]{2,40}\s+(?:company|group|brand|companies)\)/i,
  /\ba\s+(?:division|subsidiary|brand|company)\s+of\b/i,
  /\b(?:part|member)\s+of\s+the\s+[\w&.' -]{2,40}\s+(?:family|group)\s+of\s+companies\b/i,
]

/** What a row skipped for belonging to a parent records. */
export const ownedReason = 'too large: names a parent company'

/** What a row skipped for a size word in its name records. */
const termReason = term => `too large: ${term}`

/** What a row skipped for a size word in its domain records. */
const hostTermReason = term => `too large: ${term} in the domain`

/** The rule that puts a business out of reach by its size, read off its name and host. */
export function oversizedReason(name, host) {
  const written = String(name ?? '')
  if (OWNED_BY.some(pattern => pattern.test(written))) return ownedReason
  const text = words(name)
  const term = OVERSIZED_TERMS.find(term => text.includes(words(term)))
  if (term) return termReason(term)
  const flat = squash(host)
  const hostTerm = OVERSIZED_HOST_TERMS.find(term => flat.includes(term))
  if (hostTerm) return hostTermReason(hostTerm)
  return null
}

/**
 * Hosts that run a large employer's hiring. A site whose careers link hands
 * off to one of these has a human resources system, and a company with a
 * human resources system has an IT department that chose it.
 */
const HIRING_HOSTS = [
  'myworkdayjobs.com',
  'workday.com',
  'taleo.net',
  'successfactors.com',
  'icims.com',
  'ultipro.com',
  'ukg.com',
  'oraclecloud.com',
  'brassring.com',
  'dayforcehcm.com',
  'greenhouse.io',
  'lever.co',
  'smartrecruiters.com',
  'jobvite.com',
  'phenom.com',
  'eightfold.ai',
]

/**
 * Text a site of that size carries and a shop's site never does. One is
 * enough on its own. The last five are content systems sold to enterprises,
 * read off the markup they leave behind.
 */
const CORPORATE_MARKS = [
  'investor relations',
  'board of directors',
  'annual report',
  'sustainability report',
  'press releases',
  'newsroom',
  'corporate headquarters',
  'code of conduct',
  'supplier diversity',
  'supplier portal',
  'vendor portal',
  'intranet',
  'safety data sheet',
  'nyse:',
  'nasdaq:',
  'sitecore',
  '/content/dam/',
  'liferay',
  'kentico',
  'episerver',
]

/**
 * Text that leans the same way without settling it. A shop with an employee
 * login is a shop that bought a timeclock; a shop with an employee login, a
 * leadership team and a list of locations is not a shop.
 *
 * A careers page and a headquarters were read here and are not any more,
 * because neither says anything about size. A fabricator is hiring welders
 * every month of the year, and the one building it works out of is the one it
 * calls its headquarters. The version of each that does mean a large employer
 * is already read somewhere better: 'corporate headquarters' is a mark of its
 * own, and a careers page at that size hands off to a hiring system, which the
 * link hosts catch whatever the link says.
 *
 * The last three are what this had to find when 'manufacturing', 'industries'
 * and 'corporation' came out of the name list. A plant with three hundred
 * people on the payroll writes an equal opportunity line because somebody in
 * legal told it to, says what the benefits come to because that is how it
 * competes for welders, and lists its facilities because it has more than one.
 * A twenty-person shop does none of the three. None of them settles anything
 * alone either, which is the point: the read has to reach the band the name no
 * longer covers without stopping a fabricator for buying a timeclock.
 */
const CORPORATE_HINTS = [
  'leadership team',
  'our locations',
  'sustainability',
  'subsidiar',
  'employee portal',
  'equal opportunity employer',
  'employee benefits',
  'our facilities',
]

/**
 * The other spellings of a sign, where two wordings on a page are one thing
 * bought once rather than two pieces of evidence.
 *
 * A timeclock labels its own button Employee Login and the heading above it
 * Employee Portal, so reading each as its own hint counts one purchase twice
 * and reaches the number it takes without anything else on the page. Whatever
 * the page calls it, it is named here under the one spelling the reason will
 * carry, so a row skipped for it can still be read back.
 */
const HINT_SPELLINGS = { 'employee portal': ['employee portal', 'employee login'] }

/** Hints found together before they count. */
const HINTS_TOGETHER = 2

/**
 * Words that were signs and are not any more.
 *
 * A row skipped for what its site carried keeps its evidence on the page
 * rather than on the row, so the sweep cannot put that question again the way
 * it puts the size list again. What it can do is read the sentence back, and a
 * reason naming only words the lists have stopped acting on is a reason no
 * page would be stopped for today.
 *
 * This list shrinks. A word is here so the rows it stopped can come back once,
 * and it comes out on any commit after that. Leaving one in longer costs a
 * string comparison and lets nothing through, since a word in neither list
 * stops nobody either way.
 */
const RETIRED_SIGNS = ['careers', 'headquarters']

const HREF = /href\s*=\s*["']([^"']+)["']/gi

/**
 * Every sign on a page that the business behind it is too large to buy, read
 * off its HTML.
 *
 * Links are read by host, so a careers page that hands off to a hiring system
 * is caught whatever the link says. Everything else is read as text, in the
 * markup as served, since a mark that only appears inside a script's payload
 * still says what the site was built with. A page that carries none of it
 * answers with an empty list.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function corporateSignsIn(html) {
  const text = String(html ?? '').toLowerCase()
  const signs = []

  const hosts = new Set()
  for (const match of text.matchAll(HREF)) {
    const href = match[1]
    if (!/^(?:https?:)?\/\//.test(href)) continue
    const host = hostOf(href.startsWith('//') ? `https:${href}` : href)
    if (host) hosts.add(host)
  }
  const hiring = HIRING_HOSTS.find(root => [...hosts].some(host => under(host, root)))
  if (hiring) signs.push(`hiring through ${hiring}`)

  for (const mark of CORPORATE_MARKS) if (text.includes(mark)) signs.push(mark)

  if (!signs.length) {
    const hints = CORPORATE_HINTS.filter(hint =>
      (HINT_SPELLINGS[hint] ?? [hint]).some(spelling => text.includes(spelling))
    )
    if (hints.length >= HINTS_TOGETHER) signs.push(...hints)
  }
  return signs
}

/** The words a reason built from the signs on a site opens with. */
const CORPORATE_REASON_OPENS = 'too large: site carries '

/**
 * Signs a reason names before it stops naming them.
 *
 * A page can carry more than this and the enricher reads several pages, so a
 * reason that runs to this many may have left one unsaid. Lowering it hides
 * evidence from the person deciding whether the skip was right; raising it
 * puts a paragraph in a column read a screenful at a time.
 */
const REASON_SIGNS_SHOWN = 3

/** What a row skipped for the signs on its site records. */
export const corporateReason = signs =>
  `${CORPORATE_REASON_OPENS}${signs.slice(0, REASON_SIGNS_SHOWN).join(', ')}`

/**
 * The trading status that ends a business, as the map reports one.
 *
 * Only the permanent one is read. A business Google has closed for good is not
 * going to buy a website, and it is the single cheapest rule in this file: the
 * status arrives on the search that found the row, so it is known before the
 * site has been fetched, an address looked for, or a score taken. A temporary
 * closure is a shop between premises or a kitchen being refitted, which is a
 * business that reopens, so it is left in.
 */
const CLOSED_FOR_GOOD = 'CLOSED_PERMANENTLY'

/** What a row skipped for having shut records. */
export const closedReason = () => 'closed: the listing says permanently closed'

/**
 * The first rule that stops a row, read off the row alone, or null when none
 * does.
 *
 * The enricher asks this of every row it takes and the sweep asks it of every
 * row already on file, so a rule added here reaches a business the pipeline
 * met last month as readily as one it meets tomorrow. The held list is read
 * first because it is the one a person wrote by hand, and it is read against
 * both the site and the address, since a listing can name one and a page the
 * other. The closure is read next, ahead of every rule that has to reason about
 * a name or a host, because a shut business is shut whatever it was called.
 */
export function rowRuleOf({ name, trade, website, email, business_status: status }) {
  const host = hostOf(website)
  const address = String(email ?? '')
  const domain = address.includes('@') ? address.slice(address.lastIndexOf('@') + 1) : ''
  const held = heldReasonOf(host) ?? heldReasonOf(domain)
  if (held) return held

  if (status === CLOSED_FOR_GOOD) return closedReason()

  const unsellable = unsellableReason(name, trade, host)
  if (unsellable) return unsellable

  const brand = chainBrandOf(name, trade, host)
  if (brand) return brandReason(brand)

  return oversizedReason(name, host)
}

/**
 * Every reason a row rule writes, spelled exactly as it lands in the column.
 *
 * The rules above answer whether a business is one to write to. This answers
 * the question the sweep asks on the way back: was this row put here by a rule
 * that can be asked again. Only the reasons a rule composes belong in it, and
 * they are built from the same lists the rules read so a term added to one is
 * a reason recognised here on the same commit.
 *
 * A term taken out of one is the case that has to be said out loud, because
 * the same wiring drops its reason on the same commit. The rows already stored
 * under it are the whole point of taking the term out, and they are exactly
 * the rows that would stop being recognised the instant the term went - so
 * RETIRED_TERMS is read here beside the live lists, and a word on its way out
 * leaves its sentence readable for one sweep.
 *
 * The closure is the one rule here that stops applying without anybody editing
 * a list. A shop reopens, Google clears the status, the sourcing job writes the
 * new one onto the row, and the next sweep finds a business it has a reason to
 * write to again.
 *
 * `corporateReason` is deliberately absent, and it is the reason this is a set
 * of exact strings rather than a read of the 'too large: ' prefix. Its evidence
 * is the markup of the site rather than anything on the row, so `rowRuleOf`
 * answering null about such a business says only that the row does not carry
 * the evidence. Taking one back on that would revive it, fetch its site, find
 * the same signs, skip it again, and do the whole of that again on the next
 * run, forever. It is read further down instead, off the sentence itself, and
 * only where the words it names could not stop a page today - because they
 * have left the lists, or because what is left of them falls short of the
 * number it takes together. Either way that loop cannot start, because the
 * fetch that follows either finds nothing or finds something else and writes a
 * reason the read refuses.
 */
const ROW_RULE_REASONS = new Set([
  HELD_REASON,
  STUDIO_REASON,
  ownedReason,
  closedReason(),
  ...UNSELLABLE.map(rule => rule.reason),
  ...OVERSIZED_TERMS.map(termReason),
  ...OVERSIZED_HOST_TERMS.map(hostTermReason),
  ...RETIRED_TERMS.map(termReason),
  ...RETIRED_TERMS.map(hostTermReason),
  ...CHAIN_BRANDS.flatMap(group => group.brands.map(brandReason)),
])

/**
 * The one reason that cannot be enumerated, as the whole shape of it.
 *
 * `chainDomainReason` names a host and a count, and neither is drawn from a
 * list. Reading it back as a prefix would be enough for the sweep and too much
 * for anything else: a person typing 'chain domain, three of them' into the
 * console's Skip would have written a sentence the code then took as its own.
 * Matching the whole format costs nothing and leaves the free-text field free
 * text.
 */
const CHAIN_DOMAIN_REASON = /^chain domain: \S+ across \d+ towns$/

/**
 * Whether a reason read off a site names nothing the lists still act on.
 *
 * Three guards, and each of them is holding something shut. Every sign named
 * has to be a hint or a word that has since stopped being one, and the hints
 * among them have to fall short of the number it takes, or the same page would
 * be stopped again today and reviving it would only cost a fetch. A reason
 * naming a mark or a hiring system is never taken back, because one of those
 * settles it on its own and no edit to the hints changes that. And a reason
 * naming as many signs as one prints is refused whatever they say, since the
 * enricher pools what several pages carry and a sentence that ran to the cap
 * may be hiding the fourth sign that decided it.
 */
function corporateReasonSpent(reason) {
  if (!reason.startsWith(CORPORATE_REASON_OPENS)) return false
  const signs = reason.slice(CORPORATE_REASON_OPENS.length).split(', ')
  if (signs.length >= REASON_SIGNS_SHOWN) return false
  const known = sign => CORPORATE_HINTS.includes(sign) || RETIRED_SIGNS.includes(sign)
  if (!signs.every(known)) return false
  return signs.filter(sign => CORPORATE_HINTS.includes(sign)).length < HINTS_TOGETHER
}

/**
 * Whether a skip reason is one a row rule wrote.
 *
 * The console's own Skip writes whatever the person typed, and a business a
 * person took out of the pipeline stays out however the rules read it later.
 * That is the whole of what this separates: a reason the code composed can be
 * asked again, and a sentence somebody wrote cannot be.
 *
 * A reason from a rule that has since been reworded falls out of the set and
 * the row stays skipped, which is the safe direction for a test that decides
 * whether to start writing to somebody again.
 *
 * The third path is the one reason built from a site's own markup, and it is
 * read on its words rather than looked up, because the words it names are the
 * only evidence the row kept. It answers yes only where those words could not
 * stop a page today, whether because they have left the lists or because too
 * few of them are left to count together - which is the same question the set
 * answers for the rules that read a row.
 */
export function rowRuleWrote(reason) {
  const value = String(reason ?? '')
  if (!value) return false
  if (ROW_RULE_REASONS.has(value) || CHAIN_DOMAIN_REASON.test(value)) return true
  return corporateReasonSpent(value)
}
