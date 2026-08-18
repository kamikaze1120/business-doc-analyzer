/* ============================================================
   PROVENANCE — make trust and origin legible.

   Critical rule: never let AI-generated content masquerade as a
   confirmed stakeholder decision. Every Truth-Model object carries a
   provenance classification and a lifecycle status; this module turns
   those into labels/badges and renders an object's evidence trail
   ("where did this come from?"). Pure — used by the UI in later
   milestones and unit-tested now.
   ============================================================ */
;(function(root){
  'use strict';

  const CLASS_META = {
    fact:                 {label:'Confirmed Fact',       tone:'ok'},
    stakeholder_statement:{label:'Stakeholder Statement',tone:'accent'},
    ai_inference:         {label:'AI Inference',         tone:'warn'},
    assumption:           {label:'Assumption',           tone:'warn'},
    open_question:        {label:'Open Question',        tone:'bad'},
    conflict:             {label:'Conflict',             tone:'bad'}
  };
  const STATUS_META = {
    draft:        {label:'Draft',        tone:'dim'},
    ai_proposed:  {label:'AI Proposed',  tone:'warn'},
    under_review: {label:'Under Review', tone:'accent'},
    approved:     {label:'Approved',     tone:'ok'},
    rejected:     {label:'Rejected',     tone:'bad'},
    deprecated:   {label:'Deprecated',   tone:'dim'},
    archived:     {label:'Archived',     tone:'dim'}
  };
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function classMeta(prov){ return CLASS_META[prov] || {label:prov||'Unknown', tone:'dim'}; }
  function statusMeta(status){ return STATUS_META[status] || {label:status||'—', tone:'dim'}; }

  function badge(obj){ const m=classMeta(obj.provenance);
    return `<span class="prov-badge prov-${m.tone}">${esc(m.label)}</span>`; }
  function statusBadge(obj){ const m=statusMeta(obj.status);
    return `<span class="status-badge st-${m.tone}">${esc(m.label)}</span>`; }
  function originBadge(obj){ const ai=obj.createdBy==='ai';
    return `<span class="origin-badge ${ai?'origin-ai':'origin-human'}">${ai?'✨ AI-generated':'Provided'}</span>`; }

  // The "where did this come from?" panel for one object.
  function evidenceHtml(obj){
    const evs = obj.evidence||[];
    const head = `<div class="prov-head">${badge(obj)} ${statusBadge(obj)} ${originBadge(obj)}
      <span class="prov-meta">v${obj.version} · created ${fmt(obj.createdAt)}${obj.updatedAt&&obj.updatedAt!==obj.createdAt?' · updated '+fmt(obj.updatedAt):''}${obj.approvedBy?' · approved by '+esc(obj.approvedBy):''}</span></div>`;
    if(!evs.length) return head+'<div class="prov-empty">No recorded source — this object was entered directly.</div>';
    const rows = evs.map(e=>{
      const loc = e.location ? Object.entries(e.location).filter(([k,v])=>v!=null).map(([k,v])=>`${k} ${v}`).join(', ') : '';
      return `<div class="prov-ev">
        <div class="prov-ev-h">${esc(e.documentName||e.sourceType||'source')}${e.speaker?' · '+esc(e.speaker):''}${loc?' · '+esc(loc):''}</div>
        ${e.originalText?`<div class="prov-ev-q">“${esc(e.originalText)}”</div>`:''}
        <div class="prov-ev-m">${esc(e.extractionMethod||'')}${e.confidence!=null?' · confidence '+Math.round(e.confidence*100)+'%':''}</div>
      </div>`;
    }).join('');
    return head+`<div class="prov-evlist">${rows}</div>`;
  }
  function fmt(iso){ try{ return new Date(iso).toISOString().slice(0,10); }catch(e){ return iso||''; } }

  // Aggregate trust/status across a project (for the dashboard, Milestone 6).
  function summarize(projectId){
    const M=root.Model; if(!M) return null;
    const objs=M.listObjects(projectId), byClass={}, byStatus={};
    objs.forEach(o=>{ byClass[o.provenance]=(byClass[o.provenance]||0)+1; byStatus[o.status]=(byStatus[o.status]||0)+1; });
    const withEvidence=objs.filter(o=>(o.evidence||[]).length>0).length;
    return { total:objs.length, withEvidence,
      evidenceCoverage: objs.length? Math.round(withEvidence/objs.length*100):0, byClass, byStatus };
  }

  const Provenance = { CLASS_META, STATUS_META, classMeta, statusMeta, badge, statusBadge, originBadge, evidenceHtml, summarize };
  root.Provenance = Provenance;
  if(typeof module!=='undefined' && module.exports) module.exports = Provenance;
})(typeof globalThis!=='undefined' ? globalThis : this);
