/**
 * Whether a visit to a preview came from a person or from the machine that
 * checked the link before a person ever saw it.
 *
 * Mail providers and security gateways open every link in a letter as it
 * arrives: Gmail, Outlook's Safe Links, Proofpoint, Mimecast, Barracuda and the
 * rest. They run a real browser, say they are Chrome on Windows, and sit on the
 * page long enough to pass any timer the page can set, so nothing the page sees
 * tells them apart from a reader. What does is where they run from. A reader is
 * on a home, office or phone network; a scanner is on its owner's own network
 * or a cloud's, and the network says whose it is.
 *
 * The address is looked up through Team Cymru's IP-to-ASN service over DNS, as
 * JSON from a public DNS-over-HTTPS resolver, so it needs no key and no
 * dependency. A lookup that fails says nothing either way: the visit is judged
 * on its agent and its timing alone.
 */

import { timedFetch } from './timed.js'

/**
 * Networks a scanner runs from, by AS number. The owner's name below catches
 * the numbers this list does not know.
 */
export const SCANNER_ASNS = new Map([
  [8075, 'Microsoft'],
  [8068, 'Microsoft'],
  [8069, 'Microsoft'],
  [3598, 'Microsoft'],
  [15169, 'Google'],
  [36040, 'Google (YouTube)'],
  [43515, 'Google (YouTube)'],
  [396982, 'Google Cloud'],
  [19527, 'Google'],
  [36492, 'Google'],
  [16509, 'Amazon'],
  [14618, 'Amazon'],
  [22843, 'Proofpoint'],
  [26211, 'Proofpoint'],
  [30031, 'Mimecast'],
  [42427, 'Mimecast'],
  [15324, 'Barracuda'],
  [16417, 'Cisco IronPort'],
  [44444, 'Forcepoint'],
  [16880, 'Trend Micro'],
  [53813, 'Zscaler'],
  [62044, 'Zscaler'],
  [31898, 'Oracle Cloud'],
  [14061, 'DigitalOcean'],
  [16276, 'OVH'],
  [24940, 'Hetzner'],
  [63949, 'Linode'],
  [20473, 'Vultr'],
])

// Mail security vendors and the clouds and hosts scanners run in. Google Fiber
// is a home ISP under Google's name, so it is let through first.
const SCANNER_OWNERS =
  /microsoft|google|youtube|amazon|proofpoint|mimecast|barracuda|ironport|forcepoint|trend ?micro|sophos|zscaler|symantec|messagelabs|broadcom|fortinet|palo ?alto|check ?point|cyren|vade|hornet|appriver|zix|trustwave|titanhq|spamtitan|libraesva|abnormal|knowbe4|digitalocean|ovh|hetzner|linode|vultr|choopa|oracle|alibaba|tencent|leaseweb|contabo/i
const HOME_UNDER_SCANNER_NAME = /google[- ]fiber/i

// Agents that say what they are. Kept beside the page's own list so a
// browser that hides `navigator.userAgent` from the page is still caught here.
const AUTOMATED_AGENTS =
  /bot|crawl|spider|slurp|preview|scan|headless|lighthouse|pagespeed|python|curl|wget|node|axios|go-http|java\/|phantom|selenium|puppeteer|playwright/i

const RESOLVERS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']

/** How long a lookup gets before the visit is judged without it. */
const LOOKUP_MS = 1500

/** The name Cymru answers an address's origin under, or null if it is not one. */
export function originName(address) {
  const value = String(address ?? '').trim()
  const v4 = value.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i)
  if (v4) {
    const parts = v4.slice(1).map(Number)
    if (parts.some(part => part > 255)) return null
    return `${parts.reverse().join('.')}.origin.asn.cymru.com`
  }
  if (!value.includes(':') || !/^[0-9a-f:]+$/i.test(value)) return null
  const halves = value.toLowerCase().split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const gap = 8 - head.length - tail.length
  if (gap < 0 || (halves.length === 1 && gap !== 0)) return null
  const groups = [...head, ...Array(gap).fill('0'), ...tail]
  if (groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null
  const nibbles = groups.map(group => group.padStart(4, '0')).join('')
  return `${[...nibbles].reverse().join('.')}.origin6.asn.cymru.com`
}

async function txt(name, fetcher) {
  for (const resolver of RESOLVERS) {
    try {
      const response = await fetcher(
        `${resolver}?name=${encodeURIComponent(name)}&type=TXT`,
        { headers: { accept: 'application/dns-json' } },
        LOOKUP_MS
      )
      if (!response.ok) continue
      const answer = (await response.json())?.Answer?.find(record => record.type === 16)
      if (answer) return String(answer.data).replace(/^"|"$/g, '')
      return null
    } catch {
      // The next resolver, or no answer.
    }
  }
  return null
}

/**
 * Who owns the network an address is on.
 *
 * @param {string} address
 * @param {typeof timedFetch} [fetcher]
 * @returns {Promise<{asn: number, owner: string|null}|null>}
 */
export async function networkOf(address, fetcher = timedFetch) {
  const name = originName(address)
  if (!name) return null
  const origin = await txt(name, fetcher)
  // "36040 | 136.22.138.0/24 | US | arin | 2017-08-29"; more than one origin
  // is space separated before the first bar, and the first will do.
  const asn = Number(origin?.split('|')[0].trim().split(/\s+/)[0])
  if (!Number.isInteger(asn) || asn <= 0) return null
  // "36040 | US | arin | 2005-08-03 | YOUTUBE - Google LLC, US"
  const described = await txt(`AS${asn}.asn.cymru.com`, fetcher)
  const owner = described?.split('|')[4]?.trim() || null
  return { asn, owner }
}

/**
 * Whose scanner a network is, or null when it is one a person could be on.
 *
 * @param {{asn: number, owner: string|null}|null} network
 * @returns {string|null}
 */
export function scannerOf(network) {
  if (!network) return null
  if (network.owner && HOME_UNDER_SCANNER_NAME.test(network.owner)) return null
  if (SCANNER_ASNS.has(network.asn)) return SCANNER_ASNS.get(network.asn)
  if (network.owner && SCANNER_OWNERS.test(network.owner)) return network.owner
  return null
}

/** Whether an agent says outright that it is not a person's browser. */
export function automatedAgent(agent) {
  return !agent || AUTOMATED_AGENTS.test(agent)
}

/**
 * Everything the visit's connection says about who is on the other end, for
 * the database to record beside the view and to decide by.
 *
 * @param {string} address
 * @param {string} agent
 * @param {typeof timedFetch} [fetcher]
 */
export async function judgeVisit(address, agent, fetcher = timedFetch) {
  const network = await networkOf(address, fetcher)
  const scanner = scannerOf(network)
  return {
    asn: network?.asn ?? null,
    owner: network?.owner ?? null,
    scanner,
    automated: automatedAgent(agent),
  }
}
