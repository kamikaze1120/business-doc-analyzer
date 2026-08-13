/* ============================================================
   ACTIVE KNOWLEDGE — the brain informs each new document.

   For the document currently open, this cross-references it against
   everything already stored in the brain and surfaces:
     • Related documents (which stored docs share entities, and which)
     • Recognized entities (things already seen in other documents)
     • Completeness suggestions (sections that similar documents in the
       brain have but this one is missing)
   Pure set-logic over the Store — no AI, works before or after you
   click "Add to Brain".
   ============================================================ */

function _curEntityIds(s){
  const ids=new Set();
  (s.el.stakeholders||[]).forEach(x=> ids.add('stakeholder:'+Store.slug(x.role)));
  (typeof cleanActors==='function'?cleanActors(s.actors):s.actors||[]).forEach(a=> ids.add('actor:'+Store.slug(a)));
  (typeof extractSystems==='function'?extractSystems(s):[]).forEach(sy=> ids.add('system:'+Store.slug(sy)));
  (typeof cleanMetrics==='function'?cleanMetrics(s.el.metrics):s.el.metrics||[]).forEach(m=> ids.add('metric:'+Store.slug(m.name)));
  return ids;
}

function brainConnections(){
  const s=STATE;
  const curSlug = Store.slug(s.meta.title || s.fileName);
  const ix = Store.index(); const docs = ix.docs||{}; const nodes = ix.nodes||{};
  const curIds = _curEntityIds(s);

  // Related documents: which other stored docs share which of our entities
  const shareByDoc = {};
  curIds.forEach(eid=>{ const n=nodes[eid]; if(!n) return;
    n.docs.forEach(d=>{ if(d===curSlug) return; (shareByDoc[d]=shareByDoc[d]||[]).push(n); }); });
  const related = Object.entries(shareByDoc)
    .map(([d,ns])=>({doc:docs[d], shared:ns})).filter(r=>r.doc)
    .sort((a,b)=>b.shared.length-a.shared.length);

  // Recognized entities: ours that also live in other documents
  const recognized = [...curIds].map(id=>nodes[id]).filter(n=>n && n.docs.some(d=>d!==curSlug))
    .map(n=>({title:n.title, type:n.type, docs:n.docs.filter(d=>d!==curSlug).length}))
    .sort((a,b)=>b.docs-a.docs);

  // Completeness suggestions vs. other documents of the SAME type
  const sameType = Object.values(docs).filter(d=>d.id!==curSlug && d.docType===s.docType.id);
  const suggestions=[];
  if(sameType.length){
    const cats=[['risks','Risks'],['milestones','Milestones'],['stakeholders','Stakeholders'],
      ['objectives','Objectives'],['metrics','Metrics / KPIs'],['scopeOut','Out-of-scope items']];
    cats.forEach(([key,label])=>{
      const curHas=(s.el[key]||[]).length>0;
      const othersWith=sameType.filter(d=>d.counts && d.counts[key]>0).length;
      if(!curHas && othersWith/sameType.length>=0.5) suggestions.push({label, othersWith, total:sameType.length});
    });
  }
  const otherDocCount = Object.keys(docs).filter(id=>id!==curSlug).length;
  return {related, recognized, sameType:sameType.length, suggestions, otherDocCount};
}

function goToBrainNote(id, type){
  if(typeof setMode==='function') setMode('brain');
  setTimeout(()=>{ try{ openNote(id, type); }catch(e){} }, 350);
}

function renderConnections(){
  const host=E('p-connections');
  const c=brainConnections();
  const s=STATE;
  const typeName=s.docType.name;

  const relHtml = c.related.length ? c.related.map(r=>`
    <div class="conn-row">
      <span class="node-chip doc" onclick="goToBrainNote('${esc(r.doc.id)}','document')">${esc(r.doc.title)}
        <span class="dim">· ${esc(r.doc.docTypeName||r.doc.docType||'')}</span></span>
      <span class="conn-shared">${r.shared.map(n=>`<span class="chip">${ENTITY_META&&ENTITY_META[n.type]?ENTITY_META[n.type].icon+' ':''}${esc(n.title)}</span>`).join('')}</span>
    </div>`).join('')
    : '<div class="dim" style="padding:6px">No direct overlap with other documents yet.</div>';

  const recHtml = c.recognized.length ? `<div class="card">${c.recognized.map(n=>
      `<span class="node-chip" onclick="goToBrainNote('${esc(n.type+':'+Store.slug(n.title))}','${esc(n.type)}')">${ENTITY_META&&ENTITY_META[n.type]?ENTITY_META[n.type].icon+' ':''}${esc(n.title)} <span class="pill hot">${n.docs} doc${n.docs===1?'':'s'}</span></span>`).join('')}</div>`
    : '<div class="dim" style="padding:6px">Nothing in this document has been seen in your brain before.</div>';

  const sugHtml = c.suggestions.length ? `<div class="card"><ul class="itemlist warn">${c.suggestions.map(g=>
      `<li><span class="li-main">${g.othersWith} of ${g.total} similar ${esc(typeName)}${g.total===1?'':'s'} in your brain include <strong>${esc(g.label)}</strong> — this one has none. Consider adding it.</span></li>`).join('')}</ul></div>`
    : (c.sameType? '<div class="dim" style="padding:6px">This document is as complete as similar ones in your brain. ✓</div>'
                 : '<div class="dim" style="padding:6px">No other '+esc(typeName)+' documents in your brain to compare against yet.</div>');

  host.innerHTML = `
  <div class="card typecard">
    <div class="tc-icon">🧠</div>
    <div class="tc-main">
      <div class="tc-label">From your brain</div>
      <div class="tc-name">Connected to ${c.related.length} of ${c.otherDocCount} other document${c.otherDocCount===1?'':'s'}</div>
      <div class="dim" style="font-size:12px">${c.recognized.length} recognized entit${c.recognized.length===1?'y':'ies'} · compared against ${c.sameType} similar ${esc(typeName)}${c.sameType===1?'':'s'}</div>
    </div>
  </div>
  <h3 class="sec">Related documents</h3>
  <div class="card" style="padding:10px">${relHtml}</div>
  <h3 class="sec">Recognized from your brain</h3>
  ${recHtml}
  <h3 class="sec">Suggestions</h3>
  ${sugHtml}`;
}

/* Show the tab only when the brain holds at least one OTHER document. */
if(typeof VIEWS!=='undefined'){
  VIEWS.connections = { label:'🧠 Connections', render:renderConnections,
    has:()=>{ try{ if(!Store.available()) return false; const m=Store.docMeta();
      const cur=Store.slug(STATE.meta.title||STATE.fileName);
      return Object.keys(m).some(id=>id!==cur); }catch(e){ return false; } } };
}
