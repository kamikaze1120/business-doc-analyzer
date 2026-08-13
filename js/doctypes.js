/* ============================================================
   DOCUMENT-TYPE INTELLIGENCE — deterministic classifier + profiles.

   Given the parsed document (text, sections, requirements, elements)
   it scores each known business-document archetype and picks the best
   fit, then supplies the ordered set of views (tabs) that make sense
   for that archetype. No AI, no network — pure weighted signals.
   ============================================================ */

/* Count regex hits in a string (capped, cheap). */
function _hits(re, s){ const m=s.match(new RegExp(re.source, re.flags.includes('g')?re.flags:re.flags+'g')); return m?m.length:0; }
function _has(re, s){ return re.test(s); }

/* ------------------------------------------------------------------
   The archetypes. `detect(ctx)` returns a raw score; the highest wins.
   ctx = { title, low, secTitles, sections, reqs, el, storyCount, ...counts }
   `tabs` is the ordered, curated lens for that type.
   ------------------------------------------------------------------ */
const DOC_TYPES = [
  {
    id:'requirements', name:'Requirements Specification', short:'BRD / SRS / FRD', icon:'📋',
    tabs:['overview','requirements','flow','scenarios','tests','trace','risks','gaps'],
    detect(c){
      let s=0;
      // Only count STRONG requirements (explicit ID or shall/must) — not every "will/should"
      // sentence, or a charter full of "the platform will…" reads as a spec.
      s += Math.min(c.strongReqs,40)*3;
      s += Math.min(c.modalCount,25)*3;                          // "shall/must" count (capped — not density)
      s += _hits(/\bFR[-\s]?\d|\bNFR[-\s]?\d|\bBR[-\s]?\d|\bINT[-\s]?\d/i, c.low)*3;
      s += _hits(/\b(functional|non[\s-]?functional)\s+requirements?\b/i, c.low)*5;
      if(c.secTitles.some(t=>/requirement/i.test(t))) s+=8;
      if(_has(/\b(business|software|functional|system)\s+requirements?\b|\b(brd|srs|frd|fsd)\b/i, c.title)) s+=55;
      // A document TITLED as a charter / plan / SOW is not a requirements spec.
      if(_has(/\b(charter|statement of work|business case|project plan|vision\s*(?:&|and)\s*scope)\b/i, c.title)) s-=50;
      if(c.el.personas.length && c.el.features.length && c.el.metrics.length) s-=35; // that pattern is a PRD, not a plain spec
      return s;
    }
  },
  {
    id:'prd', name:'Product Requirements Document', short:'PRD', icon:'🚀',
    tabs:['overview','objectives','personas','features','metrics','stories','requirements','tests','gaps'],
    detect(c){
      let s=0;
      if(_has(/\b(product requirements?|prd|product spec|mrd|market requirements)\b/i, c.title)) s+=50;
      s += Math.min(c.el.features.length,20)*3;
      s += Math.min(c.el.personas.length,10)*4;
      s += Math.min(c.el.metrics.length,15)*3;
      s += Math.min(c.storyCount,20)*1.6;
      if(c.el.personas.length && c.el.features.length) s+=18;    // product framing combo
      s += _hits(/\b(persona|success metric|kpi|target user|value proposition|go[\s-]?to[\s-]?market)\b/i, c.low)*2;
      return s;
    }
  },
  {
    id:'charter', name:'Project Charter / Plan', short:'Charter · SOW · Business Case', icon:'🗂️',
    tabs:['overview','objectives','scope','stakeholders','milestones','risks','metrics','actions','gaps'],
    detect(c){
      let s=0;
      if(_has(/\b(project charter|charter|statement of work|sow|business case|project plan|vision(?:\s*(?:&|and)\s*scope)?|scope statement)\b/i, c.title)) s+=60;
      s += Math.min(c.el.stakeholders.length,15)*2.6;
      s += Math.min(c.el.milestones.length,15)*2.6;
      s += Math.min(c.el.objectives.length,12)*1.6;
      if(c.el.scopeIn.length||c.el.scopeOut.length) s+=14;
      s += _hits(/\b(project sponsor|steering committee|out[\s-]?of[\s-]?scope|deliverable|budget|milestone|business case|success criteria)\b/i, c.low)*3;
      s -= Math.min(c.modalCount,12)*2;                           // charters are light on "shall"
      return s;
    }
  },
  {
    id:'agile', name:'Agile Backlog', short:'Stories · Epics', icon:'🃏',
    tabs:['overview','stories','features','tests','gaps'],
    detect(c){
      let s=0;
      s += Math.min(c.storyCount,60)*3.2;                        // the defining signal
      if(_has(/\b(backlog|user stories|epics?|sprint)\b/i, c.title)) s+=26;
      s += _hits(/\bacceptance criteria\b|\bgiven\b.*\bwhen\b.*\bthen\b/i, c.low)*2;
      s += _hits(/\bstory points?\b|\bsprint\s*\d|\(\d{1,2}\s*(?:points?|pts?)\)/i, c.low)*2;
      if(c.storyCount>=3 && c.reqs.length<=c.storyCount) s+=14;
      if(c.el.personas.length && c.el.features.length && c.el.metrics.length) s-=20; // that's a PRD
      return s;
    }
  },
  {
    id:'process', name:'Process / SOP', short:'SOP · Runbook · Notes', icon:'🔄',
    tabs:['overview','flow','stakeholders','actions','gaps'],
    detect(c){
      let s=0;
      if(_has(/\b(standard operating procedure|sop|process|procedure|runbook|workflow|work instruction|meeting (?:notes|minutes)|playbook)\b/i, c.title)) s+=30;
      s += Math.min(c.stepCount,25)*2.2;
      s += Math.min(c.el.actions.length,15)*2.4;
      s += _hits(/\bstep\s*\d|\bprocedure\b|\bworkflow\b|\baction item\b|\bnext steps?\b|\bminutes\b/i, c.low)*2.4;
      if(c.stepCount>=4 && c.reqs.length<4) s+=12;
      return s;
    }
  },
  {
    id:'generic', name:'General Business Document', short:'Auto', icon:'📄',
    tabs:['overview','requirements','flow','tests','gaps'],
    detect(){ return 12; }   // constant floor: wins only when nothing else scores
  }
];

const DOC_TYPE_BY_ID = Object.fromEntries(DOC_TYPES.map(t=>[t.id,t]));

/* Build the classification context, score every archetype, return ranked list. */
function classifyDocument(norm, lines, sections, reqs, el, steps){
  const low = norm.toLowerCase();
  const title = (lines.slice(0,25).map(l=>l.trim()).find(l=>l.length>6 && l.length<110) || '').toLowerCase();
  const secTitles = sections.map(s=>s.title);
  const modalCount = _hits(/\b(shall|must|is required to|are required to)\b/i, low);
  // "Strong" requirements = an authored ID, or a true obligation (shall/must) —
  // excludes narrative "will/should" sentences that a charter is full of.
  const strongReqs = reqs.filter(r=>!r.derived || /\b(shall|must|is required to|are required to)\b/i.test(r.text)).length;
  const words = Math.max(1, low.split(/\s+/).length);
  const ctx = {
    title, low, sections, secTitles, reqs, el,
    storyCount: el.stories.length,
    stepCount: steps.length,
    strongReqs,
    modalCount,                                  // absolute "shall/must" count
    modalDensity: (modalCount/words)*1000        // per-1000-words (kept for reference)
  };
  const ranked = DOC_TYPES.map(t=>({id:t.id, name:t.name, short:t.short, icon:t.icon, score: Math.max(0, Math.round(t.detect(ctx)))}))
                          .sort((a,b)=>b.score-a.score);
  const top=ranked[0], second=ranked[1];
  // Confidence = separation between the top two, normalized.
  const gap = top.score - (second?second.score:0);
  const confidence = Math.max(35, Math.min(99, Math.round(50 + (gap/Math.max(8,top.score))*60)));
  return { id:top.id, name:top.name, short:top.short, icon:top.icon, confidence, ranked };
}

/* The ordered tab list for a given type id (falls back to generic). */
function tabsForType(id){ return (DOC_TYPE_BY_ID[id]||DOC_TYPE_BY_ID.generic).tabs.slice(); }
