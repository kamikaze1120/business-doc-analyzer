/* ============================================================
   INGESTION ADAPTER — turn an analyzed document into Truth-Model facts.

   The existing analyzer produces a STATE (requirements, tests, scenarios,
   extracted elements, meta, docType). This module maps that STATE into
   canonical Project Truth Model objects, each carrying an EVIDENCE record
   that answers "where did this come from?" — document name, line, method,
   confidence — and wires the deterministic traceability edges we actually
   know (requirement → its tests / scenarios).

   Before creating an object it looks for a semantic duplicate already in
   the project. On a match it does NOT create a second object — it appends
   another evidence record to the existing one (provenance merge). This is
   the foundation the full duplicate/conflict engine (Milestone 3) builds on.

   Pure logic, no DOM. Browser global + CommonJS.
   ============================================================ */
;(function(root){
  'use strict';
  function M(){ return root.Model; }

  /* ---- similarity ---- */
  function normText(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim(); }
  function tokens(s){ return new Set(normText(s).split(' ').filter(w=>w.length>2)); }
  function jaccard(a,b){ const A=tokens(a),B=tokens(b); if(!A.size||!B.size) return 0;
    let inter=0; A.forEach(t=>{ if(B.has(t)) inter++; }); return inter/(A.size+B.size-inter); }
  function findSimilar(projectId, type, text, threshold){
    threshold=threshold==null?0.82:threshold; const n=normText(text);
    let best=null, bestScore=0;
    M().listObjects(projectId, type).forEach(o=>{
      const cand=o.description||o.title||'';
      const score = normText(cand)===n ? 1 : jaccard(cand, text);
      if(score>bestScore){ bestScore=score; best=o; }
    });
    return bestScore>=threshold ? {object:best, score:bestScore} : null;
  }

  /* ---- category → Truth-Model type + provenance ---- */
  const REQ_CAT_TYPE = { FR:'functional_requirement', NFR:'non_functional_requirement',
    INT:'integration_requirement', BR:'business_rule', ASM:'assumption', OI:'open_question' };
  function provenanceForCat(cat){
    if(cat==='OI') return 'open_question';
    if(cat==='ASM') return 'assumption';
    return 'stakeholder_statement';   // it appears in a real business document
  }

  /* ---- add-or-merge a single object with evidence ---- */
  function addOrMerge(projectId, type, props, evidence, result){
    const text = props.description||props.title||'';
    const dup = findSimilar(projectId, type, text);
    if(dup){ M().addEvidence(projectId, dup.object.id, evidence); result.matched.push({id:dup.object.id, type, score:+dup.score.toFixed(2)}); return dup.object; }
    const o = M().addObject(projectId, type, Object.assign({createdBy:'import', evidence:[evidence]}, props));
    result.created.push({id:o.id, type, displayId:o.displayId});
    return o;
  }

  /* ---- main: ingest a full analysis STATE into a project ---- */
  function fromAnalysis(projectId, state, opts){
    opts=opts||{};
    const result = { created:[], matched:[], relationships:0 };
    if(!M().getProject(projectId)) throw new Error('no such project: '+projectId);
    const docName = (state.meta && (state.meta.title)) || state.fileName || 'Document';
    const sourceType = (state.docType && state.docType.id) || 'document';
    const ev = extra => Object.assign({ sourceType, documentName:docName, extractionMethod:'deterministic' }, extra);

    const srcMap = {};   // source display id (FR-001) -> PTM object id, for wiring test edges

    // Requirements & business rules
    (state.reqs||[]).forEach(r=>{
      const type = REQ_CAT_TYPE[r.cat] || 'functional_requirement';
      const conf = r.sem && r.sem.confidence!=null ? r.sem.confidence/100 : null;
      const o = addOrMerge(projectId, type,
        { title:(r.text||'').slice(0,80), description:r.text||'', priority:r.priority||null,
          provenance:provenanceForCat(r.cat), attrs:{ sourceDisplayId:r.id, category:r.cat, testable:!!r.testable, measurable:!!r.measurable } },
        ev({ location:{line:r.line||null}, originalText:r.text, extractionMethod:r.derived?'inferred':'authored', confidence:conf }),
        result);
      if(r.id) srcMap[r.id]=o.id;
    });

    // Test scenarios (E2E) → test_scenario, linked to their requirements
    (state.scen||[]).forEach(sc=>{
      const o = addOrMerge(projectId, 'test_scenario',
        { title:sc.name||sc.id, description:(sc.steps||[]).join(' → '), attrs:{ scenarioType:sc.type, sourceDisplayId:sc.id } },
        ev({ originalText:sc.name }), result);
      (sc.reqs||[]).forEach(rid=>{ const to=srcMap[rid]; if(to){ if(M().addRelationship(projectId, to, o.id, 'validated_by')) result.relationships++; } });
    });

    // Test cases → test_case, linked to the requirement they verify
    (state.tests||[]).forEach(t=>{
      if(!t.req || t.req==='—') return;
      const o = addOrMerge(projectId, 'test_case',
        { title:t.title||t.id, description:(t.steps||[]).join(' '), priority:t.priority||null,
          attrs:{ testType:t.type, sourceDisplayId:t.id, expected:t.expected||'' } },
        ev({ originalText:t.title, confidence:t.confidence!=null?t.confidence/100:null }), result);
      String(t.req).split(',').map(s=>s.trim()).forEach(rid=>{ const from=srcMap[rid]; if(from){ if(M().addRelationship(projectId, from, o.id, 'tested_by')) result.relationships++; } });
    });

    // Extracted elements → their canonical types (deterministic, from the document)
    const el = state.el || {};
    const list = (arr, type, pick, prov) => (arr||[]).forEach(x=>{
      const val = pick ? pick(x) : x; const text=(val&&val.title)||val; if(!text||!String(text).trim()) return;
      addOrMerge(projectId, type, { title:String(text).slice(0,90), description:String(val.description||text), provenance:prov||'stakeholder_statement', attrs:val.attrs||{} },
        ev({ originalText:String(text) }), result);
    });
    list(el.objectives, 'business_objective', o=>({title:(o.text||o), description:(o.text||o)}));
    list(el.scopeIn, 'scope_in');
    list(el.scopeOut, 'scope_out');
    list(el.stakeholders, 'stakeholder', s=>({title:s.role||s.name||s, description:s.note||''}));
    list(el.personas, 'persona', p=>({title:p.name||p, description:p.desc||''}));
    list(el.risks, 'risk', r=>({title:r.risk||r, attrs:{mitigation:r.mitigation||'', severity:r.sev||''}}));
    list(el.metrics, 'metric', m=>({title:m.name||m, attrs:{target:m.target||''}}));
    list((state.actors||[]), 'actor');
    // systems come from the brain payload extractor when available
    if(typeof root.extractSystems==='function' && state.reqs){ try{ root.extractSystems(state).forEach(sys=>{
      addOrMerge(projectId,'system',{title:sys, provenance:'fact'}, ev({originalText:sys}), result); }); }catch(e){} }
    // open questions
    (el.questions||[]).forEach(q=>{ const text=typeof q==='string'?q:q.text; if(!text) return;
      addOrMerge(projectId,'open_question',{title:String(text).slice(0,120), description:String(text), provenance:'open_question'}, ev({originalText:String(text)}), result); });

    return result;
  }

  /* Get-or-create the Truth-Model project twinned to a legacy guided project,
     then ingest the freshly analyzed STATE into it. Used by the Projects
     builder so "Generate & analyze" also populates the canonical model. */
  function intoGuidedProjectModel(legacyProject, state){
    let twin = M().listProjects().find(p=>p.migratedFrom && p.migratedFrom.legacyId===legacyProject.id);
    if(!twin) twin = M().createProject({ name: legacyProject.meta&&legacyProject.meta.project||legacyProject.name,
      meta:Object.assign({}, legacyProject.meta), migratedFrom:{kind:'guided_project', legacyId:legacyProject.id, at:new Date().toISOString()} });
    const res = fromAnalysis(twin.id, state);
    return { projectId:twin.id, result:res };
  }

  const Ingest = { fromAnalysis, intoGuidedProjectModel, findSimilar, jaccard, normText };
  root.Ingest = Ingest;
  if(typeof module!=='undefined' && module.exports) module.exports = Ingest;
})(typeof globalThis!=='undefined' ? globalThis : this);
