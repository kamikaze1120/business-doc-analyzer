/* ============================================================
   PORTABILITY (Milestone 3 / audit Phase 14) — versioned export/import
   for the Project Truth Model.

   Fixes Confirmed Issue 3 (the PTM had no export/import at all). Produces
   a self-describing package (schemaVersion, project, objects, relationships,
   evidence-in-objects, version-history-in-objects, snapshots) and imports
   it as UNTRUSTED input:
     - safe JSON parse that strips __proto__/constructor/prototype keys
       (prototype-pollution guard);
     - structural + type + relationship validation before anything is
       written; invalid relationships are dropped with a warning rather
       than corrupting the graph;
     - the current truth store is backed up before an import is applied,
       so a bad import is recoverable;
     - id collisions are handled by assigning a fresh project id.
   No imported content is ever executed. DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  const PKG_KIND='bda-project-package';
  const SCHEMA=1;
  const TRUTH_KEY='bda:truth:v1';
  const BACKUP_KEY='bda:truth:backup:v1';
  function M(){ return root.Model; }
  function AS(){ return root.AppStorage; }
  function clone(x){ return JSON.parse(JSON.stringify(x)); }

  // JSON.parse with a reviver that removes keys that enable prototype pollution.
  function safeParse(text){
    return JSON.parse(text, (k,v)=> (k==='__proto__'||k==='constructor'||k==='prototype') ? undefined : v);
  }

  /* ---- export ---- */
  function exportProject(projectId){
    const p=M().getProject(projectId); if(!p) return null;
    let snapshots=[];
    if(root.Versioning && root.Versioning.getSnapshot){
      snapshots=(root.Versioning.listSnapshots(projectId)||[]).map(s=>root.Versioning.getSnapshot(projectId,s.id)).filter(Boolean);
    }
    return clone({
      kind:PKG_KIND, schemaVersion:SCHEMA, exportedAt:new Date().toISOString(),
      project:{ id:p.id, name:p.name, meta:p.meta, createdAt:p.createdAt, updatedAt:p.updatedAt,
        version:p.version, counters:p.counters, migratedFrom:p.migratedFrom },
      objects:p.objects, relationships:p.relationships||[], snapshots
    });
  }
  function exportAllProjects(){
    return { kind:'bda-project-bundle', schemaVersion:SCHEMA, exportedAt:new Date().toISOString(),
      projects: M().listProjects().map(p=>exportProject(p.id)) };
  }

  /* ---- validate (untrusted) ---- */
  function validatePackage(pkg){
    const errors=[], warnings=[];
    if(!pkg || typeof pkg!=='object' || Array.isArray(pkg)) return {ok:false, errors:['package is not an object']};
    if(pkg.kind!==PKG_KIND) errors.push('unrecognized package kind: '+pkg.kind);
    if(typeof pkg.schemaVersion!=='number') errors.push('missing schemaVersion');
    else if(pkg.schemaVersion>SCHEMA) errors.push('schemaVersion '+pkg.schemaVersion+' is newer than supported ('+SCHEMA+')');
    if(!pkg.project || typeof pkg.project!=='object') errors.push('missing project');
    else { if(!pkg.project.id) errors.push('project has no id'); if(!pkg.project.name) warnings.push('project has no name'); }
    const objs=pkg.objects;
    if(!objs || typeof objs!=='object' || Array.isArray(objs)) errors.push('objects must be an object map');
    else {
      const TYPES=M().OBJECT_TYPES, STATUS=M().STATUS;
      Object.keys(objs).forEach(id=>{ const o=objs[id];
        if(!o || typeof o!=='object'){ errors.push('object '+id+' is not an object'); return; }
        if(o.id!==id) warnings.push('object key '+id+' does not match its id '+o.id);
        if(TYPES.indexOf(o.type)<0) errors.push('object '+id+' has unknown type: '+o.type);
        if(o.status && STATUS.indexOf(o.status)<0) warnings.push('object '+id+' has unknown status: '+o.status);
      });
    }
    if(pkg.relationships!=null && !Array.isArray(pkg.relationships)) errors.push('relationships must be an array');
    const relCount = Array.isArray(pkg.relationships)?pkg.relationships.length:0;
    return { ok:errors.length===0, errors, warnings,
      counts:{ objects: objs&&typeof objs==='object'?Object.keys(objs).length:0, relationships:relCount } };
  }

  function backup(){ try{ const cur=AS().getJSON(TRUTH_KEY,null); AS().setJSON(BACKUP_KEY,{at:new Date().toISOString(), data:cur}); return true; }catch(e){ return false; } }
  function restoreBackup(){ const b=AS().getJSON(BACKUP_KEY,null); if(b&&b.data){ AS().setJSON(TRUTH_KEY,b.data); return true; } return false; }

  /* ---- import (untrusted) ---- */
  function importProject(input, opts){
    opts=opts||{};
    let pkg;
    try{ pkg = typeof input==='string' ? safeParse(input) : input; }
    catch(e){ return {ok:false, errors:['not valid JSON: '+e.message]}; }
    const v=validatePackage(pkg);
    if(!v.ok) return {ok:false, errors:v.errors, warnings:v.warnings};

    backup();   // recoverable before we touch anything

    // id-collision handling: rename the project if its id already exists.
    let pid=pkg.project.id; const existed=!!M().getProject(pid);
    if(existed) pid = root.UID.nsid('proj');

    // keep only relationships whose endpoints exist and whose type/endpoints are valid
    const objs=clone(pkg.objects);
    const validRel=[]; const droppedRel=[];
    (pkg.relationships||[]).forEach(r=>{
      if(!r || !objs[r.from] || !objs[r.to] || M().REL_TYPES.indexOf(r.type)<0){ droppedRel.push(r); return; }
      if(root.Relationships){ const rv=root.Relationships.validate(objs[r.from].type, objs[r.to].type, r.type); if(!rv.ok){ droppedRel.push(r); return; } }
      validRel.push({ id:(r.id||root.UID.nsid('rel')), from:r.from, to:r.to, type:r.type, createdAt:r.createdAt||new Date().toISOString() });
    });

    const d=M()._db();
    d.projects[pid] = {
      id:pid, name:pkg.project.name||'Imported project', meta:pkg.project.meta||{},
      createdAt:pkg.project.createdAt||new Date().toISOString(), updatedAt:new Date().toISOString(),
      version:pkg.project.version||1, objects:objs, relationships:validRel,
      counters:pkg.project.counters||{}, migratedFrom:pkg.project.migratedFrom||null,
      importedFrom:{ at:new Date().toISOString(), originalId:pkg.project.id }
    };
    M()._persist(d);

    if(root.Versioning && Array.isArray(pkg.snapshots)) { try{ root.Versioning.setProjectSnapshots(pid, pkg.snapshots); }catch(e){} }

    return { ok:true, projectId:pid, renamed: existed?{from:pkg.project.id, to:pid}:null,
      counts:{ objects:Object.keys(objs).length, relationships:validRel.length },
      droppedRelationships:droppedRel.length, warnings:v.warnings };
  }

  const Portability = { PKG_KIND, SCHEMA, safeParse, exportProject, exportAllProjects, validatePackage, importProject, backup, restoreBackup };
  root.Portability = Portability;
  if(typeof module!=='undefined' && module.exports) module.exports = Portability;
})(typeof globalThis!=='undefined' ? globalThis : this);
