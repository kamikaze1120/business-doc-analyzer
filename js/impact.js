/* ============================================================
   CHANGE-IMPACT ENGINE (audit Phase 5/15).

   When any object changes, compute what it touches downstream — labelling
   each impacted object DIRECT (one hop) or INDIRECT (further), with the
   explanation path that made it impacted (e.g. "BR-011 changed →
   governs → FR-023 → validated_by → AC-007 → tested_by → TC-014").
   The traversal is a cycle-safe, de-duplicated BFS.

   DOCUMENT FRESHNESS is keyed off SOURCE VERSIONS: each generated
   document records the version of every source object it was built from,
   and is marked needs_review only when one of ITS sources' versions has
   actually advanced — an unrelated edit never flips it. Deterministic,
   DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  const DOC_STATUS = ['current','needs_review','outdated','draft','approved','archived'];
  function M(){ return root.Model; }

  // Cycle-safe, de-duplicated downstream BFS carrying distance + path.
  function traverse(projectId, objectId){
    const M0=M(); const seen=new Set([objectId]); const out=[]; const queue=[{id:objectId, dist:0, path:[]}];
    while(queue.length){ const cur=queue.shift();
      M0.relationshipsOf(projectId, cur.id).downstream.forEach(e=>{
        if(seen.has(e.to)) return; seen.add(e.to);
        const path=cur.path.concat([{from:cur.id, to:e.to, type:e.type}]);
        out.push({id:e.to, dist:cur.dist+1, path}); queue.push({id:e.to, dist:cur.dist+1, path});
      });
    }
    return out;
  }
  function downstreamClosure(projectId, objectId){ return traverse(projectId,objectId).map(x=>x.id); }

  function explain(projectId, changed, hop){
    const M0=M(); let s=(changed.displayId||changed.id)+' changed';
    hop.path.forEach(e=>{ const to=(M0.getObject(projectId,e.to)||{}); s+=' → '+e.type+' → '+(to.displayId||e.to); });
    return s;
  }

  function computeImpact(projectId, objectId){
    const M0=M(); const changed=M0.getObject(projectId,objectId);
    if(!changed) return {objectId, affected:[], byType:{}, documents:[], counts:{total:0,documents:0}};
    const rows=traverse(projectId,objectId).map(hop=>{ const o=M0.getObject(projectId,hop.id); if(!o) return null;
      return { id:o.id, type:o.type, displayId:o.displayId, title:o.title,
        impactType: hop.dist===1?'direct':'indirect', distance:hop.dist,
        path: hop.path.map(e=>({type:e.type, to:(M0.getObject(projectId,e.to)||{}).displayId})),
        reason: explain(projectId, changed, hop) }; }).filter(Boolean);
    const byType={}; rows.forEach(o=>byType[o.type]=(byType[o.type]||0)+1);
    const docs=documentsReferencing(projectId, [objectId].concat(rows.map(r=>r.id)));
    return { objectId, changed:changed.displayId, affected:rows, byType,
      documents: docs.map(d=>({id:d.id, title:d.title, status:(d.attrs&&d.attrs.docStatus)||'current'})),
      counts: Object.assign({ total:rows.length, direct:rows.filter(r=>r.impactType==='direct').length,
        indirect:rows.filter(r=>r.impactType==='indirect').length, documents:docs.length }, byType) };
  }

  function documentsReferencing(projectId, ids){
    const set=new Set(ids);
    return M().listObjects(projectId,'generated_document').filter(doc=>{
      const src=(doc.attrs&&doc.attrs.sourceObjectIds)||[]; return src.some(s=>set.has(s)); });
  }

  // Which of a document's sources have advanced past the version it was built from.
  function advancedSources(projectId, doc){
    const M0=M(); const src=(doc.attrs&&doc.attrs.sourceObjectIds)||[];
    const recorded=(doc.attrs&&doc.attrs.sourceVersions)||null; const out=[];
    src.forEach(sid=>{ const o=M0.getObject(projectId,sid); if(!o) return;
      if(recorded && recorded[sid]!=null){ if(o.version>recorded[sid]) out.push({id:sid, from:recorded[sid], to:o.version}); }
      else out.push({id:sid, from:null, to:o.version});   // no baseline recorded → treat as changed (back-compat)
    });
    return out;
  }

  // Mark documents whose OWN source versions advanced. With changedIds given,
  // only documents whose sources intersect the change are considered (perf);
  // with no changedIds, every document is re-checked by version.
  function markStaleDocuments(projectId, changedIds){
    const set=changedIds?new Set(changedIds):null;
    const docs=M().listObjects(projectId,'generated_document'); const marked=[];
    docs.forEach(d=>{ const cur=(d.attrs&&d.attrs.docStatus)||'current'; if(cur!=='current'&&cur!=='approved') return;
      const src=(d.attrs&&d.attrs.sourceObjectIds)||[];
      if(set && !src.some(s=>set.has(s))) return;            // unrelated edit → skip
      const adv=advancedSources(projectId, d);
      if(adv.length){ const attrs=Object.assign({},d.attrs,{docStatus:'needs_review', staleSince:new Date().toISOString(), staleSources:adv.map(a=>a.id)});
        M().updateObject(projectId, d.id, {attrs}, {force:true, changeReason:'source version advanced → needs review'}); marked.push(d.id); } });
    return marked;
  }
  function refreshFreshness(projectId){ return markStaleDocuments(projectId); }   // re-check all docs

  function applyChange(projectId, objectId, patch, opts){
    opts=opts||{}; const res=M().updateObject(projectId, objectId, patch, opts);
    if(res.blocked) return { blocked:true, reason:res.reason };
    const impact=computeImpact(projectId, objectId);
    const changedIds=[objectId].concat(impact.affected.map(a=>a.id));
    const stale=markStaleDocuments(projectId, changedIds);
    return { blocked:false, object:res.object, impact, staleDocuments:stale };
  }

  function setDocStatus(projectId, docId, status){
    if(DOC_STATUS.indexOf(status)<0) throw new Error('bad doc status: '+status);
    const d=M().getObject(projectId,docId); if(!d||d.type!=='generated_document') throw new Error('not a document');
    const attrs=Object.assign({},d.attrs,{docStatus:status}); if(status==='current'){ attrs.staleSince=null; attrs.staleSources=null; }
    M().updateObject(projectId, docId, {attrs}, {force:true, changeReason:'doc status → '+status});
    return M().getObject(projectId,docId);
  }
  function documentFreshness(projectId){
    const docs=M().listObjects(projectId,'generated_document');
    const byStatus={}; docs.forEach(d=>{ const s=(d.attrs&&d.attrs.docStatus)||'current'; byStatus[s]=(byStatus[s]||0)+1; });
    return { total:docs.length, byStatus,
      needsReview: docs.filter(d=>(d.attrs&&d.attrs.docStatus)==='needs_review').map(d=>({id:d.id, title:d.title, staleSources:(d.attrs&&d.attrs.staleSources)||[]})) };
  }

  const Impact = { computeImpact, markStaleDocuments, refreshFreshness, applyChange, setDocStatus,
    documentFreshness, downstreamClosure, advancedSources, DOC_STATUS };
  root.Impact = Impact;
  if(typeof module!=='undefined' && module.exports) module.exports = Impact;
})(typeof globalThis!=='undefined' ? globalThis : this);
