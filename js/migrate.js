/* ============================================================
   MIGRATION LAYER — bring existing data into the Project Truth Model
   WITHOUT destroying anything.

   The legacy guided-builder projects (js/store.js → Store.projects())
   keep working exactly as before; this layer mirrors them into the
   canonical Model so the new architecture has data to operate on.
   It is IDEMPOTENT: a legacy project already mirrored is skipped, so
   it is safe to run on every boot. Originals are never modified.
   ============================================================ */
;(function(root){
  'use strict';

  function Model(){ return root.Model; }
  function LegacyStore(){ return (typeof root.Store!=='undefined' && root.Store) ? root.Store : null; }

  // Map a legacy guided-builder docType/section to PTM object types.
  const REQ_TYPE = { FR:'functional_requirement', NFR:'non_functional_requirement',
    INT:'integration_requirement', BR:'business_rule' };

  function evidenceFor(legacy){
    return { sourceType:'guided_project', documentName:legacy.meta&&legacy.meta.project||legacy.name||'Guided project',
      extractionMethod:'user', originalText:null };
  }
  function statusFor(item){ return item && item.confirmed ? 'under_review' : 'draft'; }

  function alreadyMigrated(legacyId){
    return Model().listProjects().some(p=>p.migratedFrom && p.migratedFrom.legacyId===legacyId);
  }

  // Pure: build a PTM project from a legacy guided-project object.
  function importGuidedProject(legacy){
    const M=Model();
    const p=M.createProject({ name: legacy.meta&&legacy.meta.project || legacy.name || 'Imported project',
      meta: Object.assign({}, legacy.meta, {legacyDocType:legacy.docType, idea:legacy.idea||''}),
      migratedFrom: { kind:'guided_project', legacyId:legacy.id, at:new Date().toISOString() } });
    const ev=evidenceFor(legacy);
    const add=(type,props)=>M.addObject(p.id, type, Object.assign({createdBy:'user', evidence:[ev]}, props));
    let n=0;

    if(legacy.idea && legacy.idea.trim()){
      add('business_objective', {title:'Project purpose', description:legacy.idea.trim(), provenance:'stakeholder_statement'}); n++;
    }
    const data=legacy.data||{};
    // requirements & business rules
    ['FR','NFR','INT','BR'].forEach(cat=>{
      (data[cat]||[]).forEach(it=>{ const text=(it&&it.text||'').trim(); if(!text) return;
        add(REQ_TYPE[cat], {title:text.slice(0,80), description:text, status:statusFor(it),
          provenance:'stakeholder_statement'}); n++; });
    });
    // scope
    (data.scopeIn||[]).forEach(x=>{ if(String(x).trim()){ add('scope_in',{title:String(x).trim()}); n++; } });
    (data.scopeOut||[]).forEach(x=>{ if(String(x).trim()){ add('scope_out',{title:String(x).trim()}); n++; } });
    // stakeholders
    (data.stakeholders||[]).forEach(s=>{ if(s&&s.role){ add('stakeholder',{title:s.role, description:s.note||''}); n++; } });
    // risks
    (data.risks||[]).forEach(r=>{ if(r&&r.risk){ add('risk',{title:r.risk, attrs:{mitigation:r.mitigation||''}}); n++; } });
    // generic lists used by PRD/charter
    (data.objectives||[]).forEach(o=>{ const t=(o&&o.text||o||'').toString().trim(); if(t){ add('business_objective',{title:t.slice(0,80),description:t}); n++; } });
    (data.personas||[]).forEach(o=>{ const t=(o&&o.text||o||'').toString().trim(); if(t){ add('persona',{title:t.slice(0,80),description:t}); n++; } });
    (data.metrics||[]).forEach(o=>{ const t=(o&&o.text||o||'').toString().trim(); if(t){ add('metric',{title:t.slice(0,80),description:t}); n++; } });

    return { projectId:p.id, objects:n };
  }

  // Read every legacy guided project and mirror the ones not yet migrated.
  function migrateGuidedProjects(){
    const S=LegacyStore(); const out={ migrated:[], skipped:[] };
    if(!S || typeof S.projects!=='function') return out;
    const legacy=S.projects()||{};
    Object.values(legacy).forEach(lp=>{
      if(!lp||!lp.id) return;
      if(alreadyMigrated(lp.id)){ out.skipped.push(lp.id); return; }
      try{ const r=importGuidedProject(lp); out.migrated.push({legacyId:lp.id, projectId:r.projectId, objects:r.objects}); }
      catch(e){ /* never let one bad record abort the rest */ out.skipped.push(lp.id); }
    });
    return out;
  }

  // Orchestrator — safe to call on boot. Never throws.
  function run(){
    try{ if(!root.Model) return {ok:false, error:'Model not loaded'};
      const g=migrateGuidedProjects();
      return { ok:true, guided:g };
    }catch(e){ return { ok:false, error:e.message }; }
  }

  const Migrate = { run, migrateGuidedProjects, importGuidedProject, alreadyMigrated };
  root.Migrate = Migrate;
  if(typeof module!=='undefined' && module.exports) module.exports = Migrate;
})(typeof globalThis!=='undefined' ? globalThis : this);
