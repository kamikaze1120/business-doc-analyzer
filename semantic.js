/* ============================================================
   SEMANTIC LAYER — decomposes a requirement sentence into its
   grammatical parts so downstream test generation can compose
   steps from real content instead of echoing requirement IDs.
   Pure rule-based NLP. No model, no network.
   ============================================================ */

/* ---- Domain verb taxonomy: verb -> how it is exercised & verified ---- */
const VERB_TAXONOMY = {
  create:   {syn:['create','created','add','register','registered','establish','initiate','open','raise','draft','enter','submit','submitted','record','log a','file'],       ui:'creation form',        verify:'record exists with the supplied values', neg:'required fields blank or invalid'},
  read:     {syn:['view','display','show','present','list','retrieve','render','surface','see','access'],                                   ui:'detail or list screen', verify:'the expected values are displayed', neg:'no permission to view'},
  update:   {syn:['update','edit','modify','change','amend','revise','adjust','maintain','set'],                                            ui:'edit form',             verify:'changes persist after reload', neg:'invalid or stale values'},
  delete:   {syn:['delete','remove','purge','archive','deactivate','cancel','void','withdraw'],                                             ui:'record actions menu',   verify:'record no longer appears in active results', neg:'record is locked or in use'},
  approve:  {syn:['approve','authorize','endorse','sign off','accept','ratify','concur'],                                                   ui:'approval queue',        verify:'status advances and approver is stamped', neg:'approver lacks authority'},
  reject:   {syn:['reject','deny','decline','return','send back','refuse'],                                                                 ui:'approval queue',        verify:'status set to rejected with reason captured', neg:'rejection reason omitted'},
  route:    {syn:['route','routed','assign','assigned','forward','forwarded','escalate','escalated','delegate','dispatch','direct','transfer','transferred'],                                         ui:'workflow engine',       verify:'item appears in the correct downstream queue', neg:'no eligible recipient exists'},
  validate: {syn:['validate','verify','check','enforce','ensure','confirm','require','restrict','prevent','block','limit','validated','verified','enforced'], ui:'input form', verify:'valid input passes and invalid input is blocked', neg:'boundary-violating input'},
  support:  {syn:['support','handle','accommodate','sustain','scale to','serve','process'],                                                  ui:'system under load',     verify:'the stated volume is handled without degradation', neg:'load beyond the stated ceiling'},
  calculate:{syn:['calculate','calculated','compute','computed','derive','derived','sum','aggregate','prorate','apply'],                                              ui:'calculation output',    verify:'computed value matches manual calculation', neg:'missing or zero inputs'},
  notify:   {syn:['notify','notified','alert','alerted','email','send','sent','inform','informed','remind','message','publish a notification'],                                    ui:'notification service',  verify:'notification is delivered to the intended recipient', neg:'recipient address missing'},
  integrate:{syn:['integrate','sync','synchronize','post','transmit','interface','push','pull','exchange','feed'],                          ui:'integration endpoint',  verify:'payload lands in the target system with matching keys', neg:'target endpoint unavailable'},
  generate: {syn:['generate','generated','produce','produced','issue','issued','build','render a','compile','create a report','output'],                                    ui:'generation action',     verify:'artifact is produced with correct contents', neg:'source data incomplete'},
  export:   {syn:['export','download','extract','emit'],                                                                                    ui:'export action',         verify:'file downloads with the expected rows and columns', neg:'empty result set'},
  import:   {syn:['import','upload','ingest','load','attach'],                                                                              ui:'upload control',        verify:'source data is ingested and reconciled', neg:'malformed or oversized file'},
  classify: {syn:['classify','categorize','categorise','tag','label','triage','prioritize','rank','score','flag'],        ui:'classification engine', verify:'the item is assigned the correct category', neg:'ambiguous or unclassifiable input'},
  retain:   {syn:['retain','archive for','keep for','preserve','hold for'],                                                 ui:'retention policy',      verify:'the record remains retrievable for the full retention period', neg:'record purged before the period elapses'},
  comply:   {syn:['comply with','conform to','meet','adhere to','satisfy','align with'],                                    ui:'compliance check',      verify:'the stated standard is met and evidence can be produced', neg:'a control that fails the standard'},
  escalate: {syn:['escalate to','escalate'],                                                                                 ui:'escalation rule',       verify:'the item reaches the escalation target within the defined window', neg:'escalation target unavailable'},
  display:  {syn:['display','present to','show to','render','surface to','indicate'],                                        ui:'user interface',        verify:'the correct value is visible to the intended user', neg:'value missing or stale'},
  search:   {syn:['search','filter','query','find','look up','sort'],                                                                        ui:'search bar',            verify:'results match the search criteria', neg:'no matching records'},
  store:    {syn:['store','stored','persist','persisted','save','saved','retain','retained','capture','captured','maintain a record'],                                                          ui:'persistence layer',     verify:'value is retrievable after session restart', neg:'storage write fails'},
  audit:    {syn:['log','logged','audit','audited','track','tracked','trace','stamp','stamped','journal'],                                                                          ui:'audit log',             verify:'an immutable entry records actor, action and timestamp', neg:'attempt to alter an existing entry'},
  authenticate:{syn:['authenticate','log in','sign in','sso','single sign-on'],                                                              ui:'login screen',          verify:'session is established with correct identity', neg:'invalid credentials'},
  authorize:{syn:['authorize access','permit','grant','entitle','role'],                                                                     ui:'permission model',      verify:'permitted roles succeed, others are denied', neg:'unprivileged role'},
  encrypt:  {syn:['encrypt','encrypted','hash','hashed','mask','masked','redact','redacted','obfuscate','protect','protected'],                                                                   ui:'data layer',            verify:'stored/transmitted value is not readable in plain text', neg:'attempt to read raw value'},
  schedule: {syn:['schedule','trigger','run nightly','batch','recur','poll'],                                                                ui:'scheduler',             verify:'job runs at the defined interval and completes', neg:'job overlaps a prior run'}
};

/* Flatten synonyms -> canonical, longest phrases first so multi-word wins */
const VERB_LOOKUP = (() => {
  const out = [];
  for (const [canon, def] of Object.entries(VERB_TAXONOMY))
    def.syn.forEach(s => out.push({ phrase: s, canon }));
  return out.sort((a, b) => b.phrase.length - a.phrase.length);
})();

const MODAL_RE = /\b(shall not|must not|may not|cannot|shall|must|should|will|may|is required to|are required to|needs? to|has to|is able to|are able to|can)\b/i;

/* Words that are never the business object of a requirement */
const STOPWORDS = new Set(('the a an of to for in on at by with from into via and or but if then that this these those' +
  ' its their his her it they them there here as such any all each every some only also more most other another' +
  ' be been being is are was were has have had do does did shall must should will may can not no nor so than' +
  ' when while where which who whom whose what how why upon per within across over under after before during' +
  ' system platform application user users able required order able various appropriate relevant applicable' +
  ' following above below same new existing current given specified provided defined').split(/\s+/));

/* Data-field cues — things that look like captured attributes */
const FIELD_RE = /\b([a-z][a-z0-9]*(?:[ _-][a-z0-9]+){0,3})\s+(?:field|column|attribute|value|code|number|id|date|amount|status|flag|indicator|name|type|description|total|quantity|address|email|phone)\b/gi;
const NAMED_ENTITY_RE = /\b([A-Z][a-zA-Z0-9]*(?:[ _][A-Z][a-zA-Z0-9]*){0,3}(?:__c)?)\b/g;
const QUOTED_RE = /["“']([^"”']{2,60})["”']/g;

/* Condition / trigger extraction */
const COND_PATTERNS = [
  { re: /\bif\s+(.{4,120}?)(?:,|\s+then\b|\s+the\s+system\b|$)/i,            kind: 'if' },
  { re: /\bwhen\s+(.{4,120}?)(?:,|\s+then\b|\s+the\s+system\b|$)/i,          kind: 'when' },
  { re: /\bunless\s+(.{4,120}?)(?:,|\.|$)/i,                                  kind: 'unless' },
  { re: /\bonly\s+(?:if|when)\s+(.{4,120}?)(?:,|\.|$)/i,                      kind: 'only-if' },
  { re: /\bupon\s+(.{4,120}?)(?:,|\.|$)/i,                                    kind: 'upon' },
  { re: /\bafter\s+(.{4,120}?)(?:,|\.|$)/i,                                   kind: 'after' },
  { re: /\bbefore\s+(.{4,120}?)(?:,|\.|$)/i,                                  kind: 'before' },
  { re: /\bprior to\s+(.{4,120}?)(?:,|\.|$)/i,                                kind: 'before' },
  { re: /\bin the event (?:that|of)\s+(.{4,120}?)(?:,|\.|$)/i,                kind: 'when' },
  { re: /\bprovided that\s+(.{4,120}?)(?:,|\.|$)/i,                           kind: 'only-if' },
  { re: /\bexcept\s+(?:for|when|if)?\s*(.{4,120}?)(?:,|\.|$)/i,               kind: 'except' }
];

/* Quantitative constraint extraction */
const QUANT_PATTERNS = [
  { re: /\b(?:within|in less than|in under|no longer than|not exceed(?:ing)?)\s+(\d[\d,.]*)\s*(seconds?|secs?|minutes?|mins?|hours?|days?|weeks?|months?|business days?|ms|milliseconds?)\b/i, type: 'time' },
  { re: /\b(?:exceeds?|greater than|more than|above|over)\s+\$?\s*(\d[\d,.]*)\s*(%|percent|users?|records?|dollars?|USD|MB|GB|KB)?/i, type: 'upper' },
  { re: /\b(?:at least|no fewer than|minimum of|not less than)\s+\$?\s*(\d[\d,.]*)\s*(%|percent|users?|records?|characters?|dollars?|USD|MB|GB)?/i, type: 'lower' },
  { re: /\b(?:up to|maximum of|no more than|not more than|at most)\s+\$?\s*(\d[\d,.]*)\s*(%|percent|users?|records?|characters?|dollars?|USD|MB|GB)?/i, type: 'max' },
  { re: /\bsupport\s+(\d[\d,.]*)\s*(concurrent\s+users?|users?|transactions?|records?|requests?)/i, type: 'capacity' },
  { re: /\b(\d[\d,.]*)\s*(%|percent)\s*(?:uptime|availability|accuracy)/i, type: 'percent' },
  { re: /\b(\d{1,3}(?:,\d{3})+|\d+)\s*(?:or more|or greater|or above)\b/i, type: 'lower' }
];

/* ---------- helpers ---------- */
function titleCase(s) { return s.replace(/\b[a-z]/g, c => c.toUpperCase()); }
function cleanPhrase(s) {
  return String(s || '').replace(/\s+/g, ' ')
    .replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '')
    .replace(/\.$/, '').trim();
}

/* Find the governing verb + its canonical action bucket */
function findVerb(text) {
  const low = ' ' + text.toLowerCase() + ' ';
  // Prefer a verb that appears right after a modal (that's the requirement's real action)
  const m = low.match(MODAL_RE);
  const searchFrom = m ? low.indexOf(m[0]) + m[0].length : 0;
  const tail = low.slice(searchFrom);

  let best = null;
  for (const v of VERB_LOOKUP) {
    const idx = tail.indexOf(v.phrase);
    if (idx === -1) continue;
    const before = tail[idx - 1] || ' ', after = tail[idx + v.phrase.length] || ' ';
    if (/[a-z]/.test(before) || /[a-z]/.test(after)) continue; // whole-word only
    if (!best || idx < best.idx) best = { idx, phrase: v.phrase, canon: v.canon };
  }
  if (best) return best;

  // Fallback: scan whole sentence
  for (const v of VERB_LOOKUP) {
    const idx = low.indexOf(v.phrase);
    if (idx === -1) continue;
    const before = low[idx - 1] || ' ', after = low[idx + v.phrase.length] || ' ';
    if (/[a-z]/.test(before) || /[a-z]/.test(after)) continue;
    if (!best || idx < best.idx) best = { idx, phrase: v.phrase, canon: v.canon };
  }
  return best;
}

/* Compound actions: "approve or reject", "review and approve" */
function findCompoundActions(text, primaryPhrase) {
  const out = [];
  const re = /\b([a-z]{3,14})\s+(?:or|and|,)\s+([a-z]{3,14})\b/gi;
  let m;
  while ((m = re.exec(text))) {
    [m[1], m[2]].forEach(w => {
      const lw = w.toLowerCase();
      const hit = VERB_LOOKUP.find(v => v.phrase === lw);
      if (hit && !out.some(o => o.canon === hit.canon)) out.push({ phrase: lw, canon: hit.canon });
    });
  }
  return out.filter(o => o.phrase !== primaryPhrase).slice(0, 3);
}

/* Extract the business object — the noun phrase the action operates on.
   Token-walk after the governing verb, stepping over conjoined sibling verbs,
   articles and bare quantities until a real noun phrase begins. */
const VERB_WORDS = new Set(VERB_LOOKUP.filter(v => !v.phrase.includes(' ')).map(v => v.phrase));
const SKIP_LEAD = new Set(['a','an','the','to','for','of','any','all','each','every','new','its','their',
  'or','and','be','been','being','is','are','was','were','that','this','with','from','into','on','in','at','by']);

function findObject(text, verbPhrase) {
  let t = text;
  if (verbPhrase) {
    const i = t.toLowerCase().indexOf(verbPhrase);
    if (i > -1) t = t.slice(i + verbPhrase.length);
  }
  // stop at a clause boundary so we keep only the direct object
  t = t.split(/\b(?:if|when|unless|so that|in order to|because|which|that will|within|based on|according to|via|through|using|upon|after|before)\b/i)[0];

  const raw = cleanPhrase(t).split(/\s+/).filter(Boolean);
  const kept = [];
  let started = false;

  for (const w of raw) {
    const bare = w.replace(/[^A-Za-z0-9_]/g, '');
    if (!bare) { if (started) break; else continue; }
    const lw = bare.toLowerCase();

    if (!started) {
      // step over conjoined sibling verbs ("approve or reject X" -> X)
      if (VERB_WORDS.has(lw)) continue;
      if (SKIP_LEAD.has(lw)) continue;
      if (/^[\d,.$%]+$/.test(bare)) continue;      // bare quantity, not an object
      if (STOPWORDS.has(lw)) continue;
      started = true; kept.push(bare); continue;
    }
    if (STOPWORDS.has(lw) || VERB_WORDS.has(lw)) break;
    if (/^[\d,.$%]+$/.test(bare)) break;
    kept.push(bare);
    if (kept.length >= 5) break;
  }

  const phrase = cleanPhrase(kept.join(' '));
  return phrase.length > 2 ? phrase : null;
}

/* Passive voice ("<subject> shall be <verb-ed>") — the grammatical subject
   before the modal is the thing being acted on. */
function findPassiveSubject(text) {
  const m = text.match(MODAL_RE);
  if (!m) return null;
  const head = text.slice(0, text.indexOf(m[0]));
  const raw = cleanPhrase(head).split(/\s+/).filter(Boolean);
  const kept = [];
  for (const w of raw) {
    const bare = w.replace(/[^A-Za-z0-9_]/g, '');
    if (!bare) continue;
    const lw = bare.toLowerCase();
    if (!kept.length && (SKIP_LEAD.has(lw) || lw === 'all' || lw === 'every')) continue;
    if (kept.length && (STOPWORDS.has(lw) || VERB_WORDS.has(lw))) break;
    if (STOPWORDS.has(lw) && !kept.length) continue;
    kept.push(bare);
    if (kept.length >= 4) break;
  }
  const p = cleanPhrase(kept.join(' '));
  return p.length > 2 ? p : null;
}

/* "<X> is required" / "<X> is defined as" — X is the subject of the rule. */
function findRuleSubject(text) {
  const m = text.match(/\b([A-Za-z][A-Za-z0-9 _]{2,45}?)\s+(?:is|are)\s+(?:required|defined|permitted|prohibited|allowed|calculated|set|limited)\b/i);
  if (!m) return null;
  const raw = cleanPhrase(m[1]).split(/\s+/).filter(w => !SKIP_LEAD.has(w.toLowerCase()));
  const p = cleanPhrase(raw.join(' '));
  return p.length > 2 ? p : null;
}

/* Data fields / named entities the requirement touches */
function findDataElements(text) {
  const out = new Set();
  let m;
  const fr = new RegExp(FIELD_RE.source, 'gi');
  while ((m = fr.exec(text))) { const v = cleanPhrase(m[0]); if (v.length > 2 && v.length < 50) out.add(v); }
  const qr = new RegExp(QUOTED_RE.source, 'g');
  while ((m = qr.exec(text))) { const v = cleanPhrase(m[1]); if (v.length > 1) out.add(v); }
  const nr = new RegExp(NAMED_ENTITY_RE.source, 'g');
  while ((m = nr.exec(text))) {
    const v = cleanPhrase(m[1]);
    if (v.length < 4 || v.length > 45) continue;
    if (STOPWORDS.has(v.toLowerCase())) continue;
    if (/^(The|This|That|These|Those|All|Each|Any|When|If|Upon|After|Before)$/i.test(v)) continue;
    out.add(v);
  }
  return [...out].slice(0, 8);
}

/* Conditions / triggers */
function findConditions(text) {
  const out = [];
  COND_PATTERNS.forEach(p => {
    const m = text.match(p.re);
    if (m && m[1]) {
      const c = cleanPhrase(m[1]);
      if (c.length > 3 && !out.some(o => o.text.toLowerCase() === c.toLowerCase()))
        out.push({ kind: p.kind, text: c });
    }
  });
  return out.slice(0, 4);
}

/* Quantitative thresholds */
function findQuantities(text) {
  const out = [];
  QUANT_PATTERNS.forEach(p => {
    const m = text.match(p.re);
    if (m) {
      const raw = cleanPhrase(m[0]);
      if (!out.some(o => o.raw.toLowerCase() === raw.toLowerCase()))
        out.push({ type: p.type, value: m[1], unit: cleanPhrase(m[2] || ''), raw });
    }
  });
  return out.slice(0, 3);
}

/* Delegated actor: "the system shall allow/enable/permit <ACTOR> to <verb>"
   The real test actor is the delegate, not the system. */
const DELEGATE_RE = /\b(?:allow|enable|permit|let|provide)\s+(?:the\s+|a\s+|an\s+)?([A-Za-z][A-Za-z ]{2,40}?)\s+to\s+/i;
function findDelegatedActor(text, actorHints) {
  const m = text.match(DELEGATE_RE);
  if (!m) return null;
  const cand = m[1].toLowerCase().trim();
  for (const a of actorHints) {
    if (new RegExp('\\b' + a.replace(/ /g, '\\s+') + 's?\\b').test(cand))
      return { name: titleCase(a), subject: true, delegated: true };
  }
  const words = cand.split(/\s+/).filter(w => !STOPWORDS.has(w));
  if (words.length && words.length <= 3) return { name: titleCase(words.join(' ')), subject: true, delegated: true };
  return null;
}

/* Actor: who performs the action */
function findActor(text, actorHints) {
  const low = text.toLowerCase();
  const modal = low.match(MODAL_RE);
  const head = modal ? low.slice(0, low.indexOf(modal[0])) : low.slice(0, 90);

  let best = null;
  actorHints.forEach(a => {
    const re = new RegExp('\\b' + a.replace(/ /g, '\\s+') + 's?\\b');
    const mh = head.match(re);
    if (mh) { const i = head.indexOf(mh[0]); if (!best || i < best.i) best = { i, name: a, subject: true }; }
  });
  if (best) return { name: titleCase(best.name), subject: true };

  let fallback = null;
  actorHints.forEach(a => {
    const re = new RegExp('\\b' + a.replace(/ /g, '\\s+') + 's?\\b');
    const mm = low.match(re);
    if (mm) { const i = low.indexOf(mm[0]); if (!fallback || i < fallback.i) fallback = { i, name: a }; }
  });
  return fallback ? { name: titleCase(fallback.name), subject: false } : null;
}

/* Negative / prohibition detection */
function findPolarity(text) {
  if (/\b(shall not|must not|may not|cannot|should not|will not|is not permitted|are not permitted|prohibit|prevent|block|deny|restrict|disallow)\b/i.test(text))
    return 'prohibition';
  return 'obligation';
}

/* ---- MASTER: decompose one requirement into structured meaning ---- */
function decompose(text, actorHints) {
  const verb = findVerb(text);
  const canon = verb ? verb.canon : null;
  const tax = canon ? VERB_TAXONOMY[canon] : null;
  const isPassive = /\b(?:shall|must|should|will|is|are|be)\s+(?:be\s+)?[a-z]+ed\b/i.test(text);
  let obj = findObject(text, verb ? verb.phrase : null);
  // A bare quantity-modifier is not a business object ("concurrent", "total")
  if (obj && /^(concurrent|total|maximum|minimum|average|peak|simultaneous)$/i.test(obj)) obj = null;
  if (!obj && isPassive) obj = findPassiveSubject(text);
  if (!obj) obj = findRuleSubject(text);
  if (!obj) obj = findPassiveSubject(text);
  const actor = findDelegatedActor(text, actorHints) || findActor(text, actorHints);
  const compound = findCompoundActions(text, verb ? verb.phrase : null);
  const conditions = findConditions(text);
  const quantities = findQuantities(text);
  const data = findDataElements(text);
  const polarity = findPolarity(text);

  // Confidence: how much real structure did we recover?
  let conf = 0;
  if (verb) conf += 34;
  if (obj) conf += 26;
  if (actor) conf += 18;
  if (conditions.length) conf += 10;
  if (quantities.length) conf += 8;
  if (data.length) conf += 4;
  conf = Math.min(100, conf);

  return {
    actor, verb: verb ? verb.phrase : null, action: canon, taxonomy: tax,
    compound, passive: isPassive,
    object: obj, conditions, quantities, data, polarity, confidence: conf,
    vague: !verb || !obj
  };
}

if (false) module.exports = { decompose, VERB_TAXONOMY, titleCase, cleanPhrase };

