/* ============================================================
   TRACEABILITY COVERAGE (audit Phase 5) — objective → requirement →
   acceptance criteria → test.

   Reports per-hop coverage and full-chain coverage over the Truth Model,
   using inverse-aware traversal for the objective↔requirement hop so it is
   not fooled by stored edge direction. Deterministic, DOM-free; surfaced
   on the Analyst OS dashboard.
   ============================================================ */
;(function(root){
  'use strict';
  const REQ = ['functional_requirement','non_functional_requirement','integration_requirement',
    'business_requirement','data_requirement','reporting_requirement'];
  function M(){ return root.Model; }
  function pct(n,d){ return d? Math.round(n/d*100):0; }
  function down(projectId,id,type){ return M().relationshipsOf(projectId,id).downstream.filter(e=>e.type===type).map(e=>e.to); }
  function reqsForObjective(projectId, objId){
    if(root.Relationships) return root.Relationships.requirementsForObjective(projectId, objId).map(o=>o.id);
    const p=M().getProject(projectId); const out=[];
    (p&&p.relationships||[]).forEach(r=>{ if(r.type!=='implements') return; const other=r.from===objId?r.to:(r.to===objId?r.from:null);
      if(other){ const o=p.objects[other]; if(o&&REQ.indexOf(o.type)>=0) out.push(o.id); } });
    return out;
  }

  function coverage(projectId){ const m=M(); return (m&&m.memo)? m.memo(projectId,'trace',()=>_coverage(projectId)) : _coverage(projectId); }
  function _coverage(projectId){
    const model=M(); if(!model||!model.getProject(projectId)) return null;
    const objs=model.listObjects(projectId);
    const objectives=objs.filter(o=>o.type==='business_objective');
    const reqs=objs.filter(o=>REQ.includes(o.type));
    const acs=objs.filter(o=>o.type==='acceptance_criteria');

    const reqHasAC = r => down(projectId,r.id,'validated_by').some(id=>{ const o=model.getObject(projectId,id); return o&&o.type==='acceptance_criteria'; });
    const reqHasTest = r => M().relationshipsOf(projectId,r.id).downstream.some(e=>e.type==='tested_by');
    const acHasTest = a => down(projectId,a.id,'tested_by').length>0;

    // full chain: objective -> requirement -> AC -> test, all present
    const objectiveHasFullChain = ob => reqsForObjective(projectId,ob.id).some(rid=>{
      const acIds=down(projectId,rid,'validated_by').filter(id=>{ const o=model.getObject(projectId,id); return o&&o.type==='acceptance_criteria'; });
      return acIds.some(acid=>down(projectId,acid,'tested_by').length>0);
    });

    const objWithReq = objectives.filter(o=>reqsForObjective(projectId,o.id).length>0).length;
    const reqWithAC = reqs.filter(reqHasAC).length;
    const reqWithTest = reqs.filter(reqHasTest).length;
    const acWithTest = acs.filter(acHasTest).length;
    const fullChains = objectives.filter(objectiveHasFullChain).length;

    return {
      hops: {
        objective_to_requirement: { covered:objWithReq, total:objectives.length, pct:pct(objWithReq,objectives.length) },
        requirement_to_acceptance:{ covered:reqWithAC, total:reqs.length, pct:pct(reqWithAC,reqs.length) },
        requirement_to_test:      { covered:reqWithTest, total:reqs.length, pct:pct(reqWithTest,reqs.length) },
        acceptance_to_test:       { covered:acWithTest, total:acs.length, pct:pct(acWithTest,acs.length) }
      },
      fullChain: { covered:fullChains, total:objectives.length, pct:pct(fullChains,objectives.length) }
    };
  }

  const Traceability = { coverage };
  root.Traceability = Traceability;
  if(typeof module!=='undefined' && module.exports) module.exports = Traceability;
})(typeof globalThis!=='undefined' ? globalThis : this);
