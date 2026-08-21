/* ============================================================
   DUPLICATE DETECTION (audit Phase 9) — layered, never auto-merges.

     Layer 1  Exact identity      — identical normalized text (confidence 1.0)
     Layer 2  Strong similarity   — token/Jaccard >= 0.82  (confidence = score)
     Layer 3  Possible similarity — 0.6 <= Jaccard < 0.82   (review)

   Each candidate carries its layer, similarity, a confidence, a reason, and a
   RECOMMENDED ACTION — but nothing is merged automatically. merge() exists as
   an explicit, provenance-recording user action that redirects relationships
   and evidence from the dropped object to the kept one. DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  // Types worth comparing for duplication (skip documents/conflicts/questions).
  const TYPES = ['functional_requirement','non_functional_requirement','integration_requirement',
    'business_requirement','data_requirement','reporting_requirement','business_rule',
    'business_objective','acceptance_criteria','test_case','system','stakeholder','risk'];
  function M(){ return root.Model; }
  function txt(o){ return (o.description||o.title||'').trim(); }
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim(); }
  function toks(s){ return new Set(norm(s).split(' ').filter(w=>w.length>2)); }
  function jaccard(a,b){ const A=toks(a),B=toks(b); if(!A.size||!B.size) return 0; let i=0; A.forEach(t=>{if(B.has(t))i++;}); return i/(A.size+B.size-i); }

  function classify(a,b){
    if(norm(a)===norm(b)) return {layer:1, similarity:1, confidence:1, recommendation:'Merge — exact duplicate', reason:'Identical normalized text'};
    const s=jaccard(a,b);
    if(s>=0.82) return {layer:2, similarity:s, confidence:+s.toFixed(2), recommendation:'Review for merge', reason:`High token overlap (${Math.round(s*100)}%)`};
    if(s>=0.6)  return {layer:3, similarity:s, confidence:+s.toFixed(2), recommendation:'Possible duplicate — review', reason:`Moderate token overlap (${Math.round(s*100)}%)`};
    return null;
  }

  function detect(projectId){ const m=M(); return (m&&m.memo)? m.memo(projectId,'dupes',()=>_detect(projectId)) : _detect(projectId); }
  function _detect(projectId){
    const model=M(); if(!model||!model.getProject(projectId)) return {candidates:[]};
    const objs=model.listObjects(projectId).filter(o=>TYPES.indexOf(o.type)>=0);
    const candidates=[];
    for(let i=0;i<objs.length;i++) for(let j=i+1;j<objs.length;j++){
      const A=objs[i], B=objs[j]; if(A.type!==B.type) continue;   // same-type only (conservative)
      const c=classify(txt(A),txt(B)); if(!c) continue;
      candidates.push(Object.assign({ a:{id:A.id,displayId:A.displayId,title:A.title},
        b:{id:B.id,displayId:B.displayId,title:B.title}, type:A.type }, c));
    }
    candidates.sort((x,y)=>y.similarity-x.similarity);
    return { candidates, summary:{ total:candidates.length, exact:candidates.filter(c=>c.layer===1).length,
      strong:candidates.filter(c=>c.layer===2).length, possible:candidates.filter(c=>c.layer===3).length } };
  }

  // Explicit merge (user action). Redirects the dropped object's relationships
  // and evidence onto the kept object, records provenance, then deletes the drop.
  function merge(projectId, keepId, dropId, by){
    const model=M(); const keep=model.getObject(projectId,keepId), drop=model.getObject(projectId,dropId);
    if(!keep||!drop) return {merged:false, error:'both objects must exist'};
    if(keepId===dropId) return {merged:false, error:'cannot merge an object with itself'};
    const p=model.getProject(projectId);
    (p.relationships||[]).filter(r=>r.from===dropId||r.to===dropId).forEach(r=>{
      const from=r.from===dropId?keepId:r.from, to=r.to===dropId?keepId:r.to;
      try{ model.addRelationship(projectId, from, to, r.type); }catch(e){}
    });
    (drop.evidence||[]).forEach(e=>{ try{ model.addEvidence(projectId, keepId, e); }catch(_){} });
    model.addEvidence(projectId, keepId, {sourceType:'merge', extractionMethod:'user',
      originalText:'Merged from '+(drop.displayId||dropId), speaker:by||'user'});
    model.deleteObject(projectId, dropId);
    return {merged:true, keptId:keepId, droppedId:dropId};
  }

  const Duplicates = { detect, merge, classify, jaccard, TYPES };
  root.Duplicates = Duplicates;
  if(typeof module!=='undefined' && module.exports) module.exports = Duplicates;
})(typeof globalThis!=='undefined' ? globalThis : this);
