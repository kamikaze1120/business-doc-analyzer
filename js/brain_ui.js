/* ============================================================
   BRAIN UI — browse the persistent vault: documents, cross-document
   entities, and the linked notes on disk. Rendered into #brain.
   ============================================================ */

let BRAIN = null;                 // last-loaded index
const ENTITY_META = {
  stakeholder:{icon:'👤', label:'Stakeholders'},
  actor:{icon:'🎭', label:'Actors'},
  system:{icon:'🔌', label:'Systems / Integrations'},
  metric:{icon:'📈', label:'Metrics / KPIs'}
};

async function renderBrain(){
  const host = E('brain');
  host.innerHTML = '<div class="empty"><span class="spin"></span> Loading the brain…</div>';
  let ix;
  try{ ix = await brainIndex(); }catch(e){ host.innerHTML = emptyMsg('Could not reach the brain. Is the server running?'); return; }
  BRAIN = ix;
  const st = ix.stats || {documents:0, entities:0, byType:{}};
  const docs = Object.values(ix.docs||{});
  const nodes = Object.values(ix.nodes||{});
  const recurring = nodes.filter(n=>n.docs.length>1);

  if(!docs.length){
    host.innerHTML = `<div class="card" style="text-align:center;padding:48px">
      <div style="font-size:34px">🧠</div>
      <h3 style="margin:10px 0 6px">The brain is empty</h3>
      <p class="dim">Analyze a document, then click <strong>＋ Add to Brain</strong>. Every document you add is
      stored on disk as linked notes, and shared entities (stakeholders, systems, actors, metrics) start
      cross-referencing across your documents.</p></div>`;
    return;
  }

  const byType = ix.stats.byType||{};
  host.innerHTML = `
  <div class="grid g4" style="margin-bottom:6px">
    <div class="card"><div class="kpi acc">${st.documents}</div><div class="klabel">Documents</div></div>
    <div class="card"><div class="kpi">${st.entities}</div><div class="klabel">Entities</div></div>
    <div class="card"><div class="kpi ${recurring.length?'ok':''}">${recurring.length}</div><div class="klabel">Cross-referenced</div></div>
    <div class="card"><div class="kpi">${(ix.edges||[]).length}</div><div class="klabel">Connections</div></div>
  </div>
  <div class="toolbar"><input type="search" id="brainq" placeholder="Search the brain…"><span class="dim" id="braincount"></span></div>
  <div class="brain-grid">
    <div>
      <h3 class="sec">Documents (${docs.length})</h3>
      <div class="card" id="braindocs" style="padding:8px"></div>
      ${recurring.length?`<h3 class="sec">Cross-referenced entities</h3>
        <div class="card" id="brainrec" style="padding:8px"></div>`:''}
      ${Object.keys(ENTITY_META).map(t=>byType[t]?`
        <h3 class="sec">${ENTITY_META[t].icon} ${ENTITY_META[t].label} (${byType[t]})</h3>
        <div class="card" id="brain-${t}" style="padding:8px"></div>`:'').join('')}
    </div>
    <div>
      <h3 class="sec">Note</h3>
      <div class="card" id="brainnote"><div class="dim">Select a document or entity to open its note.</div></div>
    </div>
  </div>`;

  const linkChip=(title,id,type)=>`<span class="node-chip" data-id="${esc(id)}" data-type="${esc(type)}">${esc(title)}</span>`;
  const docChip=d=>`<span class="node-chip doc" data-id="${esc(d.id)}" data-type="document" title="${esc(d.file||'')}">
      ${esc(d.title)} <span class="dim">· ${esc(d.docTypeName||d.docType||'')}</span></span>`;
  const entChip=n=>`<span class="node-chip" data-id="${esc(n.id)}" data-type="${esc(n.type)}">
      ${ENTITY_META[n.type]?ENTITY_META[n.type].icon:''} ${esc(n.title)} ${n.docs.length>1?`<span class="pill hot">${n.docs.length} docs</span>`:''}</span>`;

  const draw=(q='')=>{
    q=q.toLowerCase();
    const dm=docs.filter(d=>d.title.toLowerCase().includes(q));
    E('braindocs').innerHTML = dm.map(docChip).join('') || '<span class="dim">No matches</span>';
    if(E('brainrec')) E('brainrec').innerHTML = recurring.filter(n=>n.title.toLowerCase().includes(q)).map(entChip).join('')||'<span class="dim">No matches</span>';
    Object.keys(ENTITY_META).forEach(t=>{ const el=E('brain-'+t); if(!el) return;
      el.innerHTML = nodes.filter(n=>n.type===t && n.title.toLowerCase().includes(q)).map(entChip).join('')||'<span class="dim">No matches</span>'; });
    const total = dm.length;
    E('braincount').textContent = q?`${total} document match${total===1?'':'es'}`:'';
  };
  draw();
  E('brainq').addEventListener('input', e=>draw(e.target.value));
  host.querySelectorAll('.node-chip').forEach(bindChip);
}

function bindChip(el){
  el.onclick = ()=>openNote(el.dataset.id, el.dataset.type);
}

async function openNote(id, type){
  const box = E('brainnote');
  box.innerHTML = '<div class="dim"><span class="spin"></span> Loading…</div>';
  try{
    const r = await brainNote(id, type==='document'?'document':'');
    if(!r.ok){ box.innerHTML = emptyMsg('Note not found.'); return; }
    box.innerHTML = mdToHtml(r.md);
    box.querySelectorAll('.wikilink').forEach(a=>{
      a.onclick = ()=>{ const res=resolveTitle(a.dataset.title); if(res) openNote(res.id, res.type); };
    });
  }catch(e){ box.innerHTML = emptyMsg('Could not load note.'); }
}

/* Resolve a [[Title]] to a node or document id using the loaded index. */
function resolveTitle(title){
  if(!BRAIN) return null;
  const t=(title||'').toLowerCase();
  const doc=Object.values(BRAIN.docs||{}).find(d=>d.title.toLowerCase()===t);
  if(doc) return {id:doc.id, type:'document'};
  const node=Object.values(BRAIN.nodes||{}).find(n=>n.title.toLowerCase()===t);
  if(node) return {id:node.id, type:node.type};
  return null;
}

/* Minimal, safe markdown → HTML (headings, bold, lists, inline code, [[wikilinks]]). */
function mdToHtml(md){
  md = md.replace(/^---\n[\s\S]*?\n---\n/, '');   // strip frontmatter
  const inline = s => esc(s)
    .replace(/\[\[([^\]]+)\]\]/g, (m,t)=>`<span class="wikilink" data-title="${esc(t)}">${esc(t)}</span>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const out=[]; let inList=false;
  md.split('\n').forEach(line=>{
    if(/^\s*-\s+/.test(line)){ if(!inList){ out.push('<ul class="itemlist">'); inList=true; } out.push('<li><span class="li-main">'+inline(line.replace(/^\s*-\s+/,''))+'</span></li>'); return; }
    if(inList){ out.push('</ul>'); inList=false; }
    if(/^#\s+/.test(line)) out.push('<h2 style="margin:2px 0 10px">'+inline(line.replace(/^#\s+/,''))+'</h2>');
    else if(/^##\s+/.test(line)) out.push('<h3 class="sec" style="margin:16px 0 8px">'+inline(line.replace(/^##\s+/,''))+'</h3>');
    else if(line.trim()==='') out.push('<div style="height:6px"></div>');
    else out.push('<div style="font-size:12.8px;line-height:1.6">'+inline(line)+'</div>');
  });
  if(inList) out.push('</ul>');
  return out.join('');
}
