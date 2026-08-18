/* ============================================================
   VERSIONING (Phase 14) — object history + project snapshots.

   Object-level history lives on each object (Model.historyOf / rollback).
   This module adds PROJECT-level snapshots: a point-in-time baseline you
   can label, diff, summarise, and roll back to. Historical data is never
   overwritten without first snapshotting the current state, so a rollback
   is itself reversible. Snapshots persist through AppStorage under their
   own key, DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  const KEY='bda:truth:snap:v1';
  function M(){ return root.Model; }
  function ST(){ return root.AppStorage; }
  function all(){ return ST().getJSON(KEY, {})||{}; }
  function save(o){ ST().setJSON(KEY,o); }

  function counts(project){ const c={}; Object.values(project.objects).forEach(o=>c[o.type]=(c[o.type]||0)+1); return c; }

  function snapshot(projectId, label, by){
    const p=M().getProject(projectId); if(!p) throw new Error('no such project');
    const store=all(); store[projectId]=store[projectId]||[];
    const snap={ id:root.UID.nsid('snap'), label:label||('Snapshot '+(store[projectId].length+1)),
      at:new Date().toISOString(), by:by||'user', counts:counts(p),
      objects: JSON.parse(JSON.stringify(p.objects)), relationships: JSON.parse(JSON.stringify(p.relationships||[])) };
    // change summary vs the previous snapshot
    const prev=store[projectId][store[projectId].length-1];
    snap.summary = prev ? changeSummary(diffObjects(prev.objects, snap.objects)) : 'initial snapshot';
    store[projectId].push(snap); save(store);
    return { id:snap.id, label:snap.label, at:snap.at, counts:snap.counts, summary:snap.summary };
  }
  function listSnapshots(projectId){ return (all()[projectId]||[]).map(s=>({id:s.id,label:s.label,at:s.at,by:s.by,counts:s.counts,summary:s.summary})); }
  function getSnapshot(projectId, snapId){ return (all()[projectId]||[]).find(s=>s.id===snapId)||null; }

  // Compare two object maps → added / removed / modified (by id and version).
  function diffObjects(a, b){
    const added=[], removed=[], modified=[];
    Object.keys(b).forEach(id=>{ if(!a[id]) added.push(b[id]);
      else if(a[id].version!==b[id].version || a[id].title!==b[id].title || a[id].description!==b[id].description || a[id].status!==b[id].status) modified.push({id, from:a[id], to:b[id]}); });
    Object.keys(a).forEach(id=>{ if(!b[id]) removed.push(a[id]); });
    return { added, removed, modified };
  }
  function changeSummary(diff){
    const parts=[];
    if(diff.added.length) parts.push('+ '+diff.added.length+' added');
    if(diff.modified.length) parts.push('~ '+diff.modified.length+' modified');
    if(diff.removed.length) parts.push('- '+diff.removed.length+' removed');
    return parts.length?parts.join(', '):'no changes';
  }
  // Diff a snapshot against another snapshot, or against the live project ("current").
  function diff(projectId, fromSnapId, toSnapId){
    const from=getSnapshot(projectId, fromSnapId); if(!from) throw new Error('no such snapshot');
    const to = toSnapId ? getSnapshot(projectId, toSnapId) : { objects:(M().getProject(projectId)||{}).objects||{} };
    const d=diffObjects(from.objects, to.objects);
    return { added:d.added.map(o=>({id:o.id,displayId:o.displayId,type:o.type})),
      removed:d.removed.map(o=>({id:o.id,displayId:o.displayId,type:o.type})),
      modified:d.modified.map(m=>({id:m.id,displayId:m.to.displayId,type:m.to.type,fromVersion:m.from.version,toVersion:m.to.version})),
      summary:changeSummary(d) };
  }

  // Restore a project to a snapshot. Takes an automatic snapshot of the
  // current state first, so the rollback is itself reversible.
  function rollbackToSnapshot(projectId, snapId, by){
    const snap=getSnapshot(projectId, snapId); if(!snap) throw new Error('no such snapshot');
    snapshot(projectId, 'auto-backup before rollback', by||'system');
    const p=M().getProject(projectId);
    p.objects = JSON.parse(JSON.stringify(snap.objects));
    p.relationships = JSON.parse(JSON.stringify(snap.relationships||[]));
    M().saveProject(p);
    return { restored:snapId, objects:Object.keys(p.objects).length };
  }

  // Replace the snapshot list for a project (used by project import to
  // restore an imported package's snapshots under the new project id).
  function setProjectSnapshots(projectId, snaps){ const store=all(); store[projectId]=Array.isArray(snaps)?snaps:[]; save(store); return store[projectId].length; }

  const Versioning = { snapshot, listSnapshots, getSnapshot, diff, diffObjects, changeSummary, rollbackToSnapshot, setProjectSnapshots };
  root.Versioning = Versioning;
  if(typeof module!=='undefined' && module.exports) module.exports = Versioning;
})(typeof globalThis!=='undefined' ? globalThis : this);
