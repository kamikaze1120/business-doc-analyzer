/* ============================================================
   GAP ANALYZER v2 — findings derived from the SEMANTIC model,
   with per-requirement evidence. Each finding names the exact
   requirements at fault and states the concrete remediation.
   ============================================================ */

const VAGUE_TERMS = [
  'user-friendly','user friendly','intuitive','seamless','robust','efficient','flexible','easy to use',
  'as needed','as required','as appropriate','appropriate','adequate','reasonable','sufficient',
  'etc','and/or','various','several','some','many','fast','quick','slow','timely','minimal','maximal',
  'state of the art','best practice','industry standard','modern','simple','clean','nice','good',
  'if necessary','where applicable','among others','and so on','high quality','optimal','significant'
];
const WEASEL_RE = new RegExp('\\b(' + VAGUE_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|') + ')\\b', 'gi');

/* Coverage areas a complete BRD is normally expected to address */
const COVERAGE_AREAS = [
  { key:'security',      label:'Security & access control', re:/\b(security|authenticat|authoriz|permission|role[- ]based|encrypt|rbac|sso|mfa|least privilege)\b/i, why:'Defines who may do what; without it access rules get invented during build.' },
  { key:'audit',         label:'Audit trail / traceability', re:/\b(audit (log|trail)|traceab|history|who changed|immutable|non[- ]repudiation)\b/i, why:'Approval workflows normally require an immutable record of actor, action and timestamp.' },
  { key:'errors',        label:'Error & exception handling', re:/\b(error|exception|failure|fault|retry|rollback|fallback|timeout|unavailable|degraded)\b/i, why:'Defines behaviour when a step or integration fails, rather than leaving it to the developer.' },
  { key:'performance',   label:'Performance targets',        re:/\b(performance|response time|latency|throughput|concurrent|load|scalab|sla|uptime|availability)\b/i, why:'Without numeric targets, performance cannot be accepted or rejected at UAT.' },
  { key:'accessibility', label:'Accessibility (WCAG/508)',   re:/\b(wcag|accessib|508|screen reader|aria|contrast ratio|keyboard navigation)\b/i, why:'Public-sector and enterprise systems are typically required to meet WCAG 2.1 AA.' },
  { key:'data',          label:'Data model / migration',     re:/\b(data model|data migration|conversion|field mapping|schema|record type|object model|entity)\b/i, why:'Determines what is built and what legacy data must be moved.' },
  { key:'reporting',     label:'Reporting & analytics',      re:/\b(report|dashboard|analytic|metric|kpi|extract|export)\b/i, why:'Reporting needs are routinely discovered late and cause rework.' },
  { key:'notification',  label:'Notifications',              re:/\b(notif|alert|email|reminder|escalat|subscribe)\b/i, why:'Workflow systems depend on notifying the right person at the right time.' },
  { key:'retention',     label:'Data retention & records',   re:/\b(retention|archiv|purge|records management|dispose|records schedule|tpia|foia|public information)\b/i, why:'Governs how long records live and how they are disclosed.' },
  { key:'acceptance',    label:'Acceptance criteria',        re:/\b(acceptance criteri|definition of done|success criteri|uat|user acceptance)\b/i, why:'Without it there is no agreed basis for signing off delivery.' },
  { key:'assumptions',   label:'Assumptions & dependencies', re:/\b(assumption|dependenc|out of scope|prerequisite|constraint)\b/i, why:'Unstated assumptions are the most common source of scope disputes.' },
  { key:'roles',         label:'Roles & responsibilities',   re:/\b(role|responsibilit|raci|persona|user group|actor|stakeholder)\b/i, why:'Requirements without a named actor cannot be assigned or tested.' },
  { key:'integration',   label:'Integrations',               re:/\b(integrat|interface|api|middleware|sync|inbound|outbound|endpoint)\b/i, why:'Interfaces drive the majority of delivery risk and effort.' },
  { key:'migration',     label:'Cutover / go-live',          re:/\b(cutover|go[- ]live|deployment|rollout|training|hypercare|transition)\b/i, why:'Go-live mechanics are frequently omitted and surface as late surprises.' }
];

function analyzeSemanticGaps(reqs, sections, fullText) {
  const findings = [];
  const add = (sev, title, detail, evidence, action) =>
    findings.push({ sev, title, detail, evidence: evidence || [], action: action || '' });

  const total = reqs.length || 1;
  const fn = reqs.filter(r => ['FR', 'NFR', 'INT', 'BR'].includes(r.cat));

  /* ---- 1. Requirements with no recoverable action ---- */
  const noAction = fn.filter(r => r.sem && !r.sem.verb);
  if (noAction.length)
    add(noAction.length / total > 0.25 ? 'bad' : 'warn',
      `${noAction.length} requirement(s) contain no identifiable action`,
      'No recognizable system or user action could be parsed from these statements, so no test can be written against them. They read as descriptions rather than requirements.',
      noAction.slice(0, 8).map(r => ({ id: r.id, text: r.text })),
      'Rewrite each in the form: "<Actor> shall <action verb> <object> [under <condition>]".');

  /* ---- 2. Requirements with no business object ---- */
  const noObject = fn.filter(r => r.sem && r.sem.verb && !r.sem.object);
  if (noObject.length)
    add('warn',
      `${noObject.length} requirement(s) name an action but not what it acts on`,
      'An action verb is present but the target record, document or data element is missing, leaving the scope of the action ambiguous.',
      noObject.slice(0, 6).map(r => ({ id: r.id, text: r.text })),
      'State the object explicitly, e.g. "…shall approve the Purchase Request" rather than "…shall approve".');

  /* ---- 3. Missing actor on functional requirements ---- */
  const noActor = reqs.filter(r => r.cat === 'FR' && r.sem && !r.sem.actor);
  if (noActor.length)
    add('warn',
      `${noActor.length} functional requirement(s) do not identify an actor`,
      'It is unclear who performs or triggers the behaviour, so the requirement cannot be assigned to a role, permission set, or tester.',
      noActor.slice(0, 6).map(r => ({ id: r.id, text: r.text })),
      'Name the role explicitly rather than defaulting to "the system".');

  /* ---- 4. Vague language, with the offending term quoted ---- */
  const vague = [];
  reqs.forEach(r => {
    const hits = [...new Set((r.text.match(WEASEL_RE) || []).map(x => x.toLowerCase()))];
    if (hits.length) vague.push({ id: r.id, text: r.text, terms: hits });
  });
  if (vague.length)
    add(vague.length / total > 0.2 ? 'bad' : 'warn',
      `${vague.length} requirement(s) use unmeasurable language`,
      'These contain subjective terms that cannot be objectively verified at UAT. Each will be interpreted differently by the vendor, the tester, and the business.',
      vague.slice(0, 10).map(v => ({ id: v.id, text: v.text, note: 'ambiguous: ' + v.terms.join(', ') })),
      'Replace each subjective term with a measurable threshold or an observable outcome.');

  /* ---- 5. NFRs with no numeric target ---- */
  const nfr = reqs.filter(r => r.cat === 'NFR');
  const unquantified = nfr.filter(r => r.sem && !r.sem.quantities.length && !r.measurable);
  if (unquantified.length)
    add('bad',
      `${unquantified.length} of ${nfr.length} non-functional requirement(s) have no numeric target`,
      'A non-functional requirement without a number cannot be passed or failed. These will not be testable at UAT and typically become disputes after go-live.',
      unquantified.slice(0, 8).map(r => ({ id: r.id, text: r.text })),
      'Add a measurable target and the measurement condition, e.g. "95th-percentile page load under 2 seconds at 500 concurrent users".');

  /* ---- 6. Conditional logic with no stated alternative ---- */
  const openBranch = fn.filter(r => r.sem && r.sem.conditions.some(c => ['if', 'when', 'only-if'].includes(c.kind))
    && !/\b(otherwise|else|if not|failing which|in all other cases|reject|deny|return)\b/i.test(r.text));
  if (openBranch.length)
    add('warn',
      `${openBranch.length} conditional requirement(s) define only the positive branch`,
      'A condition is stated without specifying what happens when it is not met, leaving the negative path undefined for both build and test.',
      openBranch.slice(0, 8).map(r => ({ id: r.id, text: r.text, note: 'condition: ' + r.sem.conditions[0].text })),
      'Add the alternate branch: state explicitly what the system does when the condition is false.');

  /* ---- 7. Compound requirements ---- */
  const compound = fn.filter(r => {
    const ands = (r.text.match(/\band\b/gi) || []).length;
    const verbs = r.sem && r.sem.compound ? r.sem.compound.length : 0;
    return (ands >= 2 && r.text.length > 130) || verbs >= 2;
  });
  if (compound.length)
    add('warn',
      `${compound.length} requirement(s) bundle multiple behaviours`,
      'Each contains more than one independently testable action. Partial implementation cannot be tracked, and a single failure blocks the whole requirement.',
      compound.slice(0, 6).map(r => ({ id: r.id, text: r.text })),
      'Split into one requirement per independently verifiable behaviour.');

  /* ---- 8. Near-duplicate requirements (token overlap) ---- */
  const norm = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const dups = [];
  for (let i = 0; i < reqs.length; i++)
    for (let j = i + 1; j < reqs.length; j++) {
      const a = new Set(norm(reqs[i].text)), b = norm(reqs[j].text);
      if (!b.length || a.size < 4) continue;
      const overlap = b.filter(w => a.has(w)).length / Math.max(a.size, b.length);
      if (overlap > 0.72) dups.push({ id: `${reqs[i].id} ≈ ${reqs[j].id}`, text: reqs[j].text, note: Math.round(overlap * 100) + '% overlap' });
    }
  if (dups.length)
    add('warn', `${dups.length} probable duplicate requirement pair(s)`,
      'These pairs state substantially the same behaviour. Duplicates inflate scope estimates and can drift out of sync when one copy is edited.',
      dups.slice(0, 6),
      'Merge each pair, or differentiate them explicitly if the distinction is intentional.');

  /* ---- 9. Coverage areas absent from the document ---- */
  const missing = COVERAGE_AREAS.filter(a => !a.re.test(fullText));
  if (missing.length)
    add(missing.length >= 5 ? 'bad' : 'warn',
      `${missing.length} standard requirement area(s) are not addressed`,
      'These areas are normally expected in a BRD of this type and no matching content was found. Each is a likely source of change requests after build starts.',
      missing.map(m => ({ id: m.label, text: m.why })),
      'Confirm each area is genuinely out of scope, or add the missing requirements.');

  /* ---- 10. Integrations without error handling ---- */
  const ints = reqs.filter(r => r.cat === 'INT');
  if (ints.length && !/\b(retry|rollback|reconcil|error handling|failure|exception|dead letter|compensat|idempoten)\b/i.test(fullText))
    add('bad', `${ints.length} integration(s) defined with no failure handling`,
      'Interfaces are specified for the success path only. Behaviour on timeout, partial failure, or duplicate delivery is undefined — historically the largest source of post-go-live defects.',
      ints.slice(0, 6).map(r => ({ id: r.id, text: r.text })),
      'For each interface define: retry policy, failure notification, reconciliation method, and idempotency handling.');

  /* ---- 11. Approval workflow without audit ---- */
  const approvals = reqs.filter(r => r.sem && ['approve', 'reject', 'route'].includes(r.sem.action));
  if (approvals.length >= 2 && !/\b(audit (log|trail)|immutable|who approved|timestamp)\b/i.test(fullText))
    add('bad', `Approval workflow defined without an audit trail requirement`,
      `${approvals.length} approval or routing requirements were found, but no requirement establishes an immutable record of who approved what and when.`,
      approvals.slice(0, 5).map(r => ({ id: r.id, text: r.text })),
      'Add an explicit audit requirement capturing actor, action, timestamp, and before/after values.');

  /* ---- 12. Unresolved open items ---- */
  const oi = reqs.filter(r => r.cat === 'OI' || /\b(tbd|to be determined|tbc|pending decision|open question)\b/i.test(r.text));
  if (oi.length)
    add(oi.length > 4 ? 'bad' : 'warn', `${oi.length} unresolved open item(s) remain in the document`,
      'These represent decisions not yet made. Each one blocks the requirements that depend on it and should have a named owner and a due date before sign-off.',
      oi.slice(0, 10).map(r => ({ id: r.id, text: r.text })),
      'Assign an owner and target date to each, and identify which requirements are blocked until it is resolved.');

  /* ---- 13. Prohibitions without enforcement point ---- */
  const prohib = fn.filter(r => r.sem && r.sem.polarity === 'prohibition');
  if (prohib.length && !/\b(server[- ]side|enforce|validation rule|permission set|profile|sharing rule|api)\b/i.test(fullText))
    add('warn', `${prohib.length} prohibition(s) with no stated enforcement mechanism`,
      'These specify what must not happen but not where the rule is enforced. UI-only restrictions are bypassable via API or direct data access.',
      prohib.slice(0, 6).map(r => ({ id: r.id, text: r.text })),
      'State the enforcement layer for each (validation rule, permission set, server-side check).');

  /* ---- 14. Requirements with low structural confidence ---- */
  const weak = fn.filter(r => r.sem && r.sem.confidence < 45);
  if (weak.length / total > 0.3)
    add('bad', `${weak.length} requirement(s) are structurally weak (${Math.round(weak.length / total * 100)}% of the document)`,
      'These parse poorly against the standard requirement pattern — the actor, action, or object could not be reliably identified. This is a strong signal the document will be difficult to build and test from.',
      weak.slice(0, 8).map(r => ({ id: r.id, text: r.text, note: 'confidence ' + r.sem.confidence + '%' })),
      'Restructure using a consistent template: "<Actor> shall <verb> <object> [when <condition>] [within <measure>]".');

  const order = { bad: 0, warn: 1 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  return findings;
}

/* Weighted document quality score with a transparent breakdown */
function scoreDocument(reqs, findings, sections, fullText) {
  const fn = reqs.filter(r => ['FR', 'NFR', 'INT', 'BR'].includes(r.cat));
  const n = fn.length || 1;
  const pct = x => Math.max(0, Math.min(100, Math.round(x)));

  const testability = pct(fn.filter(r => r.sem && r.sem.verb && r.sem.object).length / n * 100);
  const clarity     = pct(100 - (reqs.filter(r => WEASEL_RE.test(r.text)).length / (reqs.length || 1)) * 130);
  const nfrSet      = reqs.filter(r => r.cat === 'NFR');
  const measurable  = nfrSet.length ? pct(nfrSet.filter(r => r.sem && r.sem.quantities.length).length / nfrSet.length * 100) : 55;
  const attribution = pct(reqs.filter(r => r.cat === 'FR' && r.sem && r.sem.actor).length / Math.max(1, reqs.filter(r => r.cat === 'FR').length) * 100);
  const coverage    = pct(COVERAGE_AREAS.filter(a => a.re.test(fullText)).length / COVERAGE_AREAS.length * 100);
  const structure   = pct(Math.min(100, sections.length * 8));

  const dims = [
    { key:'Testability',  value:testability, weight:.26, hint:'Requirements with both a clear action and a clear object' },
    { key:'Clarity',      value:clarity,     weight:.20, hint:'Absence of subjective, unmeasurable language' },
    { key:'Measurability',value:measurable,  weight:.16, hint:'Non-functional requirements carrying numeric targets' },
    { key:'Attribution',  value:attribution, weight:.14, hint:'Functional requirements naming a responsible actor' },
    { key:'Coverage',     value:coverage,    weight:.16, hint:'Standard BRD requirement areas addressed' },
    { key:'Structure',    value:structure,   weight:.08, hint:'Document organised into identifiable sections' }
  ];
  let score = dims.reduce((a, d) => a + d.value * d.weight, 0);
  score -= findings.filter(f => f.sev === 'bad').length * 3.0;
  score -= findings.filter(f => f.sev === 'warn').length * 1.0;
  return { score: pct(score), dims };
}

if (false)
  module.exports = { analyzeSemanticGaps, scoreDocument, COVERAGE_AREAS, WEASEL_RE };

