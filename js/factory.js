/* ============================================================
   DOCUMENT FACTORY (Phase 10).

   Generates documents FROM the Project Truth Model — never a dead,
   static file. Every generated document is stored as a generated_document
   object that records the exact source objects it was built from
   (attrs.sourceObjectIds), so the change-impact engine (Milestone 5) can
   mark it "needs_review" the moment any of those sources change.
   Regenerating refreshes the content and clears staleness.
   Deterministic and DOM-free; produces Markdown.
   ============================================================ */
;(function(root){
  'use strict';
  function M(){ return root.Model; }
  const T = o => (o.description||o.title||'').trim();

  /* ---- render helpers (accumulate the source ids they touch) ---- */
  function collect(sink, objs){ objs.forEach(o=>sink.add(o.id)); return objs; }
  function reqLines(objs){ return objs.length? objs.map(o=>`- **${o.displayId}** — ${T(o)}${o.priority?` _(priority: ${o.priority})_`:''}`).join('\n') : '_None captured yet._'; }
  function bullet(objs, f){ return objs.length? objs.map(o=>'- '+f(o)).join('\n') : '_None captured yet._'; }
  function get(projectId,type){ return M().listObjects(projectId,type); }
  function sect(h,body){ return `## ${h}\n\n${body}\n`; }

  function header(projectId, title){
    const p=M().getProject(projectId), meta=p&&p.meta||{};
    const L=[`# ${title}`, ''];
    const bits=[]; if(meta.project&&meta.project!==title) bits.push(meta.project);
    if(meta.version) bits.push('Version '+meta.version); if(meta.author) bits.push('Author: '+meta.author);
    if(meta.department) bits.push(meta.department);
    bits.push('Generated '+new Date().toISOString().slice(0,10)+' from the Project Truth Model');
    L.push('_'+bits.join(' · ')+'_',''); return L.join('\n');
  }

  /* ---- builders: each returns {title, markdown, sourceIds:Set} ---- */
  function buildBRD(projectId){
    const s=new Set(); const P=M().getProject(projectId);
    const title=(P.meta&&P.meta.project?P.meta.project+' — ':'')+'Business Requirements Document';
    const md=[ header(projectId,title),
      sect('1. Business Objectives', reqLines(collect(s,get(projectId,'business_objective')))),
      sect('2. Scope', '**In scope**\n\n'+bullet(collect(s,get(projectId,'scope_in')),T)+'\n\n**Out of scope**\n\n'+bullet(collect(s,get(projectId,'scope_out')),T)),
      sect('3. Stakeholders', bullet(collect(s,get(projectId,'stakeholder')), o=>`**${o.title}**${o.description?' — '+o.description:''}`)),
      sect('4. Business Requirements', reqLines(collect(s,get(projectId,'business_requirement')))),
      sect('5. Functional Requirements', reqLines(collect(s,get(projectId,'functional_requirement')))),
      sect('6. Non-Functional Requirements', reqLines(collect(s,get(projectId,'non_functional_requirement')))),
      sect('7. Business Rules', reqLines(collect(s,get(projectId,'business_rule')))),
      sect('8. Assumptions', bullet(collect(s,get(projectId,'assumption')),T)),
      sect('9. Risks', bullet(collect(s,get(projectId,'risk')), o=>`${o.title}${o.attrs&&o.attrs.mitigation?' — _mitigation:_ '+o.attrs.mitigation:''}`))
    ].join('\n'); return {title, markdown:md, sourceIds:s};
  }
  function buildFRD(projectId){
    const s=new Set(); const title='Functional Requirements Document';
    const md=[ header(projectId,title),
      sect('1. Functional Requirements', reqLines(collect(s,get(projectId,'functional_requirement')))),
      sect('2. Integration Requirements', reqLines(collect(s,get(projectId,'integration_requirement')))),
      sect('3. Data Requirements', reqLines(collect(s,get(projectId,'data_requirement')))),
      sect('4. Reporting Requirements', reqLines(collect(s,get(projectId,'reporting_requirement')))),
      sect('5. Non-Functional Requirements', reqLines(collect(s,get(projectId,'non_functional_requirement')))),
      sect('6. Acceptance Criteria', reqLines(collect(s,get(projectId,'acceptance_criteria'))))
    ].join('\n'); return {title, markdown:md, sourceIds:s};
  }
  function buildPRD(projectId){
    const s=new Set(); const title='Product Requirements Document';
    const md=[ header(projectId,title),
      sect('1. Objectives', reqLines(collect(s,get(projectId,'business_objective')))),
      sect('2. Personas', bullet(collect(s,get(projectId,'persona')), o=>`**${o.title}**${o.description?' — '+o.description:''}`)),
      sect('3. Features', reqLines(collect(s,get(projectId,'functional_requirement')))),
      sect('4. Non-Functional Requirements', reqLines(collect(s,get(projectId,'non_functional_requirement')))),
      sect('5. Metrics', bullet(collect(s,get(projectId,'metric')), o=>`${o.title}${o.attrs&&o.attrs.target?' — target: '+o.attrs.target:''}`)),
      sect('6. Scope', '**In scope**\n\n'+bullet(collect(s,get(projectId,'scope_in')),T)+'\n\n**Out of scope**\n\n'+bullet(collect(s,get(projectId,'scope_out')),T))
    ].join('\n'); return {title, markdown:md, sourceIds:s};
  }
  function buildCharter(projectId){
    const s=new Set(); const title='Project Charter';
    const md=[ header(projectId,title),
      sect('1. Objectives', reqLines(collect(s,get(projectId,'business_objective')))),
      sect('2. Scope', '**In scope**\n\n'+bullet(collect(s,get(projectId,'scope_in')),T)+'\n\n**Out of scope**\n\n'+bullet(collect(s,get(projectId,'scope_out')),T)),
      sect('3. Stakeholders', bullet(collect(s,get(projectId,'stakeholder')), o=>`**${o.title}**${o.description?' — '+o.description:''}`)),
      sect('4. Risks', bullet(collect(s,get(projectId,'risk')), o=>`${o.title}${o.attrs&&o.attrs.mitigation?' — _mitigation:_ '+o.attrs.mitigation:''}`)),
      sect('5. Success Measures', bullet(collect(s,get(projectId,'metric')), o=>`${o.title}${o.attrs&&o.attrs.target?' — target: '+o.attrs.target:''}`))
    ].join('\n'); return {title, markdown:md, sourceIds:s};
  }
  function buildRTM(projectId){
    const s=new Set(); const title='Requirements Traceability Matrix';
    const REQ=['business_requirement','functional_requirement','non_functional_requirement','integration_requirement','data_requirement','reporting_requirement'];
    const rows=[];
    REQ.forEach(t=>get(projectId,t).forEach(o=>{ s.add(o.id);
      const down=M().relationshipsOf(projectId,o.id).downstream;
      const tests=down.filter(e=>e.type==='tested_by').map(e=>{ s.add(e.to); const to=M().getObject(projectId,e.to); return to?to.displayId:''; }).filter(Boolean);
      rows.push(`| ${o.displayId} | ${T(o).replace(/\|/g,'/').slice(0,80)} | ${o.priority||'—'} | ${o.status} | ${tests.join(', ')||'—'} | ${tests.length?'✓':'GAP'} |`); }));
    const table = rows.length? '| Req ID | Requirement | Priority | Status | Tests | Coverage |\n|---|---|---|---|---|---|\n'+rows.join('\n') : '_No requirements yet._';
    return {title, markdown:header(projectId,title)+'\n'+table+'\n', sourceIds:s};
  }
  function buildTestPlan(projectId){
    const s=new Set(); const title='Test Plan';
    const md=[ header(projectId,title),
      sect('1. Test Scenarios', bullet(collect(s,get(projectId,'test_scenario')), o=>`**${o.displayId}** — ${T(o)}`)),
      sect('2. Test Cases', bullet(collect(s,get(projectId,'test_case')), o=>`**${o.displayId}** — ${o.title}${o.attrs&&o.attrs.expected?'  \n  _Expected:_ '+o.attrs.expected:''}`))
    ].join('\n'); return {title, markdown:md, sourceIds:s};
  }
  function buildRAID(projectId){
    const s=new Set(); const title='RAID Log';
    const md=[ header(projectId,title),
      sect('Risks', bullet(collect(s,get(projectId,'risk')), o=>`${o.title}${o.attrs&&o.attrs.mitigation?' — _mitigation:_ '+o.attrs.mitigation:''}`)),
      sect('Assumptions', bullet(collect(s,get(projectId,'assumption')),T)),
      sect('Issues / Open Questions', bullet(collect(s,get(projectId,'open_question')),T)),
      sect('Dependencies', bullet(collect(s,get(projectId,'dependency')),T))
    ].join('\n'); return {title, markdown:md, sourceIds:s};
  }
  function buildStakeholders(projectId){
    const s=new Set(); const title='Stakeholder Register';
    const md=header(projectId,title)+'\n'+sect('Stakeholders', bullet(collect(s,get(projectId,'stakeholder')), o=>`**${o.title}**${o.description?' — '+o.description:''}`));
    return {title, markdown:md, sourceIds:s};
  }

  const TEMPLATES = {
    brd:{label:'Business Requirements Document (BRD)', build:buildBRD},
    frd:{label:'Functional Requirements Document (FRD)', build:buildFRD},
    prd:{label:'Product Requirements Document (PRD)', build:buildPRD},
    charter:{label:'Project Charter', build:buildCharter},
    rtm:{label:'Requirements Traceability Matrix', build:buildRTM},
    testplan:{label:'Test Plan', build:buildTestPlan},
    raid:{label:'RAID Log', build:buildRAID},
    stakeholder_register:{label:'Stakeholder Register', build:buildStakeholders}
  };
  function availableTypes(){ return Object.keys(TEMPLATES).map(k=>({id:k, label:TEMPLATES[k].label})); }

  function generate(projectId, docType){
    const t=TEMPLATES[docType]; if(!t) throw new Error('unknown document type: '+docType);
    if(!M().getProject(projectId)) throw new Error('no such project');
    const built=t.build(projectId);
    const sourceObjectIds=[...built.sourceIds];
    // Record the version of every source object so freshness can later tell
    // whether a source has ACTUALLY changed since this document was built.
    const sourceVersions={}; sourceObjectIds.forEach(sid=>{ const o=M().getObject(projectId,sid); if(o) sourceVersions[sid]=o.version; });
    const base={ docType, markdown:built.markdown, sourceObjectIds, sourceVersions, docStatus:'current',
      generatedAt:new Date().toISOString() };
    let doc=M().listObjects(projectId,'generated_document').find(d=>d.attrs&&d.attrs.docType===docType);
    if(doc){ const attrs=Object.assign({}, doc.attrs, base);
      M().updateObject(projectId, doc.id, {title:built.title, description:t.label, attrs}, {force:true, changeReason:'regenerated'});
      doc=M().getObject(projectId, doc.id); }
    else { doc=M().addObject(projectId,'generated_document',{ title:built.title, description:t.label,
      createdBy:'system', provenance:'fact', status:'draft', attrs:base }); }
    return { docId:doc.id, docType, title:built.title, markdown:built.markdown, sources:sourceObjectIds.length };
  }
  function regenerate(projectId, docId){
    const doc=M().getObject(projectId, docId); if(!doc||doc.type!=='generated_document') throw new Error('not a document');
    return generate(projectId, doc.attrs.docType);
  }
  function listDocuments(projectId){
    return M().listObjects(projectId,'generated_document').map(d=>({ id:d.id, title:d.title, docType:d.attrs&&d.attrs.docType,
      status:(d.attrs&&d.attrs.docStatus)||'current', sources:(d.attrs&&d.attrs.sourceObjectIds||[]).length, generatedAt:d.attrs&&d.attrs.generatedAt })); }
  function documentMarkdown(projectId, docId){ const d=M().getObject(projectId,docId); return d&&d.attrs?d.attrs.markdown:''; }

  const Factory = { TEMPLATES, availableTypes, generate, regenerate, listDocuments, documentMarkdown };
  root.Factory = Factory;
  if(typeof module!=='undefined' && module.exports) module.exports = Factory;
})(typeof globalThis!=='undefined' ? globalThis : this);
