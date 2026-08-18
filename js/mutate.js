/* ============================================================
   MUTATION FACADE (Milestone 2 / audit Phase 4).

   A single, consistent path for changing Project Truth Model data so a
   change reliably flows through: validation + approved-guard (Model) →
   version/history (Model) → change-impact + document freshness (Impact)
   → project-health delta (Health) → a STRUCTURED result the caller can
   surface. It intentionally reuses the existing engines rather than
   re-implementing them, and degrades gracefully (falls back to a plain
   Model update) when Impact/Health are not loaded, so Node tests and
   minimal loads still work. DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  function M(){ return root.Model; }
  function readiness(projectId, on){ return (on && root.Health) ? (root.Health.score(projectId)||{}).readiness : null; }

  // Update an object and cascade. Returns {blocked} or a structured change result.
  function updateObject(projectId, id, patch, opts){
    opts=opts||{}; const before=M().getObject(projectId,id);
    const hBefore=readiness(projectId, opts.health!==false);
    let res;
    if(root.Impact) res=root.Impact.applyChange(projectId, id, patch, opts);
    else { const r=M().updateObject(projectId,id,patch,opts);
      res = r.blocked ? r : {blocked:false, object:r.object, impact:{affected:[],documents:[]}, staleDocuments:[]}; }
    if(res.blocked) return {blocked:true, reason:res.reason, object:before};
    const hAfter=readiness(projectId, opts.health!==false);
    return {
      blocked:false, object:res.object,
      version:{ from: before?before.version:null, to: res.object.version },
      affected: (res.impact&&res.impact.affected)||[],
      documents: (res.impact&&res.impact.documents)||[],
      staleDocuments: res.staleDocuments||[],
      health: (hBefore!=null||hAfter!=null) ? {from:hBefore, to:hAfter} : null
    };
  }

  function setStatus(projectId, id, status, by, opts){
    opts=opts||{}; const hBefore=readiness(projectId, opts.health!==false);
    const o=M().setStatus(projectId, id, status, by);
    const impact = root.Impact ? root.Impact.computeImpact(projectId, id) : {affected:[],documents:[]};
    const hAfter=readiness(projectId, opts.health!==false);
    return { object:o, status, affected:impact.affected||[], documents:impact.documents||[],
      health:(hBefore!=null||hAfter!=null)?{from:hBefore,to:hAfter}:null };
  }

  function create(projectId, type, props){
    const o=M().addObject(projectId, type, props);
    return { object:o, created:true };
  }

  // Delete with dependent awareness: capture impact + mark referencing docs stale first.
  function remove(projectId, id){
    const impact = root.Impact ? root.Impact.computeImpact(projectId, id) : {affected:[],documents:[]};
    const stale = root.Impact ? root.Impact.markStaleDocuments(projectId, [id].concat((impact.affected||[]).map(a=>a.id))) : [];
    M().deleteObject(projectId, id);
    return { deleted:true, affected:impact.affected||[], staleDocuments:stale };
  }

  const Mutate = { updateObject, setStatus, create, remove };
  root.Mutate = Mutate;
  if(typeof module!=='undefined' && module.exports) module.exports = Mutate;
})(typeof globalThis!=='undefined' ? globalThis : this);
