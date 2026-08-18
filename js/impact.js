/* ============================================================
   CHANGE-IMPACT ENGINE (Phase 9).

   When any object changes, compute what it touches downstream — the
   acceptance criteria, tests, scenarios, process steps, integrations,
   and generated documents that depend on it — so nothing silently goes
   stale (critical rule 6). Generated documents whose sources change are
   marked "needs_review". Deterministic and DOM-free.

   Document freshness lifecycle (attrs.docStatus):
     current → needs_review → outdated → (regenerated) current
     plus draft / approved / archived.
   ============================================================ */
;(function(root){
  'use strict';
  const DOC_STATUS = ['current','needs_review','outdated','draft','approved','archived'];
  function M(){ return root.Model; }

  // Transitive downstream closure over from→to relationships.
  function downstreamClosure(projectId, objectId){
    const M0=M(); const seen=new Set(); const order=[]; const queue=[objectId];
    while(queue.length){ const id=queue.shift();
      M0.relationshipsOf(projectId, id).downstream.forEach(e=>{ if(!seen.has(e.to)){ seen.add(e.to); order.push(e.to); queue.push(e.to); } });
    }
    return order;
  }

  // Generated documents that reference an object (directly by source list).
  function documentsReferencing(projectId, ids){
    const set=new Set(ids);
    return M().listObjects(projectId,'generated_document').filter(doc=>{
      const src=(doc.attrs&&doc.attrs.sourceObjectIds)||[];
      return src.some(s=>set.has(s));
    });
  }

  function computeImpact(projectId, objectId){
    const M0=M(); if(!M0.getObject(projectId,objectId)) return {objectId, affected:[], byType:{}, documents:[], counts:{}};
    const ids=downstreamClosure(projectId, objectId);
    const affected=ids.map(id=>M0.getObject(projectId,id)).filter(Boolean);
    const byType={}; affected.forEach(o=>byType[o.type]=(byType[o.type]||0)+1);
    const docs=documentsReferencing(projectId, [objectId].concat(ids));
    return {
      objectId, changed:M0.getObject(projectId,objectId).displayId,
      affected: affected.map(o=>({id:o.id, type:o.type, displayId:o.displayId, title:o.title})),
      byType, documents: docs.map(d=>({id:d.id, title:d.title, status:(d.attrs&&d.attrs.docStatus)||'current'})),
      counts: Object.assign({total:affected.length, documents:docs.length}, byType)
    };
  }

  // Mark all generated documents that depend on any changed object as stale.
  function markStaleDocuments(projectId, changedIds){
    const docs=documentsReferencing(projectId, changedIds); const marked=[];
    docs.forEach(d=>{ const cur=(d.attrs&&d.attrs.docStatus)||'current';
      if(cur==='current'||cur==='approved'){ const attrs=Object.assign({},d.attrs,{docStatus:'needs_review', staleSince:new Date().toISOString()});
        M().updateObject(projectId, d.id, {attrs}, {force:true, changeReason:'source changed → needs review'}); marked.push(d.id); } });
    return marked;
  }

  // Update an object and cascade freshness in one call.
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
    const attrs=Object.assign({},d.attrs,{docStatus:status}); if(status==='current') attrs.staleSince=null;
    M().updateObject(projectId, docId, {attrs}, {force:true, changeReason:'doc status → '+status});
    return M().getObject(projectId,docId);
  }
  function documentFreshness(projectId){
    const docs=M().listObjects(projectId,'generated_document');
    const byStatus={}; docs.forEach(d=>{ const s=(d.attrs&&d.attrs.docStatus)||'current'; byStatus[s]=(byStatus[s]||0)+1; });
    return { total:docs.length, byStatus,
      needsReview: docs.filter(d=>(d.attrs&&d.attrs.docStatus)==='needs_review').map(d=>({id:d.id,title:d.title})) };
  }

  const Impact = { computeImpact, markStaleDocuments, applyChange, setDocStatus, documentFreshness, downstreamClosure, DOC_STATUS };
  root.Impact = Impact;
  if(typeof module!=='undefined' && module.exports) module.exports = Impact;
})(typeof globalThis!=='undefined' ? globalThis : this);
