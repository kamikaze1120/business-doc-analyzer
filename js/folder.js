/* ============================================================
   FOLDER CONNECT — optional, one-click bulk ingest of a local folder.

   The browser does NOT allow silent whole-device access (a hard security
   boundary), but the File System Access API lets the user pick a folder
   ONCE; the tool then recursively reads every supported document in it and
   auto-ingests each into the Brain AND the Project Truth Model. The folder
   handle is remembered (IndexedDB) so a later visit is a single "Re-scan".

   • Chrome/Edge, served over https (e.g. GitHub Pages): full connect +
     remember + re-scan via window.showDirectoryPicker.
   • Other browsers / file://: falls back to a one-time folder picker
     (<input webkitdirectory>). Everything stays local — nothing is uploaded.

   The core (ingestFileList) is UI-agnostic and unit-tested via a file input.
   ============================================================ */
;(function(root){
  'use strict';
  const SUPPORT = (typeof window!=='undefined') && typeof window.showDirectoryPicker==='function';
  const EXT = /\.(docx|xlsx|xls|csv|txt|md|pdf)$/i;

  /* ---- remembered directory handle (IndexedDB; handles aren't JSON) ---- */
  function idb(){ return new Promise((res,rej)=>{ if(typeof indexedDB==='undefined') return rej(new Error('no indexedDB'));
    const r=indexedDB.open('bda-fs',1); r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains('handles')) r.result.createObjectStore('handles'); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function saveHandle(h){ try{ const db=await idb(); await new Promise((res,rej)=>{ const t=db.transaction('handles','readwrite'); t.objectStore('handles').put(h,'root'); t.oncomplete=res; t.onerror=()=>rej(t.error); }); }catch(e){} }
  async function loadHandle(){ try{ const db=await idb(); return await new Promise(res=>{ const t=db.transaction('handles','readonly'); const rq=t.objectStore('handles').get('root'); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>res(null); }); }catch(e){ return null; } }
  async function hasConnected(){ return !!(await loadHandle()); }

  async function collect(dirHandle, out){
    for await (const entry of dirHandle.values()){
      if(entry.kind==='file'){ if(EXT.test(entry.name)){ try{ out.push(await entry.getFile()); }catch(e){} } }
      else if(entry.kind==='directory'){ await collect(entry, out); }
    }
    return out;
  }

  // One Truth-Model project aggregates everything from the connected folder.
  function folderProject(name){
    if(typeof Model==='undefined') return null;
    let p=Model.listProjects().find(x=>x.meta&&x.meta.folderConnect);
    if(!p) p=Model.createProject({name:name||'Connected folder', meta:{project:name||'Connected folder', folderConnect:true}});
    return p;
  }

  /* ---- core: ingest a list of File objects (UI-agnostic, testable) ---- */
  async function ingestFileList(files, opts){
    opts=opts||{};
    const all=[...files].filter(Boolean);
    const list=all.filter(f=>EXT.test(f.name||''));       // unsupported types auto-excluded
    const res={ total:list.length, unsupported: all.length-list.length, ingested:0, skipped:0, brain:0, ptm:0, duplicatesRemoved:0, errors:[] };
    const proj = (typeof Ingest!=='undefined') ? folderProject(opts.folderName) : null;
    for(const f of list){
      try{
        const text = await readFile(f);
        if(!text || text.trim().length<40){ res.skipped++; continue; }
        analyze(text, f.name, f.size||text.length, {silent:true});   // build STATE without rendering
        if(typeof brainIngest==='function' && typeof brainOn==='function' && brainOn()){ try{ await brainIngest(); res.brain++; }catch(e){} }
        if(proj && typeof Ingest!=='undefined'){ try{ Ingest.fromAnalysis(proj.id, STATE); res.ptm++; }catch(e){} }
        res.ingested++;
        if(opts.onProgress) opts.onProgress(res.ingested, res.total, f.name);
      }catch(e){ res.errors.push((f.name||'file')+': '+e.message); res.skipped++; }
    }
    // Auto-remove duplicate documents that bulk ingest may have produced.
    if(typeof Store!=='undefined' && Store.removeDuplicates){ try{ res.duplicatesRemoved=Store.removeDuplicates().removed; }catch(e){} }
    res.projectId = proj ? proj.id : null;
    return res;
  }

  /* ---- pickers ---- */
  async function connect(opts){
    if(!SUPPORT) return {ok:false, unsupported:true};
    let dir; try{ dir=await window.showDirectoryPicker(); }catch(e){ return {ok:false, cancelled:true}; }
    await saveHandle(dir);
    const files=await collect(dir, []);
    return {ok:true, folder:dir.name, result:await ingestFileList(files, Object.assign({folderName:dir.name}, opts))};
  }
  async function rescan(opts){
    const h=await loadHandle(); if(!h) return {ok:false, none:true};
    try{ if(h.queryPermission){ let perm=await h.queryPermission({mode:'read'});
      if(perm!=='granted' && h.requestPermission){ perm=await h.requestPermission({mode:'read'}); }
      if(perm && perm!=='granted') return {ok:false, denied:true}; } }catch(e){ return {ok:false, denied:true}; }
    const files=await collect(h, []);
    return {ok:true, folder:h.name, result:await ingestFileList(files, Object.assign({folderName:h.name}, opts))};
  }

  const Folder = { SUPPORT, EXT, ingestFileList, connect, rescan, hasConnected, loadHandle, folderProject };
  root.Folder = Folder;
  if(typeof module!=='undefined' && module.exports) module.exports = Folder;
})(typeof globalThis!=='undefined' ? globalThis : this);
