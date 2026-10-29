/**
 * What an inbound reply asks for, out of the words its sender actually typed.
 *
 * The outbound message tells the recipient to reply and say so, which makes
 * the reply the opt-out channel and its text the only record of the request.
 * CAN-SPAM allows ten business days to honour one and no allowance at all for
 * one that arrived, was filed and was never acted on, so the reading happens
 * here and the suppression that follows it happens without a person in the
 * middle.
 *
 * Only new text is tested. A mail client answers by quoting the message it is
 * answering, and the quoted copy carries the outbound footer offering the
 * opt-out, so a warm reply that quotes the message whole reads as a request to
 * stop unless the quoted part is cut first. Two cuts take it: lines a client
 * marked with '>', and everything from the attribution line a client writes
 * above the copy it quotes.
 *
 * A reply written underneath the quoted copy leaves nothing above that
 * attribution. Cutting there answers with an empty string and therefore no
 * opt-out at all, so the whole body with its marked lines removed is tested
 * instead. Reading one quoted opt-out as a real one costs a single prospect;
 * missing a real one is a violation, and the two are not the same size.
 */

/** Characters of a reply read, which is far past where an opt-out is written. */
const TEXT_LIMIT = 20_000

/** Lines an attribution is allowed to wrap across before it stops being one. */
const ATTRIBUTION_LINES = 3

/** A line a mail client marked as quoted. */
const QUOTED_LINE = /^\s*>/

/** The separator a client writes in place of an attribution. */
const ORIGINAL_MESSAGE = /^\s*(?:-{2,}\s*original message\s*-{2,}|_{10,})\s*$/i

/** The opening of the line a client writes above the copy it is quoting. */
const ATTRIBUTION_START = /^\s*on\b/i

/** The close of that same line, which can sit two lines further down. */
const ATTRIBUTION_END = /\bwrote:/i

/**
 * The phrases that ask for no further contact.
 *
 * Each is a phrase somebody types on purpose rather than a word that turns up
 * by accident. 'remove' on its own belongs to a question about removing a
 * page as readily as to an opt-out, so the pattern carrying it demands the
 * word after it. The patterns read a lowercased copy with curly punctuation
 * flattened, which makes 'don't', 'dont' and 'do not' one shape, and none of
 * them crosses a line break, which keeps a phrase from being assembled out of
 * two separate sentences.
 */
const OPT_OUT_PATTERNS = [
  /\bun-?subscribe\b/,
  /\bopt[- ]?out\b/,
  /\b(?:please\s+)?(?:remove|delete)\s+(?:me|us|my|our|this)\b/,
  /\btake\s+(?:me|us|my|our)\b[^\n]*\b(?:off|out)\b/,
  /\b(?:off|out\s+of)\s+(?:your|the|this)\s+(?:mailing\s+|email\s+|e-mail\s+|contact\s+)?(?:list|database)\b/,
  /\bstop\s+(?:emailing|e-mailing|emails?|e-mails?|contacting|sending|messaging|reaching|soliciting)\b/,
  /\b(?:do\s*n(?:o|')?t|never|quit|cease)\s+(?:contact|contacting|email|emailing|e-mail|message|messaging|write|writing|reach|solicit|soliciting)\b/,
  /\bno\s+(?:more|further)\s+(?:emails?|e-mails?|messages?|contact|solicitation)\b/,
  /\bnot\s+interested\b/,
  /\bno\s+thank(?:s|\s+you)\b/,
  /\bleave\s+(?:me|us)\s+alone\b/,
  /\blose\s+(?:my|this)\s+(?:address|email|e-mail|number)\b/,
  /\bstop\s+it\b/,
]

/**
 * Replies that are one word long.
 *
 * A reply carrying nothing but a command is the plainest opt-out there is, and
 * a phrase pattern cannot read it: 'stop' on its own has nothing after it to
 * anchor against, and reading 'stop' anywhere in a sentence would take 'stop
 * by the shop next week' with it.
 */
const BARE_OPT_OUTS = new Set(['stop', 'unsubscribe', 'remove', 'delete', 'opt out'])

/** Text with its case, curly punctuation and invisible characters flattened. */
function normalise(value) {
  return String(value ?? '')
    .slice(0, TEXT_LIMIT)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .toLowerCase()
}

/** Where the quoted copy begins, or -1 when the reply quotes nothing. */
function quoteStart(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    if (ORIGINAL_MESSAGE.test(lines[index])) return index
    if (!ATTRIBUTION_START.test(lines[index])) continue
    if (ATTRIBUTION_END.test(lines.slice(index, index + ATTRIBUTION_LINES).join(' '))) return index
  }
  return -1
}

/** Every line a client did not mark as quoted. */
const unquoted = lines =>
  lines
    .filter(line => !QUOTED_LINE.test(line))
    .join('\n')
    .trim()

/**
 * The part of a reply its sender typed.
 *
 * The text above the attribution is the answer wherever there is any. Where
 * there is none the sender wrote underneath the quoted copy, and the body
 * minus its marked lines is all there is to read.
 */
export function newText(body) {
  const lines = String(body ?? '')
    .slice(0, TEXT_LIMIT)
    .split(/\r?\n/)
  const cut = quoteStart(lines)
  const above = unquoted(cut === -1 ? lines : lines.slice(0, cut))
  return above || unquoted(lines)
}

/**
 * What an auto-responder says on its own way out, in the body, where the
 * headers said nothing. A mailbox that answers "Thank you for choosing us"
 * the moment anything arrives is a machine, and counting it as a reply is
 * counting a letter as answered that nobody has read.
 */
const AUTO_REPLY_PATTERNS = [
  /\bthank(?:s| you) for (?:choosing|contacting|reaching out|getting in touch|your (?:e-?mail|message|inquiry|enquiry|interest))\b/,
  /\b(?:we|i)(?:'ve| have)? received your (?:e-?mail|message|inquiry|enquiry|request)\b/,
  /\bout of (?:the )?office\b/,
  /\bauto(?:matic|mated)?[- ]?(?:reply|response|responder)\b/,
  /\baway from (?:my|the) (?:desk|office)\b/,
  /\bwill (?:get back|respond|reply|return your \w+) (?:to you )?(?:as soon as|shortly|soon|within|when|during)\b/,
  /\bthis (?:is an? |mailbox is )?(?:automated|automatic|unmonitored)\b/,
  /\bdo not reply to this (?:e-?mail|message)\b/,
]

/**
 * The furniture a ticket desk stamps on everything that leaves it.
 *
 * A desk answers under the subject it was written to with "Re:" in front of
 * it, exactly the way a person's mail client does, so the subject line stops
 * telling the two apart the moment one of these turns up. None of them is a
 * sentence anybody types.
 */
const TICKET_DESK_MARKS = [
  /-*#{2,}-*\s*please type your reply above this line/,
  /\bplease (?:type|write|enter) your reply above this line\b/,
  /\bthis (?:e-?mail|message) is a service from\b/,
  /\breply (?:to this|above this line)[^\n]{0,60}\badd (?:additional )?comments? to (?:your|the|this) (?:ticket|case|request)\b/,
  /\bdo not (?:modify|change|remove|edit) (?:the )?subject line\b/,
  /\bpowered by (?:zendesk|freshdesk|help ?scout|zoho desk|os ?ticket)\b/,
]

/**
 * What a desk says when it is only acknowledging that something arrived.
 *
 * The furniture rides on an agent's own answer too, so it cannot be the whole
 * test. What separates the automatic receipt from a person writing through the
 * same desk is that the receipt has nothing in it but its own arrival: a
 * ticket number, a promise that somebody will read it, and the summary of what
 * was just sent in. These are read beside the auto-responder phrases, and only
 * once a desk mark has already said the subject line means nothing.
 */
const TICKET_ACKNOWLEDGEMENTS = [
  /\bhere'?s a summary of your (?:request|ticket|case)\b/,
  /\byour (?:request|ticket|case) (?:number |id |no\.? )?#?\d{3,}\b/,
  /\b(?:a |your |support )?(?:ticket|case|request) (?:has been|was) (?:created|opened|logged|received|registered)\b/,
  /\b(?:someone|somebody|a (?:member|representative|agent))\b[^\n]{0,60}\bwill be in touch\b/,
  /\bwe(?:'ll| will) (?:get back to you|be in touch|respond|review)\b/,
]

/** A subject a mail client puts on an answer a person wrote. */
const ANSWERED = /^\s*(?:re|aw|sv|antw)\s*:/i

/** A subject an auto-responder puts on its own. */
const AUTOMATIC_SUBJECT =
  /^\s*(?:automatic reply|auto(?:matic)?[- ]?(?:reply|response)|out of (?:the )?office|autoreply)\b/i

/**
 * Whether a message reads as sent by a machine on arrival rather than by a
 * person after reading.
 *
 * A person's answer arrives under "Re:", so a message that arrives under the
 * outbound subject unchanged and opens the way an auto-responder does is one.
 * A subject that names itself an automatic reply is one whatever the body
 * says. An opt-out is read before this, so a person who typed "stop" under
 * a machine's subject line is still heard.
 *
 * "Re:" holds the body reading off because a person's own answer opens with
 * the same courtesy an auto-responder does, and "thanks for reaching out, send
 * the list over" is somebody agreeing. A ticket desk breaks that: it puts
 * "Re:" on its receipt like anything else, so a letter written to a listing or
 * a franchise support address comes back reading as the answer it is not, ends
 * the chain and takes the business off the list. Where a desk has stamped
 * itself on the message the subject is worth nothing, so the body is read
 * through it.
 *
 * @param {string|null|undefined} subject
 * @param {string|null|undefined} body
 * @returns {{auto: boolean, phrase: string|null}}
 */
export function readAutoReply(subject, body) {
  const line = String(subject ?? '')
  if (AUTOMATIC_SUBJECT.test(line)) {
    return { auto: true, phrase: line.trim().slice(0, 60) }
  }
  const text = normalise(newText(body))
  const desk = TICKET_DESK_MARKS.some(mark => mark.test(text))
  if (!desk && ANSWERED.test(line)) return { auto: false, phrase: null }
  const patterns = desk ? [...TICKET_ACKNOWLEDGEMENTS, ...AUTO_REPLY_PATTERNS] : AUTO_REPLY_PATTERNS
  for (const pattern of patterns) {
    const found = pattern.exec(text)
    if (found) return { auto: true, phrase: found[0].replace(/\s+/g, ' ').trim() }
  }
  return { auto: false, phrase: null }
}

/**
 * Whether a reply asks for no further contact, and the phrase that says so.
 *
 * The phrase travels with the answer because it is the whole record of why an
 * address was suppressed, and a suppression nothing accounts for is one
 * nothing can undo.
 */
export function readOptOut(body) {
  const text = normalise(newText(body))
  if (!text) return { optOut: false, phrase: null }

  const bare = text
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (BARE_OPT_OUTS.has(bare)) return { optOut: true, phrase: bare }

  for (const pattern of OPT_OUT_PATTERNS) {
    const found = pattern.exec(text)
    if (found) return { optOut: true, phrase: found[0].replace(/\s+/g, ' ').trim() }
  }

  return { optOut: false, phrase: null }
}
