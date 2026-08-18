/* ============================================================
   SPECIALIZED AGENTS (Phase 12) — deterministic core, AI-enhanced.

   Every agent operates on the ONE Project Truth Model. The rule-based
   extraction is the FLOOR and always runs; when an LLM is configured
   (js/llm.js), the agent additionally asks it for richer, more specific
   proposals. Whatever the source, every proposed object is created
   'ai_proposed' / 'ai_inference' with the model's confidence and an
   evidence record — a human must Accept/Edit/Reject it, and agents never
   overwrite approved content. If the LLM is off or a call fails, behaviour
   falls back exactly to the deterministic path. DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  function M(){ return root.Model; }
  // Read the AI + llm primitives from the shared global scope when present.
  function ai(){ return (typeof AI!=='undefined' && AI) ? AI : {available:false}; }
  function llmJ(prompt,opts){ return (typeof llmJSON!=='undefined') ? llmJSON(prompt,opts) : Promise.resolve(null); }
  // Validate AI output against a typed schema BEFORE it can create objects.
  // Returns normalized valid items; malformed/invalid input yields [] (caller
  // then falls back to the deterministic path). Diagnostics carry no secrets.
  function aiItems(schemaName, arr){
    if(root.AISchema){ const r=root.AISchema.validateList(schemaName, arr||[]);
      if(r.rejected && r.rejected.length){ try{ console.warn('agents: dropped '+r.rejected.length+' invalid '+schemaName+' item(s)', r.diagnostics.errors); }catch(e){} }
      return r.valid; }
    return (Array.isArray(arr)?arr:[]).map(x=> typeof x==='string'?{text:x}:x).filter(Boolean);
  }

  const SYS = /\b(salesforce|sap|oracle|workday|servicenow|sharepoint|mulesoft|laserfiche|active directory|azure ad|okta|docusign|power ?bi|tableau|snowflake|stripe|twilio|jira|dynamics)\b/ig;
  const ROLE = /\b(manager|director|administrator|approver|analyst|finance|hr|it|customer|vendor|supplier|employee|supervisor|owner|sponsor)\b/ig;
  const REQ=['functional_requirement','non_functional_requirement','integration_requirement','business_requirement'];
  const REQ_MAP={FR:'functional_requirement',NFR:'non_functional_requirement',INT:'integration_requirement',BR:'business_rule'};

  function uniqCI(arr){ const seen=new Set(),out=[]; arr.forEach(x=>{ const k=x.toLowerCase(); if(!seen.has(k)){seen.add(k);out.push(x);} }); return out; }
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim(); }
  function toks(s){ return new Set(norm(s).split(' ').filter(w=>w.length>2)); }
  function jacc(a,b){ const A=toks(a),B=toks(b); if(!A.size||!B.size) return 0; let i=0; A.forEach(t=>{if(B.has(t))i++;}); return i/(A.size+B.size-i); }
  function similarExists(projectId,type,text){ const n=norm(text);
    return M().listObjects(projectId,type).some(o=>{ const c=o.description||o.title||''; return norm(c)===n || jacc(c,text)>=0.85; }); }
  function brief(o){ return {id:o.id,type:o.type,displayId:o.displayId,title:o.title}; }

  // System-generated proposal (deterministic) vs AI-generated proposal.
  function proposeDet(projectId,type,props){ return M().addObject(projectId,type,Object.assign({createdBy:'system',provenance:'ai_inference',status:'ai_proposed'},props)); }
  function proposeAI(projectId,type,props,confidence,sourceText){
    return M().addObject(projectId,type,Object.assign({ createdBy:'ai', provenance:'ai_inference', status:'ai_proposed',
      confidence:confidence!=null?confidence:null,
      evidence:[{ sourceType:'ai_agent', extractionMethod:'AI', originalText:sourceText||null, confidence:confidence!=null?confidence:null }] }, props)); }

  // Grounding context so the model doesn't invent systems/roles.
  function ctx(projectId){
    const sys=M().listObjects(projectId,'system').map(o=>o.title);
    const roles=M().listObjects(projectId,'stakeholder').map(o=>o.title);
    const parts=[]; if(sys.length) parts.push('Known systems: '+sys.join(', ')); if(roles.length) parts.push('Known roles: '+roles.join(', '));
    return parts.join('\n');
  }

  /* ---- Discovery ---- */
  function dtDiscovery(projectId, s){
    const created=[];
    created.push(proposeDet(projectId,'business_objective',{title:s.slice(0,80), description:s}));
    uniqCI((s.match(SYS)||[]).map(x=>x.replace(/\b\w/g,c=>c.toUpperCase()))).forEach(sys=>created.push(proposeDet(projectId,'system',{title:sys})));
    uniqCI((s.match(ROLE)||[]).map(x=>x.replace(/\b\w/g,c=>c.toUpperCase()))).forEach(r=>created.push(proposeDet(projectId,'stakeholder',{title:r})));
    if(/\b(risk|delay|latency|manual|error|compliance|security)\b/i.test(s)) created.push(proposeDet(projectId,'risk',{title:'Delivery/quality risk implied by the problem statement'}));
    return created;
  }
  async function discovery(projectId, statement){
    const s=String(statement||'').trim(); if(!s) return {created:[], source:'none'};
    const created=dtDiscovery(projectId, s);
    if(!ai().available) return {created:created.map(brief), source:'rules'};
    try{
      const prompt=`You are a senior business analyst. From ONLY the problem statement below, extract structured discovery items. Do NOT invent systems, people, or facts not implied by the text. Return STRICT JSON:
{"objectives":[{"text":"...","confidence":0.0}],"stakeholders":[{"text":"role","confidence":0.0}],"systems":[{"text":"name","confidence":0.0}],"risks":[{"text":"...","confidence":0.0}]}
${ctx(projectId)}
STATEMENT: ${s}`;
      const j=await llmJ(prompt,{temperature:0.2});
      const addk=(arr,type)=> aiItems('DiscoveryItem', arr).forEach(it=>{ if(similarExists(projectId,type,it.text)) return;
        created.push(proposeAI(projectId,type,{title:it.text.slice(0,90),description:it.text}, it.confidence, s)); });
      if(j){ addk(j.objectives,'business_objective'); addk(j.stakeholders,'stakeholder'); addk(j.systems,'system'); addk(j.risks,'risk'); }
      return {created:created.map(brief), source:'ai'};
    }catch(e){ return {created:created.map(brief), source:'rules', aiError:e.message}; }
  }

  /* ---- Requirements ---- */
  async function requirements(projectId){
    let created=0;
    for(const ob of M().listObjects(projectId,'business_objective')){
      const has=M().relationshipsOf(projectId,ob.id).downstream.some(e=>{ const to=M().getObject(projectId,e.to); return to&&REQ.includes(to.type); });
      if(has) continue;
      let madeAI=false;
      if(ai().available){
        try{
          const prompt=`Decompose this objective into 2-5 specific, testable requirements. Classify each as FR (functional), NFR (non-functional), or INT (integration). Do not invent systems not implied. Return STRICT JSON: {"requirements":[{"text":"The system shall ...","type":"FR","confidence":0.0}]}
${ctx(projectId)}
OBJECTIVE: ${ob.title}`;
          const j=await llmJ(prompt,{temperature:0.2});
          const list=aiItems('RequirementProposal', j&&j.requirements);   // schema-validated + normalized
          list.forEach(r=>{ const type=REQ_MAP[r.type]||'functional_requirement';
            if(similarExists(projectId,type,r.text)) return;
            const o=proposeAI(projectId,type,{title:r.text.slice(0,80),description:r.text,priority:'Medium'}, r.confidence, ob.title);
            M().addRelationship(projectId,o.id,ob.id,'implements'); created++; madeAI=true; });
        }catch(e){ /* fall through */ }
      }
      if(!madeAI){ const fr=proposeDet(projectId,'functional_requirement',{title:('Support: '+ob.title).slice(0,80),description:'The system shall support "'+ob.title+'".',priority:'Medium'});
        M().addRelationship(projectId,fr.id,ob.id,'implements'); created++; }
    }
    return {created};
  }

  /* ---- Test Designer ---- */
  async function testDesigner(projectId){
    let ac=0, tc=0;
    for(const r of M().listObjects(projectId).filter(o=>REQ.includes(o.type))){
      if(M().relationshipsOf(projectId,r.id).downstream.some(e=>e.type==='tested_by')) continue;
      let madeAI=false;
      if(ai().available){
        try{
          const prompt=`For this requirement, write ONE acceptance criterion in Given/When/Then form and 2-3 test cases (positive, negative, and boundary where relevant). Return STRICT JSON: {"acceptance":"Given ... when ... then ...","tests":[{"title":"...","type":"Positive","expected":"...","confidence":0.0}]}
REQUIREMENT: ${r.description||r.title}`;
          const j=await llmJ(prompt,{temperature:0.2});
          const acItems = aiItems('AcceptanceCriteriaProposal', j ? [{text:j.acceptance, confidence:j.confidence}] : []);
          const testItems = aiItems('TestCaseProposal', j&&j.tests);   // schema-validated + normalized
          if(acItems.length || testItems.length){
            const acText = acItems.length ? acItems[0].text : ('Acceptance for '+r.displayId);
            const a=proposeAI(projectId,'acceptance_criteria',{title:('AC — '+r.title).slice(0,80),description:acText}, acItems[0]&&acItems[0].confidence, r.description);
            M().addRelationship(projectId,r.id,a.id,'validated_by'); ac++;
            testItems.forEach(t=>{ const o=proposeAI(projectId,'test_case',{title:t.title.slice(0,80),attrs:{testType:t.type,expected:t.expected||''}}, t.confidence, r.description);
              M().addRelationship(projectId,a.id,o.id,'tested_by'); M().addRelationship(projectId,r.id,o.id,'tested_by'); tc++; });
            madeAI = testItems.length>0;
          }
        }catch(e){ /* fall through */ }
      }
      if(!madeAI){
        const a=proposeDet(projectId,'acceptance_criteria',{title:('AC — '+r.title).slice(0,80),description:'Given the preconditions, when the behaviour in "'+(r.title||r.displayId)+'" runs, then the expected outcome is observed.'});
        const t=proposeDet(projectId,'test_case',{title:('Verify '+r.displayId),attrs:{expected:'Behaviour of '+r.displayId+' is observed as specified.'}});
        M().addRelationship(projectId,r.id,a.id,'validated_by'); M().addRelationship(projectId,a.id,t.id,'tested_by'); M().addRelationship(projectId,r.id,t.id,'tested_by'); ac++; tc++;
      }
    }
    return {acceptanceCriteria:ac, testCases:tc};
  }

  /* ---- Quality rewrites (suggestions only; never auto-applied) ---- */
  async function qualityRewrites(projectId){
    if(!ai().available || !root.Intelligence) return {rewrites:0};
    let n=0;
    const q=root.Intelligence.assessProject(projectId);
    for(const it of q.items){
      if(it.testable && !it.vague) continue;
      const o=M().getObject(projectId,it.id); if(!o) continue;
      try{
        const prompt=`Rewrite this requirement as a single clear, testable sentence in the form "<actor> shall <verb> <object> [when <condition>] [within <measurable limit>]". Keep the original intent; do not add scope. Return STRICT JSON: {"rewrite":"...","confidence":0.0}
REQUIREMENT: ${o.description||o.title}`;
        const j=await llmJ(prompt,{temperature:0.2});
        const rw=aiItems('RewriteProposal', j ? [{rewrite:j.rewrite, confidence:j.confidence}] : [])[0];   // schema-validated
        if(rw){ const attrs=Object.assign({},o.attrs,{aiRewrite:{text:rw.rewrite,confidence:rw.confidence,at:new Date().toISOString()}});
          M().updateObject(projectId,o.id,{attrs},{force:true,changeReason:'AI rewrite suggestion'}); n++; }
      }catch(e){ /* skip this one */ }
    }
    return {rewrites:n};
  }
  // Apply a stored rewrite suggestion — an explicit human action.
  function applyRewrite(projectId, id){
    const o=M().getObject(projectId,id); if(!o||!(o.attrs&&o.attrs.aiRewrite)) return {applied:false};
    const text=o.attrs.aiRewrite.text; const attrs=Object.assign({},o.attrs); delete attrs.aiRewrite;
    const patch={description:text, title:text.slice(0,80), attrs}, opts={force:true, changeReason:'applied AI rewrite'};
    // Route through the mutation facade so applying the rewrite cascades impact
    // + document freshness; fall back to a plain update when it isn't loaded.
    const res = root.Mutate ? root.Mutate.updateObject(projectId,id,patch,opts) : M().updateObject(projectId,id,patch,opts);
    return {applied:true, result:res};
  }

  /* ---- engine-fronting agents (one model, no duplication) ---- */
  function qualityReviewer(projectId){ return root.Intelligence?root.Intelligence.assessProject(projectId):null; }
  function gapAnalyst(projectId){ return root.Gaps?root.Gaps.detectGaps(projectId):null; }
  function conflictAnalyst(projectId){ if(!root.Conflicts) return null; const r=root.Conflicts.recordConflicts(projectId); return {recorded:r.created, detected:r.total}; }
  function documentGenerator(projectId, types){ if(!root.Factory) return null; const t=types||root.Factory.availableTypes().map(x=>x.id); return t.map(id=>root.Factory.generate(projectId,id)); }
  function consistencyValidator(projectId){ if(!root.Gaps) return null; return root.Gaps.detectGaps(projectId).crossArtifact; }

  const AGENTS=[
    {id:'discovery', name:'Discovery Agent', role:'Extract objectives, stakeholders, systems from a problem statement'},
    {id:'requirements', name:'Requirements Agent', role:'Propose requirements for uncovered objectives'},
    {id:'testDesigner', name:'Test Designer', role:'Propose acceptance criteria and test cases'},
    {id:'qualityReviewer', name:'Quality Reviewer', role:'Score clarity/testability/ambiguity + rewrite suggestions'},
    {id:'gapAnalyst', name:'Gap Analyst', role:'Structural and cross-artifact gaps'},
    {id:'conflictAnalyst', name:'Conflict Analyst', role:'Detect and record conflicts'},
    {id:'documentGenerator', name:'Document Generator', role:'Produce artifacts from the model'},
    {id:'consistencyValidator', name:'Consistency Validator', role:'Cross-document / traceability validation'}
  ];
  function list(){ return AGENTS.slice(); }

  const Agents = { discovery, requirements, testDesigner, qualityReviewer, qualityRewrites, applyRewrite,
    gapAnalyst, conflictAnalyst, documentGenerator, consistencyValidator, list };
  root.Agents = Agents;
  if(typeof module!=='undefined' && module.exports) module.exports = Agents;
})(typeof globalThis!=='undefined' ? globalThis : this);
