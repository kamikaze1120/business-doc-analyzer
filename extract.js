/* ============================================================
   EXTRACTION ENGINE — deterministic, zero-dependency logic.
   Requirements, sections, process flow, scenarios, tests, meta.
   (Ported verbatim from the original BRD engine.)
   ============================================================ */

/* ---------- Lexicon ---------- */
const MODALS = {
  must:['shall','must','is required to','are required to','will be required'],
  should:['should','ought to','is expected to'],
  may:['may','can optionally','could']
};
const ACTOR_HINTS = [
  'user','citizen','resident','customer','admin','administrator','submitter','requester',
  'manager','approver','budget owner','procurement','finance','staff','agent','operator',
  'system','platform','service','integration','api','scheduler','job','reviewer','supervisor',
  'director','analyst','vendor','supplier','contractor','applicant','employee','department',
  'clerk','inspector','planner','council','auditor','guest','visitor','member','owner'
];
const CATEGORY_RULES = [
  {k:'NFR', re:/\b(performance|latency|throughput|scalab|availab|uptime|response time|concurrent|security|encrypt|authenticat|authoriz|audit log|wcag|accessib|508|compliance|retention|backup|disaster|recover|sla|browser support|load)\b/i},
  {k:'INT', re:/\b(integrat|interface with|api|endpoint|middleware|mulesoft|webhook|sync|synchroniz|feed|import from|export to|connector|sso|saml|oauth|rest|soap|etl|jde|laserfiche|salesforce|sap|oracle)\b/i},
  {k:'BR',  re:/\b(business rule|rule:|policy|threshold|if .* then|calculated as|formula|fiscal year|must not exceed|limited to|eligib|validation rule|constraint)\b/i},
  {k:'ASM', re:/\b(assum|dependenc|out of scope|prerequisite|presum)\b/i},
  {k:'OI',  re:/\b(open item|tbd|to be determined|pending decision|unresolved|needs clarification|open question|\bTBC\b)\b/i},
  {k:'FR',  re:/.*/}
];
const CAT_NAME = {FR:'Functional',NFR:'Non-Functional',INT:'Integration',BR:'Business Rule',ASM:'Assumption',OI:'Open Item'};
const NEG_WORDS = /\b(not|never|cannot|reject|deny|fail|invalid|error|unauthoriz|expire|missing|duplicate|exceed|timeout|offline|unavailable)\b/i;
const ID_RE = /\b((?:FR|NFR|INT|BR|BRQ|REQ|UC|US|BUS|SEC|RPT|OI|ASM|RULE|R)[-_ ]?\d{1,4}(?:\.\d{1,3})*)\b/i;

/* ---------- Text normalization ---------- */
function normalize(raw){
  return raw.replace(/\r\n?/g,'\n')
            .replace(/\u00a0/g,' ')
            .replace(/[\u2018\u2019]/g,"'")
            .replace(/[\u201c\u201d]/g,'"')
            .replace(/\t+/g,'\t')
            .replace(/\n{4,}/g,'\n\n\n');
}

/* ---------- Section detection ---------- */
const SECTION_RE = /^(?:\s{0,6})(?:(\d+(?:\.\d+)*)[.)]?\s+)?([A-Z][A-Za-z0-9 &\/\-,'()]{2,70})\s*$/;
function detectSections(lines){
  const secs=[]; 
  lines.forEach((ln,i)=>{
    const t=ln.trim();
    if(!t||t.length>85) return;
    const m=t.match(SECTION_RE);
    if(!m) return;
    const title=m[2].trim();
    const words=title.split(/\s+/);
    if(words.length>10) return;
    if(/[.;:]$/.test(title) && !m[1]) return;
    const numbered=!!m[1];
    const titlecase=words.filter(w=>/^[A-Z]/.test(w)).length >= Math.ceil(words.length*0.6);
    const known=/\b(introduction|purpose|scope|background|objective|stakeholder|requirement|assumption|dependenc|glossar|appendix|overview|process|workflow|integration|security|reporting|risk|approval|acceptance|success|constraint|out of scope|current state|future state|user stor|use case|data model|open item|revision|approach|summary)\b/i.test(title);
    if(numbered||known||(titlecase&&words.length<=8)){
      secs.push({idx:i,num:m[1]||'',title,level:m[1]?m[1].split('.').length:1,known});
    }
  });
  return secs;
}

/* ---------- Requirement extraction ---------- */
function splitSentences(block){
  return block.split(/(?<=[.;!?])\s+(?=[A-Z0-9])/).map(s=>s.trim()).filter(Boolean);
}
const ID_PREFIX_CAT = {FR:'FR',BRQ:'FR',REQ:'FR',UC:'FR',US:'FR',BUS:'FR',R:'FR',
  NFR:'NFR',SEC:'NFR',INT:'INT',BR:'BR',RULE:'BR',RPT:'FR',OI:'OI',ASM:'ASM'};
function classify(text, explicitId){
  // An explicit ID prefix authored by the BA is authoritative — never override it.
  if(explicitId){
    const p = explicitId.replace(/[-_ ]?\d.*$/,'').toUpperCase();
    if(ID_PREFIX_CAT[p]) return ID_PREFIX_CAT[p];
  }
  for(const r of CATEGORY_RULES){ if(r.re.test(text)) return r.k; }
  return 'FR';
}
function priorityOf(text){
  if(/\b(shall|must|is required|critical|mandatory|high priority|p1)\b/i.test(text)) return 'High';
  if(/\b(should|expected to|important|medium|p2)\b/i.test(text)) return 'Medium';
  return 'Low';
}
function actorsIn(text){
  const low=text.toLowerCase(); const found=new Set();
  ACTOR_HINTS.forEach(a=>{ if(new RegExp('\\b'+a.replace(/ /g,'\\s+')+'s?\\b').test(low)) found.add(a); });
  return [...found];
}
function isRequirement(s){
  if(s.length<14||s.length>700) return false;
  // A line that opens with an authored requirement ID is a requirement, full stop.
  if(/^\s*(?:FR|NFR|INT|BR|BRQ|REQ|UC|US|BUS|SEC|RPT|OI|ASM|RULE)[-_ ]?\d/i.test(s)) return true;
  if(/\b(shall|must|should|will|is required to|are required to|needs? to|has to|may optionally|system provides?|allows? the|enables? the|supports?|is defined as|are defined as)\b/i.test(s)) return true;
  if(ID_RE.test(s) && /\b(system|user|application|platform|process|data|report)\b/i.test(s)) return true;
  return false;
}
function extractRequirements(lines, sections){
  const reqs=[]; let seq=0;
  const secAt = i => { let cur=null; for(const s of sections){ if(s.idx<=i) cur=s; else break; } return cur; };

  lines.forEach((raw,i)=>{
    const line=raw.trim();
    if(!line) return;
    // Table rows (tab or pipe separated) get treated as one unit
    const cells = line.includes('\t') ? line.split('\t').map(c=>c.trim()).filter(Boolean)
                : (line.startsWith('|') ? line.split('|').map(c=>c.trim()).filter(Boolean) : null);
    const units = cells && cells.length>1 ? [cells.join(' — ')] : splitSentences(line);

    units.forEach(u=>{
      const clean=u.replace(/^[-•*\u2022\u25cf\d.)\s]+/,'').trim();
      if(!isRequirement(clean)) return;
      const idm = clean.match(ID_RE);
      const explicitId = idm ? idm[1].toUpperCase().replace(/[_ ]/g,'-') : null;
      // Remove a leading ID token so the body reads as pure requirement prose.
      const body = clean.replace(/^\s*(?:FR|NFR|INT|BR|BRQ|REQ|UC|US|BUS|SEC|RPT|OI|ASM|RULE)[-_ ]?\d{1,4}(?:\.\d{1,3})*\s*[:.\-–)]?\s*/i,'').trim() || clean;
      const sec = secAt(i);
      seq++;
      const cat = classify(body, explicitId);
      reqs.push({
        seq,
        id: explicitId || `${cat}-${String(seq).padStart(3,'0')}`,
        derived: !idm,
        text: body,
        cat,
        priority: priorityOf(body),
        actors: actorsIn(body),
        section: sec ? (sec.num? sec.num+' ':'')+sec.title : 'Unsectioned',
        line: i+1,
        testable: /\b(shall|must|should|will|display|generate|validate|calculate|send|store|route|approve|reject|notify|export|import|log|prevent|restrict|allow|require)\b/i.test(body),
        measurable: /\b\d+\s*(%|percent|second|minute|hour|day|ms|mb|gb|user|record|concurrent)|within \d|less than \d|at least \d|no more than \d|exceeds? \d/i.test(body)
      });
    });
  });

  // dedupe by normalized text
  const seen=new Set();
  return reqs.filter(r=>{ const k=r.id+'::'+r.text.toLowerCase().replace(/\W+/g,''); if(seen.has(k))return false; seen.add(k); return true; });
}

/* ---------- Process flow extraction ---------- */
const STEP_VERBS = /\b(submit|create|enter|review|approve|reject|route|assign|validate|verify|notify|send|generate|update|close|escalate|receive|upload|download|log in|authenticate|search|select|confirm|complete|initiate|process|record|publish|archive|return|forward|sign|attach|calculate|post|sync|export|import|schedule|trigger|display|save|cancel|provision|prepare|order|configure|install|check|collect|obtain|issue)(?:e?s|ed|ing|d)?\b/i;
function extractFlow(lines, reqs){
  const steps=[]; let n=0;
  const numbered=[];
  lines.forEach((raw,i)=>{
    const t=raw.trim();
    const m=t.match(/^(?:step\s*)?(\d{1,2})[.)]\s+(.{10,300})$/i);
    // An explicit "Step N." line is a step regardless of verb form; otherwise require an action verb.
    if(m && (/^step\b/i.test(t) || STEP_VERBS.test(m[2]))) numbered.push({order:+m[1],text:m[2].trim(),line:i+1});
  });
  const src = numbered.length>=3 ? numbered
    : reqs.filter(r=>STEP_VERBS.test(r.text) && (r.cat==='FR'||r.cat==='BR'))
          .map((r,k)=>({order:k+1,text:r.text,line:r.line,reqId:r.id}));

  src.forEach(s=>{
    n++;
    const acts=actorsIn(s.text);
    const lane = acts.length ? acts[0] : (/\b(system|platform|api|integration|job|scheduler)\b/i.test(s.text)?'system':'user');
    steps.push({
      n, lane: lane.charAt(0).toUpperCase()+lane.slice(1),
      text: s.text.length>170 ? s.text.slice(0,167)+'…' : s.text,
      full: s.text,
      decision: /\bif\b|\bwhether\b|approve|reject|valid|eligib|exceed|threshold|otherwise|else\b/i.test(s.text),
      reqId: s.reqId||null, line:s.line
    });
  });
  return steps;
}

/* ---------- E2E scenario synthesis ---------- */
function buildScenarios(reqs, steps){
  const byLane={}; steps.forEach(s=>{ (byLane[s.lane]=byLane[s.lane]||[]).push(s); });
  const scen=[];

  // Happy path from ordered steps
  if(steps.length){
    scen.push({
      id:'E2E-001', name:'Happy Path — End-to-End Primary Flow', type:'Positive',
      actors:[...new Set(steps.map(s=>s.lane))],
      steps: steps.map(s=>s.full),
      reqs: steps.map(s=>s.reqId).filter(Boolean),
      expected:'All stages complete successfully; record reaches terminal state with full audit trail.'
    });
  }
  // Decision branches → alternate scenarios
  steps.filter(s=>s.decision).slice(0,8).forEach((s,i)=>{
    scen.push({
      id:`E2E-${String(scen.length+1).padStart(3,'0')}`,
      name:`Alternate Path — ${s.lane} decision at step ${s.n}`, type:'Alternate',
      actors:[s.lane],
      steps: steps.filter(x=>x.n<=s.n).map(x=>x.full).concat(['Decision evaluates to the negative branch.','System routes to exception/return handling.']),
      reqs:[s.reqId].filter(Boolean),
      expected:'Negative branch handled; requester notified; record does not advance.'
    });
  });
  // Integration scenarios
  reqs.filter(r=>r.cat==='INT').slice(0,6).forEach(r=>{
    scen.push({
      id:`E2E-${String(scen.length+1).padStart(3,'0')}`,
      name:`Integration — ${r.id}`, type:'Integration',
      actors:['System'],
      steps:['Trigger condition occurs in source system.', r.text, 'Payload transmitted to target.','Acknowledgement received and logged.'],
      reqs:[r.id],
      expected:'Data lands in target system with matching key values; failures retried and logged.'
    });
  });
  // NFR verification
  reqs.filter(r=>r.cat==='NFR' && r.measurable).slice(0,6).forEach(r=>{
    scen.push({
      id:`E2E-${String(scen.length+1).padStart(3,'0')}`,
      name:`Non-Functional Verification — ${r.id}`, type:'NFR',
      actors:['System'], steps:['Establish baseline environment.', r.text, 'Measure against stated threshold.'],
      reqs:[r.id], expected:'Measured value meets or exceeds the stated threshold.'
    });
  });
  return scen;
}

/* ---------- Test case generation (semantic, content-driven) ---------- */
function genTests(reqs, scen){
  const tcs=[]; let n=0;
  const add=o=>{ n++; tcs.push(Object.assign({id:'TC-'+String(n).padStart(3,'0')},o)); };

  reqs.forEach(r=>{
    const d=r.sem;
    if(!d) return;
    const scenario = findScenarioAnchor(r, scen);
    if(r.cat==='ASM') return;                       // assumptions are not testable
    if(r.cat==='OI'){                               // open items produce a blocker, not a test
      add({req:r.id,cat:r.cat,type:'Blocked',priority:'High',confidence:d.confidence,
        title:`Cannot test — ${r.id} is unresolved`,
        pre:'This item records an undecided point; no verification is possible until it is closed.',
        steps:['Obtain the pending decision from the accountable stakeholder.',
               'Convert the resolution into a testable requirement.',
               'Regenerate the test case once the requirement is written.'],
        expected:'Open item is closed and replaced by a requirement stating a verifiable behaviour.',
        vague:true});
      return;
    }
    // A requirement with no recoverable ACTION cannot yield a meaningful test.
    // Emitting filler steps would hide the problem, so report it instead.
    if(!d.verb){
      const missing = [];
      if(!d.verb)   missing.push('an action verb (what the system or actor does)');
      if(!d.object) missing.push('a business object (what the action applies to)');
      if(!d.actor)  missing.push('an actor (who performs or triggers it)');
      add({req:r.id,cat:r.cat,type:'Not testable',priority:r.priority,confidence:d.confidence,
        title:`Not testable as written — ${r.id} states no verifiable action`,
        pre:`This statement is missing ${missing.join('; ')}. As written there is no observable behaviour to pass or fail.`,
        steps:[
          `Current text: "${r.text}"`,
          'Rewrite in the form: "<Actor> shall <verb> <object> [when <condition>] [within <measurable limit>]".',
          d.quantities.length
            ? `Retain the existing threshold (${d.quantities.map(q=>q.raw).join('; ')}) and attach it to the new action.`
            : 'Add a measurable threshold if this is a performance, capacity or timing requirement.',
          'Re-run the analysis once the requirement has been restated.'],
        expected:'The requirement expresses one observable behaviour that a tester can objectively pass or fail.',
        vague:true});
      return;
    }

    const actorName = d.actor ? d.actor.name : 'System';
    const objName   = d.object || 'the record';
    const label     = restate(d, r.text);

    // --- Positive / primary path ---
    add({req:r.id,cat:r.cat,type:d.polarity==='prohibition'?'Restriction':'Positive',
      priority:r.priority,confidence:d.confidence,
      title: d.polarity==='prohibition'
        ? `Confirm ${actorName} cannot ${d.verb||'perform the action'} ${lower1(objName)} — ${scenario ? scenario.name : r.id}`
        : `${actorName} can ${d.verb||'complete'} ${lower1(objName)} — ${scenario ? scenario.name : r.id}`,
      pre: buildPreconditions(d,r,scenario),
      steps: buildPositiveSteps(d,r,scenario),
      expected: buildExpected(d,r),
      basis: label});

    // --- Negative path (skip for prohibitions: already the primary) ---
    if(d.polarity!=='prohibition'){
      add({req:r.id,cat:r.cat,type:'Negative',priority:r.priority,confidence:d.confidence,
        title:`Invalid ${d.verb||'action'} on ${lower1(objName)} is rejected — ${scenario ? scenario.name : r.id}`,
        pre: buildPreconditions(d,r,scenario),
        steps: buildNegativeSteps(d,r,scenario),
        expected: buildNegativeExpected(d),
        basis: label});
    }

    // --- Boundary tests from real thresholds ---
    d.quantities.forEach(q=>{
      const unit=q.unit||'';
      add({req:r.id,cat:r.cat,type:'Boundary',priority:'High',confidence:d.confidence,
        title:`Boundary: ${objName} at ${q.value} ${unit}`.trim(),
        pre:`Environment able to produce values immediately below, at, and above ${q.value} ${unit}.`.trim(),
        steps:[
          `Execute with a value just below ${q.value} ${unit}.`.trim(),
          `Execute with a value exactly equal to ${q.value} ${unit}.`.trim(),
          `Execute with a value just above ${q.value} ${unit}.`.trim(),
          `Record the system behaviour at each of the three points.`],
        expected:`Behaviour changes at exactly the ${q.value} ${unit} boundary and is consistent on repeat runs. No off-by-one in either direction.`.trim(),
        basis:label});
    });

    // --- Condition branches: each condition yields its negative branch ---
    d.conditions.filter(c=>['if','when','only-if','unless'].includes(c.kind)).forEach(c=>{
      add({req:r.id,cat:r.cat,type:'Alternate',priority:r.priority,confidence:d.confidence,
        title:`Alternate branch: condition "${c.text}" not met`,
        pre:`Record prepared so that the condition "${c.text}" is FALSE.`,
        steps:[
          `Arrange data so that ${c.text} does not hold.`,
          `Perform the ${d.verb||'action'} on ${artic(lower1(objName))}.`,
          `Observe which path the system takes.`],
        expected:`The system takes the defined alternate path rather than the conditional behaviour. If the BRD does not define this branch, raise it as a gap.`,
        basis:label});
    });

    // --- Security tests where access/permission is implicated ---
    if(['authenticate','authorize','encrypt'].includes(d.action) ||
       /\b(permission|role|access|confidential|sensitive|pii|restricted)\b/i.test(r.text)){
      add({req:r.id,cat:r.cat,type:'Security',priority:'High',confidence:d.confidence,
        title:`Access control enforced for ${lower1(objName)}`,
        pre:'One permitted account and one non-permitted account are available.',
        steps:[
          `Attempt the action on ${artic(lower1(objName))} using the non-permitted account.`,
          `Repeat the attempt directly against the API/URL, bypassing the interface.`,
          `Repeat using the permitted account.`],
        expected:'Both unauthorized attempts are denied and logged; only the permitted account succeeds. Enforcement holds server-side, not only in the UI.',
        basis:label});
    }
  });

  // --- Scenario-level end-to-end tests ---
  scen.forEach(sc=>{
    add({req:sc.reqs.join(', ')||'—',cat:'E2E',type:sc.type,priority:'High',confidence:90,
      title:`${sc.name}`,
      pre:`Actors provisioned: ${sc.actors.join(', ')}. Clean environment with representative data.`,
      steps:sc.steps, expected:sc.expected, basis:sc.name});
  });

  return tcs;
}

/* gap analysis now provided by the semantic analyzer (analyzeSemanticGaps / scoreDocument) */

/* ---------- Overview metadata ---------- */
function extractMeta(text, lines){
  const grab = re => { const m=text.match(re); return m? m[1].trim().slice(0,120) : null; };
  const title = lines.slice(0,40).map(l=>l.trim()).find(l=>l.length>8&&l.length<95&&!/^(page|table of|version|date|prepared|confidential|revision)/i.test(l)) || 'Untitled BRD';
  return {
    title,
    version: grab(/\bversion\s*(?:no\.?|number)?\s*[:#\-]?\s*([vV]?\s*\d+(?:\.\d+)*)/i) || grab(/\b([vV]\d+\.\d+)\b/),
    date: grab(/\b(?:date|dated|last updated|revised)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i),
    author: grab(/\b(?:author|prepared by|owner|business analyst)\s*[:\-]\s*([A-Za-z .,'\-]{3,60})/i),
    dept: grab(/\b(?:department|division|organization|agency)\s*[:\-]\s*([A-Za-z .,'\-&]{3,60})/i)
  };
}
