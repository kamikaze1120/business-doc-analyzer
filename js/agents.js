/* ============================================================
   SPECIALIZED AGENTS (Phase 12).

   A small set of focused services that all operate on the ONE Project
   Truth Model — never uncontrolled autonomous agents, and never a
   parallel store. Every object an agent proposes is created with
   status 'ai_proposed' and provenance 'ai_inference', so a human must
   Accept / Edit / Reject it; agents never overwrite approved content
   (the model's guard enforces this). Deterministic core; the AI layer
   can enrich when present. DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  function M(){ return root.Model; }
  const SYS = /\b(salesforce|sap|oracle|workday|servicenow|sharepoint|mulesoft|laserfiche|active directory|azure ad|okta|docusign|power ?bi|tableau|snowflake|stripe|twilio|jira|dynamics)\b/ig;
  const ROLE = /\b(manager|director|administrator|approver|analyst|finance|hr|it|customer|vendor|supplier|employee|supervisor|owner|sponsor)\b/ig;
  const REQ=['functional_requirement','non_functional_requirement','integration_requirement','business_requirement'];

  function uniqCI(arr){ const seen=new Set(),out=[]; arr.forEach(x=>{ const k=x.toLowerCase(); if(!seen.has(k)){seen.add(k);out.push(x);} }); return out; }
  function propose(projectId, type, props){ return M().addObject(projectId, type, Object.assign({createdBy:'ai', provenance:'ai_inference', status:'ai_proposed'}, props)); }

  /* Discovery — from a free-text problem statement, extract candidate
     objectives, stakeholders, systems, and risks. Conservative on purpose. */
  function discovery(projectId, statement){
    const created=[]; const s=String(statement||'').trim(); if(!s) return {created};
    // one objective = the stated goal
    created.push(propose(projectId,'business_objective',{title:s.slice(0,80), description:s}));
    // systems
    uniqCI((s.match(SYS)||[]).map(x=>x.replace(/\b\w/g,c=>c.toUpperCase()))).forEach(sys=>created.push(propose(projectId,'system',{title:sys})));
    // stakeholders (roles named)
    uniqCI((s.match(ROLE)||[]).map(x=>x.replace(/\b\w/g,c=>c.toUpperCase()))).forEach(r=>created.push(propose(projectId,'stakeholder',{title:r})));
    // an obvious risk cue
    if(/\b(risk|delay|latency|manual|error|compliance|security)\b/i.test(s)) created.push(propose(projectId,'risk',{title:'Delivery/quality risk implied by the problem statement'}));
    return { created:created.map(o=>({id:o.id,type:o.type,displayId:o.displayId,title:o.title})) };
  }

  /* Requirements agent — for each objective with no supporting requirement,
     propose one functional requirement and link it (implements). */
  function requirements(projectId){
    const created=[];
    M().listObjects(projectId,'business_objective').forEach(ob=>{
      const has=M().relationshipsOf(projectId,ob.id).downstream.some(e=>{ const to=M().getObject(projectId,e.to); return to&&REQ.includes(to.type); });
      if(!has){ const fr=propose(projectId,'functional_requirement',{title:('Support: '+ob.title).slice(0,80),
        description:'The system shall support "'+ob.title+'".', priority:'Medium'});
        M().addRelationship(projectId, fr.id, ob.id, 'implements'); created.push(fr.id); }
    });
    return { created:created.length };
  }

  /* Test designer — for each requirement without a test, propose an
     acceptance criterion and a test case, wired for traceability. */
  function testDesigner(projectId){
    let ac=0, tc=0;
    M().listObjects(projectId).filter(o=>REQ.includes(o.type)).forEach(r=>{
      const down=M().relationshipsOf(projectId,r.id).downstream;
      if(down.some(e=>e.type==='tested_by')) return;
      const a=propose(projectId,'acceptance_criteria',{title:('AC — '+r.title).slice(0,80), description:'Given the preconditions, when the behaviour in "'+(r.title||r.displayId)+'" runs, then the expected outcome is observed.'});
      const t=propose(projectId,'test_case',{title:('Verify '+r.displayId), attrs:{expected:'Behaviour of '+r.displayId+' is observed as specified.'}});
      M().addRelationship(projectId, r.id, a.id, 'validated_by');
      M().addRelationship(projectId, a.id, t.id, 'tested_by');
      M().addRelationship(projectId, r.id, t.id, 'tested_by');
      ac++; tc++;
    });
    return { acceptanceCriteria:ac, testCases:tc };
  }

  /* Thin agents that front existing engines (one model, no duplication). */
  function qualityReviewer(projectId){ return root.Intelligence?root.Intelligence.assessProject(projectId):null; }
  function gapAnalyst(projectId){ return root.Gaps?root.Gaps.detectGaps(projectId):null; }
  function conflictAnalyst(projectId){ if(!root.Conflicts) return null; const r=root.Conflicts.recordConflicts(projectId); return {recorded:r.created, detected:r.total}; }
  function documentGenerator(projectId, types){ if(!root.Factory) return null;
    const t=types||root.Factory.availableTypes().map(x=>x.id); return t.map(id=>root.Factory.generate(projectId,id)); }
  function consistencyValidator(projectId){ if(!root.Gaps) return null;
    return root.Gaps.detectGaps(projectId).crossArtifact; }

  const AGENTS=[
    {id:'discovery', name:'Discovery Agent', role:'Extract objectives, stakeholders, systems from a problem statement'},
    {id:'requirements', name:'Requirements Agent', role:'Propose requirements for uncovered objectives'},
    {id:'testDesigner', name:'Test Designer', role:'Propose acceptance criteria and test cases'},
    {id:'qualityReviewer', name:'Quality Reviewer', role:'Score clarity/testability/ambiguity'},
    {id:'gapAnalyst', name:'Gap Analyst', role:'Structural and cross-artifact gaps'},
    {id:'conflictAnalyst', name:'Conflict Analyst', role:'Detect and record conflicts'},
    {id:'documentGenerator', name:'Document Generator', role:'Produce artifacts from the model'},
    {id:'consistencyValidator', name:'Consistency Validator', role:'Cross-document / traceability validation'}
  ];
  function list(){ return AGENTS.slice(); }

  const Agents = { discovery, requirements, testDesigner, qualityReviewer, gapAnalyst, conflictAnalyst, documentGenerator, consistencyValidator, list };
  root.Agents = Agents;
  if(typeof module!=='undefined' && module.exports) module.exports = Agents;
})(typeof globalThis!=='undefined' ? globalThis : this);
