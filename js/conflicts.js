/* ============================================================
   CONFLICT & DUPLICATE ENGINE (Phase 7).

   Detects contradictions, duplicate rules, and conflicting thresholds
   across the Project Truth Model. It NEVER silently resolves a conflict
   (critical rule 5) — it records the conflict, links the sources, and
   recommends an action; resolution is an explicit, stakeholder-driven
   lifecycle: detected → under_review → resolution_proposed → approved
   → resolved. Deterministic and DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  const CONSIDER = ['functional_requirement','non_functional_requirement','integration_requirement',
    'business_requirement','business_rule','decision'];
  const ROLE = /\b(manager|director|vice president|vp|finance|cfo|ceo|coo|supervisor|approver|board|steering committee|committee|department head|owner|administrator)\b/ig;
  const NEG = /\b(not|no|never|cannot|can't|without|isn't|aren't|shouldn't|won't|prohibited|forbidden|disallow)\b/i;
  const DATE = /\b(\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,?\s*\d{4})?|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|Q[1-4]\s*'?\d{2,4})\b/ig;
  const CONFLICT_LIFECYCLE = ['detected','under_review','resolution_proposed','approved','resolved','dismissed'];
  function dates(t){ const out=[]; let m; DATE.lastIndex=0; while((m=DATE.exec(t))) out.push(m[0].toLowerCase().replace(/\s+/g,' ').trim()); return out; }

  function M(){ return root.Model; }
  function txt(o){ return (o.description||o.title||'').trim(); }
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim(); }
  function toks(s){ return new Set(norm(s).split(' ').filter(w=>w.length>2)); }
  function jaccard(a,b){ const A=toks(a),B=toks(b); if(!A.size||!B.size) return 0; let i=0; A.forEach(t=>{if(B.has(t))i++;}); return i/(A.size+B.size-i); }
  function roles(t){ const set=new Set(); let m; ROLE.lastIndex=0; while((m=ROLE.exec(t))) set.add(m[0].toLowerCase().replace('vice president','vp')); return [...set]; }
  function thresholds(t){ const out=[]; const re=/(?:\$\s?)?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|million|%|percent|days?|hours?|users?)?/ig; let m;
    while((m=re.exec(t))){ let v=parseFloat(m[1].replace(/,/g,'')); const u=(m[2]||'').toLowerCase();
      if(u==='k'||u==='thousand') v*=1e3; if(u==='m'||u==='million') v*=1e6; out.push({value:v, unit:u||''}); } return out; }
  function disjoint(a,b){ return a.length && b.length && !a.some(x=>b.includes(x)); }

  function detectConflicts(projectId){
    const model=M(); if(!model||!model.getProject(projectId)) return {items:[],summary:{total:0}};
    const objs = model.listObjects(projectId).filter(o=>CONSIDER.includes(o.type));
    const items=[]; let seq=0;
    const add=(kind,sev,topic,sources,recommendation,detail)=>items.push({
      id:'cf'+(++seq), kind, severity:sev, topic, sources:sources.map(o=>o.id),
      sourceDisplay:sources.map(o=>o.displayId), statements:sources.map(o=>txt(o)),
      status:'detected', recommendation, detail:detail||null });

    // group approval-topic objects
    const approval=objs.filter(o=>/approv/i.test(txt(o)));
    for(let i=0;i<approval.length;i++) for(let j=i+1;j<approval.length;j++){
      const A=approval[i],B=approval[j], ta=txt(A),tb=txt(B), ra=roles(ta),rb=roles(tb);
      if(disjoint(ra,rb)) add('approver','high','Approval authority',[A,B],
        'Request a stakeholder decision on who approves — the sources name different roles.',
        `${ra.join('/')} vs ${rb.join('/')}`);
      else{
        const xa=thresholds(ta),xb=thresholds(tb);
        if(xa.length&&xb.length && xa[0].value!==xb[0].value) add('threshold','high','Approval threshold',[A,B],
          'Reconcile the differing approval thresholds with the accountable stakeholder.',
          `${xa[0].value}${xa[0].unit} vs ${xb[0].value}${xb[0].unit}`);
        else if(NEG.test(ta)!==NEG.test(tb) && jaccard(ta,tb)>=0.35) add('contradiction','high','Approval requirement',[A,B],
          'One source requires approval and another waives it — confirm the correct rule.',null);
      }
    }
    // general contradiction + duplicate across requirements/rules
    for(let i=0;i<objs.length;i++) for(let j=i+1;j<objs.length;j++){
      const A=objs[i],B=objs[j]; if(A.type!==B.type && !(A.type==='business_rule'||B.type==='business_rule')) continue;
      const ta=txt(A),tb=txt(B), sim=jaccard(ta,tb);
      if(sim>=0.82 && NEG.test(ta)===NEG.test(tb)){
        // avoid double-counting an approval pair already flagged
        if(!items.some(it=>it.sources.includes(A.id)&&it.sources.includes(B.id)))
          add('duplicate','medium','Duplicate requirement',[A,B],
            'Merge the duplicates into one, or keep both only if they are genuinely distinct.', `similarity ${Math.round(sim*100)}%`);
      } else if(sim>=0.5 && NEG.test(ta)!==NEG.test(tb)){
        if(!items.some(it=>it.sources.includes(A.id)&&it.sources.includes(B.id)))
          add('contradiction','high','Contradiction',[A,B],
            'These appear to contradict (one negates the other) — request clarification.', `similarity ${Math.round(sim*100)}%`);
      }
      // On same-topic objects, surface concrete divergences deterministically.
      if(sim>=0.6){
        // priority conflict
        if(A.priority && B.priority && A.priority!==B.priority)
          add('priority','medium','Priority conflict',[A,B],'Agree a single priority for this requirement.',`${A.priority} vs ${B.priority}`);
        // status conflict (only when semantically opposed: approved vs rejected/deprecated)
        const opp=(a,b)=> (a==='approved'&&(b==='rejected'||b==='deprecated'))||(b==='approved'&&(a==='rejected'||a==='deprecated'))||(a==='approved'&&b==='approved'?false:(a==='rejected'&&b==='approved'));
        if(A.status && B.status && A.status!==B.status && (opp(A.status,B.status)||opp(B.status,A.status)))
          add('status','medium','Status conflict',[A,B],'Reconcile the conflicting lifecycle states.',`${A.status} vs ${B.status}`);
        // date / timeline conflict
        const da=dates(ta), dbb=dates(tb);
        if(da.length && dbb.length && da[0]!==dbb[0] && !da.some(x=>dbb.includes(x)))
          add('date','medium','Timeline conflict',[A,B],'Confirm the correct date/deadline with the accountable stakeholder.',`${da[0]} vs ${dbb[0]}`);
      }
    }
    const bySev={high:0,medium:0,low:0}; items.forEach(x=>bySev[x.severity]=(bySev[x.severity]||0)+1);
    return { items, summary:{ total:items.length, byKind:count(items,'kind'), bySeverity:bySev } };
  }
  function count(arr,k){ const o={}; arr.forEach(x=>o[x[k]]=(o[x[k]]||0)+1); return o; }

  // Persist detected conflicts as first-class objects (idempotent by signature),
  // linking the conflicting sources with a conflicts_with relationship.
  function recordConflicts(projectId){
    const model=M(); const det=detectConflicts(projectId); const existing=model.listObjects(projectId,'conflict');
    const sig=c=>c.kind+':'+[...c.sources].sort().join('|');
    const have=new Set(existing.map(o=>o.attrs&&o.attrs.signature).filter(Boolean));
    let created=0;
    det.items.forEach(c=>{ const s=sig(c); if(have.has(s)) return;
      const o=model.addObject(projectId,'conflict',{ title:c.topic, description:c.statements.join('  ⇄  '),
        createdBy:'system', provenance:'conflict',
        attrs:{ signature:s, kind:c.kind, conflictStatus:'detected', recommendation:c.recommendation, detail:c.detail, sources:c.sources } });
      c.sources.forEach(fromId=>{ try{ model.addRelationship(projectId, o.id, fromId, 'conflicts_with'); }catch(e){} });
      created++; });
    return { created, total:det.items.length };
  }

  function setConflictStatus(projectId, conflictId, status, by, reason){
    if(CONFLICT_LIFECYCLE.indexOf(status)<0) throw new Error('bad conflict status: '+status);
    // Dismissing a conflict must be justified and never destroys the evidence.
    if(status==='dismissed' && !(reason && String(reason).trim())) throw new Error('dismissing a conflict requires a reason');
    const o=M().getObject(projectId,conflictId); if(!o||o.type!=='conflict') throw new Error('not a conflict');
    // Persist through updateObject so the change survives (the store returns a
    // fresh parse per call — mutating a read-back object would be lost).
    const attrs=Object.assign({}, o.attrs, {conflictStatus:status}); if(by) attrs.resolvedBy=by;
    if(status==='dismissed'){ attrs.dismissReason=String(reason).trim(); attrs.dismissedBy=by||null; }
    M().updateObject(projectId, conflictId, {attrs}, {force:true, changeReason:'conflict '+status+(status==='dismissed'?' — '+attrs.dismissReason:'')});
    // Resolved/dismissed conflicts leave the active board (archived) but their
    // sources, evidence, and conflicts_with links are all preserved.
    if(status==='resolved'||status==='dismissed') M().setStatus(projectId, conflictId, 'archived', by);
    return M().getObject(projectId,conflictId);
  }

  const Conflicts = { detectConflicts, recordConflicts, setConflictStatus, CONFLICT_LIFECYCLE, jaccard };
  root.Conflicts = Conflicts;
  if(typeof module!=='undefined' && module.exports) module.exports = Conflicts;
})(typeof globalThis!=='undefined' ? globalThis : this);
