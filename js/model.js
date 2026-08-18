/* ============================================================
   PROJECT TRUTH MODEL (PTM) — the single source of truth.

   Documents are GENERATED REPRESENTATIONS of this model, never the
   other way around. Every extracted, generated, or hand-entered fact
   becomes a structured object with an immutable UUID, a separate
   (mutable) display id, provenance, lifecycle status, evidence, and
   graph relationships.

   This module is the canonical data layer. It has NO DOM dependency
   and persists through AppStorage, so it runs in the browser and in
   Node tests alike. Later milestones (evidence UI, gap/conflict
   engines, change-impact, document factory, agents, dashboard) all
   read and write THIS model — they must never invent a parallel store.
   ============================================================ */
;(function(root){
  'use strict';
  const KEY = 'bda:truth:v1';
  const SCHEMA_VERSION = 1;

  /* ---- canonical taxonomy (Phase 1) ---- */
  // type -> display-id prefix. Display ids are generated and may change;
  // they are NEVER the object's identity (that is the UUID).
  const DISPLAY_PREFIX = {
    business_objective:'OBJ', business_problem:'PROB',
    scope_in:'SCIN', scope_out:'SCOUT',
    stakeholder:'STK', persona:'PER', actor:'ACT', department:'DEPT',
    process:'PROC', process_step:'STEP',
    business_requirement:'BR', functional_requirement:'FR',
    non_functional_requirement:'NFR', integration_requirement:'INT',
    data_requirement:'DR', reporting_requirement:'RPT',
    business_rule:'BRULE', user_story:'US', use_case:'UC', acceptance_criteria:'AC',
    system:'SYS', application:'APP', integration:'IGN', api:'API',
    data_entity:'ENT', data_field:'FLD',
    decision:'DEC', assumption:'ASM', dependency:'DEP', risk:'RISK', constraint:'CON',
    metric:'MET', kpi:'KPI', open_question:'Q', conflict:'CFL',
    test_scenario:'TS', test_case:'TC', generated_document:'DOC'
  };
  const OBJECT_TYPES = Object.keys(DISPLAY_PREFIX);

  // Lifecycle / workflow status (Phase 13).
  const STATUS = ['draft','ai_proposed','under_review','approved','rejected','deprecated','archived'];
  // Epistemic classification — how much do we trust this? (Phase 2/critical rules)
  const PROVENANCE = ['fact','ai_inference','assumption','stakeholder_statement','open_question','conflict'];
  // Relationship / traceability edge types (Phase 5).
  const REL_TYPES = ['implements','satisfies','uses','governed_by','validated_by','tested_by',
    'derived_from','depends_on','conflicts_with','part_of','owns','relates_to','supersedes','traces_to'];

  function now(){ return new Date().toISOString(); }
  function ST(){ return root.AppStorage; }
  function UUID(){ return root.UID.uuid(); }

  /* ---- persistence ---- */
  function db(){
    let d = ST().getJSON(KEY, null);
    if(!d || typeof d!=='object'){ d = { schemaVersion:SCHEMA_VERSION, projects:{} }; }
    if(!d.projects) d.projects={};
    if(d.schemaVersion==null) d.schemaVersion=SCHEMA_VERSION;
    return d;
  }
  function persist(d){ d.schemaVersion=SCHEMA_VERSION; return ST().setJSON(KEY, d); }

  /* ---- projects ---- */
  function listProjects(){ const d=db(); return Object.values(d.projects).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')); }
  function projects(){ return db().projects; }
  function getProject(id){ return db().projects[id]||null; }
  function createProject(input){
    input=input||{};
    const d=db(), id=UID.nsid('proj'), ts=now();
    const p={ id, name:input.name||'Untitled Project', meta:input.meta||{},
      createdAt:ts, updatedAt:ts, version:1,
      objects:{}, relationships:[], counters:{}, migratedFrom:input.migratedFrom||null };
    d.projects[id]=p; persist(d); return p;
  }
  function saveProject(p){ const d=db(); p.updatedAt=now(); d.projects[p.id]=p; persist(d); return p; }
  function deleteProject(id){ const d=db(); delete d.projects[id]; persist(d); }
  function touch(d,p){ p.updatedAt=now(); persist(d); }

  /* ---- display ids (separate from identity, may change) ---- */
  function genDisplayId(p, type){
    const prefix=DISPLAY_PREFIX[type]||'OBJ';
    p.counters=p.counters||{};
    const n=(p.counters[type]||0)+1; p.counters[type]=n;
    return `${prefix}-${String(n).padStart(3,'0')}`;
  }

  /* ---- objects ---- */
  function newEnvelope(p, type, props){
    props=props||{};
    if(!DISPLAY_PREFIX[type]) throw new Error('unknown object type: '+type);
    const ts=now();
    const status = props.status || (props.createdBy==='ai' ? 'ai_proposed' : 'draft');
    return {
      id: UUID(),
      displayId: props.displayId || genDisplayId(p, type),
      type,
      title: props.title||'',
      description: props.description||'',
      status,
      lifecycle: status,                        // mirror; status is canonical
      priority: props.priority||null,
      provenance: PROVENANCE.includes(props.provenance)?props.provenance:(props.createdBy==='ai'?'ai_inference':'fact'),
      sourceType: props.sourceType||null,
      confidence: props.confidence!=null?props.confidence:null,
      createdBy: props.createdBy||'user',
      createdAt: ts, updatedAt: ts,
      approvedBy: null, approvedAt: null,
      evidence: [],
      version: 1,
      attrs: props.attrs||{}                    // type-specific extra fields
    };
  }
  function addObject(projectId, type, props){
    const d=db(), p=d.projects[projectId]; if(!p) throw new Error('no such project: '+projectId);
    const o=newEnvelope(p, type, props);
    if(props && Array.isArray(props.evidence)) props.evidence.forEach(e=>o.evidence.push(makeEvidence(e)));
    pushHistory(o, 'created', o.createdBy, o.sourceType||o.provenance);
    p.objects[o.id]=o; touch(d,p); return o;
  }
  function getObject(projectId, id){ const p=getProject(projectId); return p? (p.objects[id]||null):null; }
  function listObjects(projectId, type){ const p=getProject(projectId); if(!p) return [];
    const arr=Object.values(p.objects); return type? arr.filter(o=>o.type===type):arr; }
  function byDisplayId(projectId, displayId){ return listObjects(projectId).find(o=>o.displayId===displayId)||null; }

  // Update guarded so APPROVED content is never silently overwritten (critical rule 3).
  function updateObject(projectId, id, patch, opts){
    opts=opts||{}; const d=db(), p=d.projects[projectId]; if(!p) throw new Error('no such project');
    const o=p.objects[id]; if(!o) throw new Error('no such object: '+id);
    const substantive = patch && ('title' in patch || 'description' in patch || 'attrs' in patch || 'priority' in patch);
    if(o.status==='approved' && substantive && !opts.force)
      return { blocked:true, reason:'object is approved — pass opts.force or use reviseApproved to change it', object:o };
    const allowed=['title','description','priority','provenance','sourceType','confidence','status','attrs'];
    allowed.forEach(k=>{ if(patch && k in patch) o[k]=patch[k]; });
    if('status' in (patch||{})) o.lifecycle=o.status;
    o.updatedAt=now(); o.version=(o.version||1)+1;
    if(opts.changeReason) o.attrs.lastChangeReason=opts.changeReason;
    pushHistory(o, opts.changeReason||'update', opts.by, opts.source);
    touch(d,p); return { blocked:false, object:o };
  }
  // Object-level version history — never overwrite the past silently (Phase 14).
  // Records who (by) and what source drove the change where available.
  function pushHistory(o, reason, by, source){
    o.attrs=o.attrs||{}; o.attrs.history=o.attrs.history||[];
    o.attrs.history.push({ version:o.version, at:o.updatedAt, changeReason:reason||null,
      by: by||null, source: source||null,
      title:o.title, description:o.description, priority:o.priority, status:o.status });
    if(o.attrs.history.length>30) o.attrs.history.shift();
  }
  function historyOf(projectId, id){ const o=getObject(projectId,id); return (o&&o.attrs&&o.attrs.history)||[]; }
  function rollbackObject(projectId, id, toVersion){
    const h=historyOf(projectId,id).find(v=>v.version===toVersion);
    if(!h) throw new Error('no such version: '+toVersion);
    return updateObject(projectId, id, {title:h.title, description:h.description, priority:h.priority},
      {force:true, changeReason:'rollback to v'+toVersion});
  }
  function reviseApproved(projectId, id, patch, changeReason){
    return updateObject(projectId, id, patch, {force:true, changeReason:changeReason||'revision of approved object'});
  }
  function deleteObject(projectId, id){
    const d=db(), p=d.projects[projectId]; if(!p) return;
    delete p.objects[id];
    p.relationships=(p.relationships||[]).filter(r=>r.from!==id && r.to!==id);
    touch(d,p);
  }

  /* ---- lifecycle / approval (Phase 13) ---- */
  function setStatus(projectId, id, status, by){
    if(!STATUS.includes(status)) throw new Error('bad status: '+status);
    const d=db(), p=d.projects[projectId], o=p&&p.objects[id]; if(!o) throw new Error('no such object');
    o.status=status; o.lifecycle=status; o.updatedAt=now(); o.version=(o.version||1)+1;
    if(status==='approved'){ o.approvedBy=by||'user'; o.approvedAt=now(); }
    pushHistory(o, 'status → '+status, by, 'user');
    touch(d,p); return o;
  }
  function approve(projectId, id, by){ return setStatus(projectId,id,'approved',by); }
  function reject(projectId, id, by){ return setStatus(projectId,id,'rejected',by); }

  /* ---- evidence / provenance (Phase 2) ---- */
  function makeEvidence(e){
    e=e||{};
    return { id: UID.nsid('ev'), sourceId:e.sourceId||null, sourceType:e.sourceType||null,
      documentName:e.documentName||null, location:e.location||null, speaker:e.speaker||null,
      originalText:e.originalText||null, extractionMethod:e.extractionMethod||(e.createdBy==='ai'?'AI':'user'),
      confidence:e.confidence!=null?e.confidence:null, createdAt:now() };
  }
  function addEvidence(projectId, id, e){
    const d=db(), p=d.projects[projectId], o=p&&p.objects[id]; if(!o) throw new Error('no such object');
    const ev=makeEvidence(e); o.evidence.push(ev); o.updatedAt=now(); touch(d,p); return ev;
  }

  /* ---- relationships / traceability graph (Phase 5) ---- */
  function addRelationship(projectId, fromId, toId, type){
    if(!REL_TYPES.includes(type)) throw new Error('bad relationship type: '+type);
    const d=db(), p=d.projects[projectId]; if(!p) throw new Error('no such project');
    if(fromId===toId) return null;                          // reject self-reference
    if(!p.objects[fromId]||!p.objects[toId]) throw new Error('relationship endpoints must exist');
    // Registry validation (when relationships.js is loaded): reject endpoint-type
    // violations rather than silently corrupting the graph.
    if(root.Relationships){
      const v=root.Relationships.validate(p.objects[fromId].type, p.objects[toId].type, type);
      if(!v.ok){ console.warn('addRelationship rejected: '+v.error); return null; }
    }
    p.relationships=p.relationships||[];
    if(p.relationships.some(r=>r.from===fromId&&r.to===toId&&r.type===type)) return null;  // reject duplicate
    const rel={ id:UID.nsid('rel'), from:fromId, to:toId, type, createdAt:now() };
    p.relationships.push(rel); touch(d,p); return rel;
  }
  function removeRelationship(projectId, relId){
    const d=db(), p=d.projects[projectId]; if(!p) return;
    p.relationships=(p.relationships||[]).filter(r=>r.id!==relId); touch(d,p);
  }
  function relationshipsOf(projectId, id){
    const p=getProject(projectId); if(!p) return {upstream:[],downstream:[]};
    const rels=p.relationships||[];
    return { downstream: rels.filter(r=>r.from===id), upstream: rels.filter(r=>r.to===id) };
  }
  function relatedObjects(projectId, id){
    const p=getProject(projectId); if(!p) return [];
    const rels=(p.relationships||[]).filter(r=>r.from===id||r.to===id);
    const ids=new Set(); rels.forEach(r=>{ ids.add(r.from===id?r.to:r.from); });
    return [...ids].map(x=>p.objects[x]).filter(Boolean);
  }

  /* ---- small queries ---- */
  function counts(projectId){ const c={}; listObjects(projectId).forEach(o=>c[o.type]=(c[o.type]||0)+1); return c; }
  function stats(projectId){
    const objs=listObjects(projectId), byStatus={}, byType={};
    objs.forEach(o=>{ byStatus[o.status]=(byStatus[o.status]||0)+1; byType[o.type]=(byType[o.type]||0)+1; });
    const p=getProject(projectId);
    return { objects:objs.length, relationships:(p&&p.relationships||[]).length, byStatus, byType };
  }

  function clearAll(){ ST().remove(KEY); }

  const Model = {
    KEY, SCHEMA_VERSION, OBJECT_TYPES, DISPLAY_PREFIX, STATUS, PROVENANCE, REL_TYPES,
    // projects
    listProjects, projects, getProject, createProject, saveProject, deleteProject,
    // objects
    addObject, getObject, listObjects, byDisplayId, updateObject, reviseApproved, deleteObject, genDisplayId,
    // versioning
    historyOf, rollbackObject,
    // lifecycle
    setStatus, approve, reject,
    // evidence
    addEvidence, makeEvidence,
    // graph
    addRelationship, removeRelationship, relationshipsOf, relatedObjects,
    // queries
    counts, stats, clearAll,
    _db: db, _persist: persist
  };
  root.Model = Model;
  if(typeof module!=='undefined' && module.exports) module.exports = Model;
})(typeof globalThis!=='undefined' ? globalThis : this);
