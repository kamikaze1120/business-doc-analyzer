/* ============================================================
   GAP DETECTION ENGINE (Phase 6) — multi-layer, over the Truth Model.

     Layer 1  Structural   — missing ids/owners/priorities, orphans,
                             requirements with no test, duplicate display ids.
     Layer 2  Semantic      — requirement quality (delegates to the
                             Requirement Intelligence Engine; AI optional).
     Layer 3  Cross-artifact— objective→requirement→AC→test coverage,
                             system→integration, process-step→actor.

   Deterministic and DOM-free. Every gap is actionable: it names the
   object, the layer, a severity, and a recommendation.
   ============================================================ */
;(function(root){
  'use strict';
  const REQ = ['functional_requirement','non_functional_requirement','integration_requirement',
    'business_requirement','data_requirement','reporting_requirement'];

  function M(){ return root.Model; }
  function rels(projectId, id){ return M().relationshipsOf(projectId, id); }
  function hasEdge(projectId, id, type, dir){ const r=rels(projectId,id);
    const set = dir==='up'?r.upstream : dir==='down'?r.downstream : r.upstream.concat(r.downstream);
    return set.some(e=>e.type===type); }

  function detectGaps(projectId){
    const model=M(); if(!model || !model.getProject(projectId)) return {structural:[],semantic:[],crossArtifact:[],summary:{total:0}};
    const objs = model.listObjects(projectId);
    const by = t => objs.filter(o=>o.type===t);
    const structural=[], semantic=[], crossArtifact=[];
    let seq=0; const g=(bucket,sev,type,message,objectId,rec)=>bucket.push({id:'gap'+(++seq),layer:bucket===structural?'structural':bucket===semantic?'semantic':'cross-artifact',severity:sev,type,message,objectId:objectId||null,recommendation:rec});

    /* ---- Layer 1: structural ---- */
    const seenDisplay={};
    objs.forEach(o=>{ if(o.displayId){ if(seenDisplay[o.displayId]) g(structural,'high','duplicate_display_id',`Duplicate display id ${o.displayId}`,o.id,'Regenerate display ids so each is unique.'); else seenDisplay[o.displayId]=o.id; } });

    const requirements = objs.filter(o=>REQ.includes(o.type));
    requirements.forEach(o=>{
      const r=rels(projectId,o.id);
      if(r.upstream.length===0 && r.downstream.length===0) g(structural,'medium','orphan_requirement',`${o.displayId} is orphaned — not linked to any objective, rule, or test`,o.id,'Link it to a business objective and add test coverage.');
      if(!hasEdge(projectId,o.id,'tested_by','down')) g(structural,'high','no_test_coverage',`${o.displayId} has no test coverage`,o.id,'Generate at least one test case that verifies it.');
      if(!o.priority) g(structural,'low','missing_priority',`${o.displayId} has no priority`,o.id,'Assign a priority (High/Medium/Low).');
      if((o.evidence||[]).length===0) g(structural,'medium','no_source',`${o.displayId} has no recorded source`,o.id,'Attach evidence (which document/statement it came from).');
    });

    // tests with no requirement; acceptance criteria coverage
    by('test_case').forEach(t=>{ const r=rels(projectId,t.id);
      if(!r.upstream.some(e=>e.type==='tested_by')) g(structural,'medium','test_without_requirement',`${t.displayId} is not linked to any requirement`,t.id,'Link the test to the requirement it verifies, or remove it.'); });
    by('acceptance_criteria').forEach(ac=>{ if(!hasEdge(projectId,ac.id,'tested_by','down')) g(structural,'medium','ac_without_test',`${ac.displayId} has no test`,ac.id,'Add a test case for this acceptance criterion.'); });

    /* ---- Layer 3: cross-artifact coverage ---- */
    by('business_objective').forEach(ob=>{ const r=rels(projectId,ob.id);
      const supported = r.downstream.some(e=>{ const to=model.getObject(projectId,e.to); return to && REQ.includes(to.type); });
      if(!supported) g(crossArtifact,'high','objective_without_requirement',`Objective "${trim(ob.title)}" has no supporting requirements`,ob.id,'Add or link the requirements that deliver this objective.'); });

    requirements.forEach(o=>{ if(!hasEdge(projectId,o.id,'validated_by','down') && !hasEdge(projectId,o.id,'satisfies','up')){
      // requirement with no acceptance criteria / scenario validation
      g(crossArtifact,'low','requirement_without_acceptance',`${o.displayId} has no acceptance criteria / validating scenario`,o.id,'Define acceptance criteria so it can be objectively accepted.'); } });

    by('system').forEach(s=>{ const r=rels(projectId,s.id);
      const integ = r.upstream.concat(r.downstream).some(e=>{ const other=model.getObject(projectId,e.from===s.id?e.to:e.from); return other && (other.type==='integration'||other.type==='integration_requirement'||other.type==='api'); });
      if(!integ) g(crossArtifact,'low','system_without_integration',`System "${trim(s.title)}" is referenced but has no integration definition`,s.id,'Define how this system integrates (interface/API/failure handling).'); });

    by('process_step').forEach(st=>{ if(!(st.attrs&&st.attrs.actor) && !hasEdge(projectId,st.id,'owns','up')) g(crossArtifact,'medium','step_without_actor',`Process step "${trim(st.title)}" has no responsible actor`,st.id,'Assign the actor/role that performs this step.'); });

    /* ---- Layer 2: semantic (requirement quality) ---- */
    if(root.Intelligence){
      const q=root.Intelligence.assessProject(projectId);
      q.items.forEach(it=>{
        if(!it.testable) g(semantic,'high','not_testable',`${it.displayId} is not testable as written`,it.id, it.remediation[0]||'Restate with a concrete, observable action.');
        else if(it.vague) g(semantic,'medium','ambiguous',`${it.displayId} contains vague language`,it.id, it.remediation[0]||'Replace vague terms with measurable criteria.');
        else if(it.scores.overall<60) g(semantic,'low','low_quality',`${it.displayId} scores low on quality (${it.scores.overall})`,it.id,'Tighten clarity, completeness, and measurability.');
      });
    }

    const all=structural.concat(semantic,crossArtifact);
    const bySev={high:0,medium:0,low:0}; all.forEach(x=>bySev[x.severity]=(bySev[x.severity]||0)+1);
    return { structural, semantic, crossArtifact, all,
      summary:{ total:all.length, structural:structural.length, semantic:semantic.length, crossArtifact:crossArtifact.length, bySeverity:bySev } };
  }
  function trim(s){ s=String(s||''); return s.length>50?s.slice(0,47)+'…':s; }

  const Gaps = { detectGaps };
  root.Gaps = Gaps;
  if(typeof module!=='undefined' && module.exports) module.exports = Gaps;
})(typeof globalThis!=='undefined' ? globalThis : this);
