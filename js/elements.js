/* ============================================================
   BUSINESS-ELEMENT EXTRACTORS — deterministic, no AI, no network.

   These run on EVERY document regardless of type. They pull out the
   structured artifacts that different business documents care about:
   objectives, scope, stakeholders, milestones, risks, assumptions,
   personas, features, metrics/KPIs, user stories and action items.

   The doc-type layer then decides which of these to foreground.
   ============================================================ */

/* ---------- shared helpers ---------- */
function _cells(line){
  if(line.includes('\t')) return line.split('\t').map(c=>c.trim()).filter(Boolean);
  if(line.startsWith('|')) return line.split('|').map(c=>c.trim()).filter(Boolean);
  if(/\s+[—–]\s+|\s+-\s+/.test(line)) return line.split(/\s+[—–]\s+|\s+-\s+/).map(c=>c.trim()).filter(Boolean);
  if(line.includes(':')){ const i=line.indexOf(':'); return [line.slice(0,i).trim(), line.slice(i+1).trim()].filter(Boolean); }
  return [line.trim()];
}
function _stripBullet(line){ return line.replace(/^[-•*•●▪–—\s]+/,'').replace(/^\d+[.)]\s*/,'').trim(); }
function _isBulletish(line){ return /^[-•*•●▪]/.test(line.trim()) || /^\s*\d+[.)]\s+/.test(line); }
function _sentence(t){ return String(t||'').replace(/\s+/g,' ').trim(); }
function _uniq(arr, keyfn){ const seen=new Set(), out=[]; for(const x of arr){ const k=(keyfn?keyfn(x):x).toLowerCase(); if(!k||seen.has(k))continue; seen.add(k); out.push(x); } return out; }

/* Return line-spans (start,end) that live under a section whose title matches `re`. */
function _sectionSpans(sections, lines, re){
  const spans=[];
  for(let k=0;k<sections.length;k++){
    if(!re.test(sections[k].title)) continue;
    const start=sections[k].idx+1; let end=lines.length;
    for(let j=k+1;j<sections.length;j++){ if(sections[j].level<=sections[k].level){ end=sections[j].idx; break; } }
    spans.push([start,end]);
  }
  return spans;
}
/* Collect non-empty trimmed lines under matching sections. */
function _linesUnder(sections, lines, re, cap){
  const out=[];
  _sectionSpans(sections,lines,re).forEach(([a,b])=>{
    for(let i=a;i<b && out.length<(cap||200);i++){ const t=lines[i].trim(); if(t) out.push({text:t,line:i+1}); }
  });
  return out;
}
/* Collect only the item-like lines (bullets / short statements) under matching sections. */
function _itemsUnder(sections, lines, re, cap){
  return _linesUnder(sections,lines,re,cap)
    .map(o=>({text:_stripBullet(o.text), line:o.line}))
    .filter(o=>o.text.length>2 && o.text.length<400);
}

const _DATE_RE=/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,4}(?:,?\s*\d{4})?|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|Q[1-4]\s*'?\d{0,4}|H[12]\s*'?\d{0,4}|\d{4}-\d{2}-\d{2}|(?:week|sprint|phase|month)\s*\d{1,2})\b/i;
const _SEV_RE=/\b(critical|severe|high|medium|moderate|low|minor)\b/i;

/* =================================================================
   OBJECTIVES / GOALS
   ================================================================= */
function extractObjectives(lines, sections){
  const re=/\b(objective|goal|purpose|vision|mission|aim|success criteria|desired outcome|business need|problem statement)s?\b/i;
  let items=_itemsUnder(sections,lines,re,60).map(o=>o.text);
  // Global sentence cues, in case there is no dedicated section
  const joined=lines.join(' ');
  const sre=/(?:the\s+)?(?:primary\s+|main\s+|key\s+|business\s+)?(?:goal|objective|purpose|aim|vision|mission)\s+(?:of\s+this[\w\s]*?\s+)?(?:is|are|will be)\s+to\s+([^.]{8,180})\./gi;
  let m; while((m=sre.exec(joined)) && items.length<40){ items.push('To '+_sentence(m[1])); }
  items=items.filter(t=>!/^(objective|goal|purpose|vision|mission)s?:?$/i.test(t));
  return _uniq(items.map(_sentence)).slice(0,30).map((text,i)=>({id:'OBJ-'+String(i+1).padStart(2,'0'),text}));
}

/* =================================================================
   SCOPE (in / out)
   ================================================================= */
function extractScope(lines, sections){
  const inScope=[], outScope=[];
  // Section-driven
  _itemsUnder(sections,lines,/\bout[\s-]?of[\s-]?scope\b|\bexclusions?\b|\bnot in scope\b/i,80).forEach(o=>outScope.push(o.text));
  _itemsUnder(sections,lines,/\b(in[\s-]?scope|scope of (?:work|this)|inclusions?|deliverables)\b/i,80).forEach(o=>{
    if(!/\bout[\s-]?of[\s-]?scope\b/i.test(o.text)) inScope.push(o.text);
  });
  // Inline label-driven ("In Scope:", "Out of Scope:")
  let mode=null;
  lines.forEach(raw=>{
    const t=raw.trim();
    if(/^out[\s-]?of[\s-]?scope\b/i.test(t)){ mode='out'; const rest=t.replace(/^out[\s-]?of[\s-]?scope\s*[:\-–]?\s*/i,''); if(rest) outScope.push(rest); return; }
    if(/^in[\s-]?scope\b/i.test(t)){ mode='in'; const rest=t.replace(/^in[\s-]?scope\s*[:\-–]?\s*/i,''); if(rest) inScope.push(rest); return; }
    if(mode && _isBulletish(t)){ (mode==='in'?inScope:outScope).push(_stripBullet(t)); }
    else if(t==='' || /^[A-Z][A-Za-z ]{2,40}:?$/.test(t)) mode=null;
  });
  const clean=a=>_uniq(a.map(_sentence).filter(x=>x.length>2&&x.length<300)).slice(0,40);
  return {inScope:clean(inScope), outScope:clean(outScope)};
}

/* =================================================================
   STAKEHOLDERS / ROLES (RACI-aware)
   ================================================================= */
const ROLE_RE=/\b(project sponsor|executive sponsor|sponsor|product owner|product manager|project manager|program manager|business analyst|scrum master|steering committee|subject matter expert|sme|tech(?:nical)? lead|team lead|lead|director|vice president|vp|manager|approver|reviewer|developer|engineer|designer|architect|qa|tester|analyst|administrator|end[\s-]?user|customer|stakeholder|owner|supervisor|coordinator|specialist)\b/i;
const _NAME_RE=/^(?:[A-Z][a-z]+|[A-Z]\.)(?:\s+(?:[A-Z][a-z.'-]+|[A-Z]\.)){0,3}$/;
function extractStakeholders(lines, sections){
  const out=[];
  const spanLines=_linesUnder(sections,lines,/\b(stakeholder|raci|roles?(?:\s*(?:&|and)\s*responsib)?|team|approv|sign[\s-]?off|contacts?|participants?|governance)s?\b/i,200);
  const hasSection=spanLines.length>0;
  const consider = hasSection ? spanLines : lines.map((t,i)=>({text:t.trim(),line:i+1})).filter(o=>o.text);
  consider.forEach(o=>{
    const line=_stripBullet(o.text);
    if(line.length<3||line.length>200) return;
    const cells=_cells(line);
    const roleIdx=cells.findIndex(c=>ROLE_RE.test(c));
    if(roleIdx<0) return;
    const roleCell=cells[roleIdx];
    // A person's name (or a named team) in another cell, if present.
    let name=cells.find((c,i)=>i!==roleIdx && (_NAME_RE.test(c) || /^TB[DC]$/i.test(c)));
    if(!name){ const tm=cells.find((c,i)=>i!==roleIdx && /\b(team|department|group|committee|office)\b/i.test(c) && c.length<40 && !ROLE_RE.test(c)); if(tm) name=tm; }
    // Prefer the full cell as the role/title (e.g. "Enterprise Architect", "AI Lead")
    // — collapsing to the bare keyword ("Architect", "Lead") loses meaning and mis-dedupes.
    const roleM=roleCell.match(ROLE_RE);
    const role = roleCell.length<=45 ? titleCase(roleCell) : (roleM?titleCase(roleM[0]):roleCell);
    // Everything that is neither the role nor the name is descriptive note (responsibilities).
    const note=cells.filter((c,i)=>i!==roleIdx && c!==name).join(' · ').slice(0,160);
    // Outside a dedicated stakeholder section, only keep rows that actually name someone.
    if(!hasSection && !name) return;
    out.push({name:name||'—', role, note});
  });
  return _uniq(out, x=>x.name+'|'+x.role).slice(0,40);
}

/* =================================================================
   MILESTONES / TIMELINE
   ================================================================= */
const _REALDATE_RE=/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,4}(?:,?\s*\d{4})?|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|Q[1-4]\s*'?\d{2,4}|H[12]\s*'?\d{2,4}|\d{4}-\d{2}-\d{2})\b/i;
function extractMilestones(lines, sections){
  const out=[];
  const spanLines=_linesUnder(sections,lines,/\b(milestone|timeline|schedule|roadmap|phase|deliverable|key dates?|plan|sprint)s?\b/i,200);
  const hasSection=spanLines.length>0;
  const consider = hasSection ? spanLines : lines.map((t,i)=>({text:t.trim(),line:i+1})).filter(o=>o.text);
  consider.forEach(o=>{
    const line=_stripBullet(o.text);
    if(line.length<4||line.length>220) return;
    const dm=line.match(_DATE_RE);
    const phase=line.match(/\b(phase|milestone|sprint|stage)\s*\d{1,2}\b/i);
    if(!dm && !phase) return;
    // Outside a timeline section, require a real calendar date (not just "week 1" in an action item)
    if(!hasSection && !_REALDATE_RE.test(line)) return;
    const cells=_cells(line);
    // Prefer a real calendar date; fall back to a phase/week token only if that's all there is.
    const rd=line.match(_REALDATE_RE);
    const date = rd ? _sentence(rd[0]) : (dm?_sentence(dm[0]):'');
    // Label = everything that isn't the chosen date (a "Phase N" token can stay in the label).
    const labelParts=cells.filter(c=>c.length>1 && !_REALDATE_RE.test(c) && !(date && c.indexOf(date)>-1));
    let label=_sentence(labelParts.join(' — ')).replace(/[:\-–—]\s*$/,'');
    if(label.length<2) label = phase?titleCase(phase[0]):'Milestone';
    out.push({label:label.slice(0,140), date, line:o.line});
  });
  return _uniq(out, x=>x.label+'|'+x.date).slice(0,40);
}

/* =================================================================
   RISKS (+ mitigation, severity)
   ================================================================= */
function extractRisks(lines, sections){
  const out=[];
  const spanLines=_linesUnder(sections,lines,/\b(risks?|threats?|issues?|concerns?|contingenc(?:y|ies))\b/i,200);
  const consider = spanLines.length ? spanLines
    : lines.map((t,i)=>({text:t.trim(),line:i+1})).filter(o=>/\brisk\b/i.test(o.text));
  consider.forEach(o=>{
    const tabular=/\t|\|/.test(o.text);
    let line=_stripBullet(o.text);
    if(line.length<8||line.length>400) return;
    if(/^(risk|threat|issue)s?:?$/i.test(line)) return;
    // Severity from the whole original line, before we chop anything off
    const sevM=(o.text.match(_SEV_RE)||[])[0];
    const sev=sevM?titleCase(sevM):'';
    // Strip a leading "Risk:" / "Threat 3 -" style label so it isn't mistaken for the risk text
    line=line.replace(/^(?:risk|threat|issue|concern)\s*#?\d*\s*[:\-–]\s*/i,'');
    // Pull an inline mitigation clause off the end
    let mitigation='';
    const mm=line.match(/\b(?:mitigat(?:e|ion|ed)?|response|contingency|treatment|resolution|action)\s*[:\-–]\s*(.+)$/i);
    if(mm){ mitigation=_sentence(mm[1]); line=line.slice(0,mm.index).trim(); }
    // Drop a trailing "Severity: High" clause from the risk text
    line=line.replace(/[.;]?\s*(?:severity|likelihood|impact|priority)\s*[:\-–]\s*\w+\s*$/i,'').trim();
    let risk=line;
    if(tabular){ // risk register row: risk | likelihood | impact | mitigation
      const cells=_cells(o.text.replace(/^(?:risk|threat)\s*#?\d*\s*[:\-–]\s*/i,''));
      risk=cells[0]||line;
      if(!mitigation && cells.length>=3) mitigation=cells[cells.length-1];
    }
    risk=_sentence(risk).replace(/[.;]+$/,'');
    if(risk.length<6) return;
    out.push({risk:risk.slice(0,220), mitigation:mitigation.replace(/[.;]+$/,'').slice(0,220), sev});
  });
  return _uniq(out, x=>x.risk).slice(0,40);
}

/* =================================================================
   ASSUMPTIONS / CONSTRAINTS / DEPENDENCIES
   ================================================================= */
function extractAssumptions(lines, sections){
  const grab=(re,inlineRe)=>{
    let items=_itemsUnder(sections,lines,re,60).map(o=>o.text);
    lines.forEach(raw=>{ const t=raw.trim(); const m=t.match(inlineRe); if(m&&m[1]&&_sentence(m[1]).length>4) items.push(_sentence(m[1])); });
    return _uniq(items.map(_sentence).filter(x=>x.length>4&&x.length<300)).slice(0,25);
  };
  return {
    assumptions: grab(/\bassumptions?\b/i, /^\s*assumption\s*[:\-–]\s*(.+)$/i),
    constraints: grab(/\bconstraints?\b|\blimitations?\b/i, /^\s*constraint\s*[:\-–]\s*(.+)$/i),
    dependencies: grab(/\bdependenc(?:y|ies)\b|\bprerequisite/i, /^\s*dependenc(?:y|ies)\s*[:\-–]\s*(.+)$/i)
  };
}

/* =================================================================
   PERSONAS (PRD)
   ================================================================= */
function extractPersonas(lines, sections, stories){
  const out=[];
  _linesUnder(sections,lines,/\b(persona|user type|target (?:user|audience)|audience|user profile|actor)s?\b/i,120).forEach(o=>{
    const line=_stripBullet(o.text);
    if(line.length<4||line.length>240) return;
    const cells=_cells(line);
    const name=_sentence(cells[0]).slice(0,60);
    const desc=cells.slice(1).join(' · ').slice(0,220);
    if(/^(persona|user type|audience|target)s?:?$/i.test(name)) return;
    if(name.length<2) return;
    out.push({name, desc});
  });
  // Fold in roles discovered from user stories
  (stories||[]).forEach(s=>{ if(s.role) out.push({name:titleCase(s.role), desc:'Derived from user stories'}); });
  return _uniq(out, x=>x.name).slice(0,30);
}

/* =================================================================
   FEATURES / CAPABILITIES (PRD, Agile)
   ================================================================= */
function extractFeatures(lines, sections){
  const out=[];
  _itemsUnder(sections,lines,/\b(feature|capabilit(?:y|ies)|functionalit|epic|module|component|user need)s?\b/i,120).forEach(o=>{
    const t=o.text;
    if(t.length<5||t.length>260) return;
    if(/^(feature|capabilit|epic|module)s?:?$/i.test(t)) return;
    const cells=_cells(t);
    out.push({name:_sentence(cells[0]).slice(0,120), desc:cells.slice(1).join(' · ').slice(0,240)});
  });
  return _uniq(out, x=>x.name).slice(0,40).map((f,i)=>Object.assign({id:'FEAT-'+String(i+1).padStart(2,'0')},f));
}

/* =================================================================
   METRICS / KPIs / SUCCESS MEASURES
   ================================================================= */
const _METRIC_KW=/\b(kpi|metric|success (?:metric|measure|criteria)|target|nps|csat|conversion|retention|churn|adoption|uptime|availability|response time|throughput|revenue|cost|roi|accuracy|error rate|satisfaction|engagement|dau|mau|sla)\b/i;
function extractMetrics(lines, sections){
  const out=[];
  const spanLines=_linesUnder(sections,lines,/\b(kpi|metric|success|measure|okr|target|performance indicator)s?\b/i,120);
  const consider = spanLines.length ? spanLines
    : lines.map((t,i)=>({text:t.trim(),line:i+1})).filter(o=>_METRIC_KW.test(o.text)&&/\d/.test(o.text));
  consider.forEach(o=>{
    const line=_stripBullet(o.text);
    if(line.length<4||line.length>240) return;
    if(!_METRIC_KW.test(line) && !/\d\s*%|\bwithin\b|\bunder\b|\bat least\b/.test(line)) return;
    const cells=_cells(line);
    const targetM=line.match(/(<|>|≤|≥|<=|>=)?\s*\$?\d[\d,.]*\s*(%|percent|ms|s(?:ec)?|min|hours?|days?|users?|k|m|bn|million|billion|points?|\/\s*\d+)?/i);
    let name=cells[0];
    if(_METRIC_KW.test(cells[0])===false && cells[1] && _METRIC_KW.test(cells[1])) name=cells[1];
    name=_sentence(name).replace(/[:\-–—]$/,'').slice(0,120);
    if(/^(kpi|metric|measure|target)s?:?$/i.test(name)) return;
    out.push({name, target: targetM?_sentence(targetM[0]):'', raw:_sentence(line).slice(0,220)});
  });
  return _uniq(out, x=>x.raw).slice(0,30);
}

/* =================================================================
   USER STORIES + ACCEPTANCE CRITERIA (Agile / PRD)
   ================================================================= */
function extractStories(lines, sections){
  const text=lines.join('\n');
  const out=[];
  const re=/\bas\s+an?\s+([^,.\n]{2,50}?)\s*,?\s+i\s+(?:want|need|would like|wish|should be able)\s+(?:to\s+)?([^,.\n]{4,160}?)(?:\s*,?\s+so\s+that\s+([^.\n]{4,160}))?[.\n]/gi;
  let m;
  while((m=re.exec(text)) && out.length<200){
    const role=_sentence(m[1]).replace(/^an?\s+/i,'').toLowerCase();
    const want=_sentence(m[2]);
    const benefit=m[3]?_sentence(m[3]):'';
    // Acceptance criteria: look at the ~12 lines following the match position
    const after=text.slice(m.index+m[0].length, m.index+m[0].length+800);
    const ac=[];
    const acBlock=after.match(/acceptance criteria\s*[:\-]?\s*([\s\S]{0,600})/i);
    if(acBlock){ acBlock[1].split('\n').forEach(l=>{ const s=_stripBullet(l.trim()); if(s&&s.length>4&&s.length<200&&ac.length<8 && !/^(feature|epic|as an?)/i.test(s)) ac.push(s); }); }
    const gwt=after.match(/\b(given|when|then)\b[^\n]{4,160}/gi);
    if(gwt && !ac.length) gwt.slice(0,6).forEach(g=>ac.push(_sentence(g)));
    const ptsM=m[0].match(/\b(\d{1,2})\s*(?:points?|sp|story points?)\b/i) || after.slice(0,120).match(/\b(?:points?|sp|estimate)\s*[:=]?\s*(\d{1,2})\b/i);
    out.push({id:'US-'+String(out.length+1).padStart(3,'0'), role, want, benefit, ac, points: ptsM?ptsM[1]:'', raw:_sentence(m[0]).slice(0,300)});
  }
  return out;
}

/* =================================================================
   ACTION ITEMS / OPEN QUESTIONS (Process / meeting notes)
   ================================================================= */
function extractActionItems(lines, sections){
  const actions=[], questions=[];
  const spanLines=_linesUnder(sections,lines,/\b(action item|next step|to[\s-]?do|follow[\s-]?up|open question|parking lot|decisions?)s?\b/i,150);
  const consider = spanLines.length ? spanLines : lines.map((t,i)=>({text:t.trim(),line:i+1})).filter(o=>o.text);
  consider.forEach(o=>{
    let line=o.text;
    const isAction=/^\s*(?:\[\s?\]|action\s*(?:item)?\s*[:\-–]|todo\b|ai-?\d|▢|☐|-\s*\[\s?\])/i.test(line) || _stripBullet(line).match(/\b(owner|assignee|due)\s*[:=]/i);
    line=_stripBullet(line).replace(/^\[\s?\]\s*/,'').replace(/^action\s*(?:item)?\s*[:\-–]\s*/i,'').replace(/^todo\s*[:\-–]?\s*/i,'');
    if(!line || line.length<5 || line.length>260) return;
    if(isAction){
      const owner=(line.match(/\b(?:owner|assignee|responsible)\s*[:=]\s*([A-Z][A-Za-z .'-]{1,40})/i)||[])[1]||'';
      const due=(line.match(/\bdue\s*[:=]?\s*([^,;.\n]{3,40})/i)||[])[1]|| (line.match(_DATE_RE)||[])[0] ||'';
      actions.push({text:_sentence(line).slice(0,220), owner:_sentence(owner), due:_sentence(due)});
    } else if(/\?\s*$/.test(line) && spanLines.length){
      questions.push(_sentence(line).slice(0,220));
    }
  });
  // Global open questions: any interrogative line, or explicit TBD / open-question cues
  lines.forEach(raw=>{ const t=raw.trim();
    if(t.length>6 && t.length<200 && (/\?\s*$/.test(t) || /\b(tbd|to be determined|open question|needs? (?:clarif|decision)|pending decision)\b/i.test(t)))
      questions.push(_sentence(_stripBullet(t))); });
  return {actions:_uniq(actions,x=>x.text).slice(0,50), questions:_uniq(questions).slice(0,30)};
}

/* =================================================================
   MASTER — run every extractor, return the element bundle
   ================================================================= */
function extractElements(lines, sections){
  const stories=extractStories(lines, sections);
  const scope=extractScope(lines, sections);
  const acd=extractAssumptions(lines, sections);
  const ai=extractActionItems(lines, sections);
  return {
    objectives: extractObjectives(lines, sections),
    scopeIn: scope.inScope,
    scopeOut: scope.outScope,
    stakeholders: extractStakeholders(lines, sections),
    milestones: extractMilestones(lines, sections),
    risks: extractRisks(lines, sections),
    assumptions: acd.assumptions,
    constraints: acd.constraints,
    dependencies: acd.dependencies,
    personas: extractPersonas(lines, sections, stories),
    features: extractFeatures(lines, sections),
    metrics: extractMetrics(lines, sections),
    stories,
    actions: ai.actions,
    questions: ai.questions
  };
}
