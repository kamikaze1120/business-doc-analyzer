/* ============================================================
   PROJECTS — guided, AI-optional document builder.

   Pick a document type; the system interviews you section by
   section, informed by the brain's accumulated knowledge and
   (when enabled) an LLM. Answers persist as a project you can
   return to. "Generate" assembles the document and runs the full
   engine over it — requirements, test cases, traceability, gaps.

   Works with no AI (deterministic templates + brain prefills);
   AI enhances by drafting questions/items and expanding the idea.
   ============================================================ */

const PROJECT_TEMPLATES = {
  requirements: { label:'Business Requirements Document (BRD)', sections:[
    {key:'FR', label:'Functional', kind:'req', cat:'FR', q:'What functional capabilities must the system provide?'},
    {key:'NFR',label:'Non-Functional', kind:'req', cat:'NFR', q:'What performance, security, availability, accessibility or compliance needs apply?'},
    {key:'INT',label:'Integration', kind:'req', cat:'INT', q:'What external systems must this integrate with?'},
    {key:'BR', label:'Business Rules', kind:'req', cat:'BR', q:'What business rules, policies, thresholds or constraints govern this?'},
    {key:'scope',label:'Scope', kind:'scope', q:'What is explicitly in and out of scope?'},
    {key:'stakeholders',label:'Stakeholders', kind:'stakeholders', q:'Who are the stakeholders and their roles?'},
    {key:'risks',label:'Risks', kind:'risks', q:'What risks and mitigations should be captured?'}
  ]},
  prd: { label:'Product Requirements Document (PRD)', sections:[
    {key:'objectives',label:'Objectives', kind:'list', q:'What are the product goals / success outcomes?'},
    {key:'personas',label:'Personas', kind:'list', q:'Who are the target users / personas?'},
    {key:'FR', label:'Features', kind:'req', cat:'FR', q:'What features/capabilities must the product provide?'},
    {key:'NFR',label:'Non-Functional', kind:'req', cat:'NFR', q:'What quality attributes (performance, security…) apply?'},
    {key:'metrics',label:'Metrics / KPIs', kind:'list', q:'How will success be measured?'},
    {key:'scope',label:'Scope', kind:'scope', q:'What is in and out of scope?'}
  ]},
  charter: { label:'Project Charter', sections:[
    {key:'objectives',label:'Objectives', kind:'list', q:'What are the project objectives?'},
    {key:'scope',label:'Scope', kind:'scope', q:'What is in and out of scope?'},
    {key:'stakeholders',label:'Stakeholders', kind:'stakeholders', q:'Who are the sponsors, owners and key roles?'},
    {key:'risks',label:'Risks', kind:'risks', q:'What are the key risks and mitigations?'},
    {key:'metrics',label:'Success Measures', kind:'list', q:'How will success be measured?'}
  ]}
};
function projTemplate(t){ return PROJECT_TEMPLATES[t] || PROJECT_TEMPLATES.requirements; }
const PROJ_TYPE_OPTIONS = [['requirements','BRD — Business Requirements'],['prd','PRD — Product Requirements'],['charter','Project Charter']];

let PROJ=null;          // current project id
let PROJ_TAB='setup';   // current sub-tab key

/* ---- brain-informed hints ---- */
function brainKnown(type){ try{ const ix=Store.index();
  return Object.values(ix.nodes||{}).filter(n=>n.type===type).sort((a,b)=>b.docs.length-a.docs.length).map(n=>n.title); }catch(e){ return []; } }
function brainCommonMeta(){ // most frequent author/department across stored docs
  try{ const data=Store.data(); const auth={},dept={};
    Object.values(data).forEach(e=>{}); // meta not stored per-doc entities; fall back to none
  }catch(e){}
  return {};
}
function hintsFor(sec){
  if(sec.key==='INT' || sec.key==='systems') return brainKnown('system');
  if(sec.kind==='stakeholders') return brainKnown('stakeholder');
  if(sec.key==='personas') return brainKnown('actor');
  if(sec.key==='metrics') return brainKnown('metric');
  return [];
}

/* ---- create / open ---- */
function newProject(docType, name){
  const p={ id:'p_'+Date.now().toString(36), name:name|| (projTemplate(docType).label), docType,
    meta:{project:name||'', version:'0.1', author:'', department:'', date:new Date().toISOString().slice(0,10)},
    idea:'', data:{}, status:'draft' };
  Store.saveProject(p); PROJ=p.id; PROJ_TAB='setup'; return p;
}
function curProject(){ return PROJ?Store.getProject(PROJ):null; }
function saveCur(p){ Store.saveProject(p); }

/* ---- main render ---- */
function renderProjects(){
  const host=E('projects');
  host.innerHTML=`
  <div class="proj-wrap">
    <aside class="proj-side">
      <button class="btn sm" id="proj-new" style="width:100%">＋ New document</button>
      <div id="proj-list" class="proj-list"></div>
    </aside>
    <section class="proj-main" id="proj-main"></section>
  </div>`;
  E('proj-new').onclick=renderNewForm;
  renderProjList();
  const p=curProject();
  if(p) renderWorkspace(p); else if(Object.keys(Store.projects()).length) E('proj-main').innerHTML='<div class="empty">Select a project on the left, or start a new document.</div>';
  else renderNewForm();
}
function renderProjList(){
  const list=Store.projects();
  const items=Object.values(list).sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
  E('proj-list').innerHTML = items.length? items.map(p=>`
    <div class="proj-item ${p.id===PROJ?'on':''}" data-id="${p.id}">
      <div class="proj-item-name">${esc(p.meta.project||p.name)}</div>
      <div class="proj-item-sub">${esc(projTemplate(p.docType).label.split(' —')[0].split(' (')[0])} · ${p.status==='complete'?'✓ complete':'draft'}</div>
    </div>`).join('') : '<div class="dim" style="padding:10px;font-size:12px">No projects yet.</div>';
  E('proj-list').querySelectorAll('.proj-item').forEach(el=>el.onclick=()=>{ PROJ=el.dataset.id; PROJ_TAB='setup'; renderProjects(); });
}
function renderNewForm(){
  E('proj-main').innerHTML=`
  <div class="card" style="max-width:520px">
    <h3 style="margin:0 0 12px">Start a new document</h3>
    <div class="kv">
      <div class="k">Type</div><div class="v"><select id="np-type">${PROJ_TYPE_OPTIONS.map(o=>`<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select></div>
      <div class="k">Name</div><div class="v"><input id="np-name" type="text" style="width:100%" placeholder="e.g. Customer Portal BRD"></div>
    </div>
    <div style="margin-top:14px"><button class="btn sm" id="np-create">Create project →</button></div>
    <p class="dim" style="font-size:11.5px;margin-top:12px">The system will interview you section by section using what your brain already knows${AI.available?' and your AI model':''}, then generate a fully-analyzed document with test cases.</p>
  </div>`;
  E('np-create').onclick=()=>{ const t=E('np-type').value, nm=E('np-name').value.trim();
    const p=newProject(t, nm); renderProjects(); };
}

/* ---- workspace (sub-tabs) ---- */
function projTabs(p){
  const t=projTemplate(p.docType);
  return [{key:'setup',label:'Setup'}, {key:'idea',label:'General Idea'}, ...t.sections.map(s=>({key:s.key,label:s.label,sec:s})), {key:'review',label:'Review & Generate'}];
}
function sectionFilled(p, tabKey){
  if(tabKey==='setup') return !!(p.meta.project);
  if(tabKey==='idea') return !!(p.idea && p.idea.length>10);
  if(tabKey==='review') return false;
  if(tabKey==='scope') return (p.data.scopeIn||[]).length+(p.data.scopeOut||[]).length>0;
  return (p.data[tabKey]||[]).length>0;
}
function renderWorkspace(p){
  const tabs=projTabs(p);
  if(!tabs.some(t=>t.key===PROJ_TAB)) PROJ_TAB='setup';
  E('proj-main').innerHTML=`
    <div class="proj-head">
      <input id="pw-name" class="proj-title" value="${esc(p.meta.project||p.name)}">
      <span class="pill">${esc(projTemplate(p.docType).label.split(' (')[0])}</span>
      <button class="btn ghost sm" id="pw-del" style="margin-left:auto">Delete</button>
    </div>
    <div class="proj-tabs">${tabs.map(t=>`<button class="ptab ${t.key===PROJ_TAB?'on':''}" data-k="${t.key}">${sectionFilled(p,t.key)?'✓ ':''}${esc(t.label)}</button>`).join('')}</div>
    <div id="pw-body" class="proj-body"></div>`;
  E('pw-name').onchange=e=>{ p.meta.project=e.target.value; p.name=e.target.value; saveCur(p); renderProjList(); };
  E('pw-del').onclick=()=>{ if(confirm('Delete this project?')){ Store.deleteProject(p.id); PROJ=null; renderProjects(); } };
  E('proj-main').querySelectorAll('.ptab').forEach(b=>b.onclick=()=>{ PROJ_TAB=b.dataset.k; renderWorkspace(curProject()); });
  renderTabBody(p);
}

function renderTabBody(p){
  const body=E('pw-body');
  if(PROJ_TAB==='setup') return renderSetup(p, body);
  if(PROJ_TAB==='idea')  return renderIdea(p, body);
  if(PROJ_TAB==='review')return renderReview(p, body);
  const sec=projTemplate(p.docType).sections.find(s=>s.key===PROJ_TAB);
  if(!sec){ body.innerHTML=emptyMsg('Unknown section.'); return; }
  if(sec.kind==='req' || sec.kind==='list') return renderItemSection(p, sec, body);
  if(sec.kind==='scope') return renderScopeSection(p, body);
  if(sec.kind==='stakeholders') return renderStakeSection(p, body);
  if(sec.kind==='risks') return renderRiskSection(p, body);
  body.innerHTML=emptyMsg('Section not implemented.');
}

/* ---- setup ---- */
function renderSetup(p, body){
  const commonAuthors=brainKnown('stakeholder').slice(0,0); // placeholder; roles not people
  body.innerHTML=`
  <div class="card" style="max-width:560px">
    <div class="dim" style="font-size:12px;margin-bottom:10px">A few basics. These become the document header.</div>
    <div class="kv">
      <div class="k">Document name</div><div class="v"><input id="s-project" type="text" style="width:100%" value="${esc(p.meta.project||'')}"></div>
      <div class="k">Version</div><div class="v"><input id="s-version" type="text" style="width:100%" value="${esc(p.meta.version||'')}"></div>
      <div class="k">Author / Owner</div><div class="v"><input id="s-author" type="text" style="width:100%" value="${esc(p.meta.author||'')}"></div>
      <div class="k">Department</div><div class="v"><input id="s-department" type="text" style="width:100%" value="${esc(p.meta.department||'')}"></div>
      <div class="k">Date</div><div class="v"><input id="s-date" type="text" style="width:100%" value="${esc(p.meta.date||'')}"></div>
    </div>
    <div style="margin-top:14px"><button class="btn sm" id="s-save">Save & continue →</button></div>
  </div>`;
  E('s-save').onclick=()=>{ ['project','version','author','department','date'].forEach(k=>p.meta[k]=E('s-'+k).value.trim());
    if(p.meta.project) p.name=p.meta.project; saveCur(p); renderProjList(); PROJ_TAB='idea'; renderWorkspace(curProject()); };
}

/* ---- idea ---- */
function renderIdea(p, body){
  body.innerHTML=`
  <div class="card">
    <div class="dim" style="font-size:12px;margin-bottom:8px">Describe the general idea / purpose in a few sentences. Everything else is built from this.</div>
    <textarea id="idea-text" rows="6" style="width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:10px;font-family:inherit;font-size:13px">${esc(p.idea||'')}</textarea>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn sm" id="idea-save">Save & continue →</button>
      ${AI.available?'<button class="btn ghost sm" id="idea-ai">✨ Draft sections from this idea</button><span class="dim" id="idea-aistatus"></span>':''}
    </div>
  </div>`;
  E('idea-save').onclick=()=>{ p.idea=E('idea-text').value.trim(); saveCur(p);
    const first=projTemplate(p.docType).sections[0]; PROJ_TAB=first?first.key:'review'; renderWorkspace(curProject()); };
  if(E('idea-ai')) E('idea-ai').onclick=async()=>{ p.idea=E('idea-text').value.trim(); if(!p.idea){ toast('Write the idea first.'); return; }
    saveCur(p); const st=E('idea-aistatus'); st.textContent='✨ drafting across sections…';
    try{ await aiDraftAllSections(p); toast('Drafted. Review each section tab.'); PROJ_TAB=projTemplate(p.docType).sections[0].key; renderWorkspace(curProject()); }
    catch(e){ st.textContent=''; toast('AI draft failed: '+e.message); } };
}

/* ---- item sections (req / generic list) ---- */
function renderItemSection(p, sec, body){
  const items=p.data[sec.key]=p.data[sec.key]||[];
  const hints=hintsFor(sec);
  body.innerHTML=`
  <div class="card">
    <div class="proj-q">${esc(sec.q)}</div>
    ${hints.length?`<div class="proj-hints">From your brain: ${hints.slice(0,10).map(h=>`<span class="chip hintchip">${esc(h)}</span>`).join('')}</div>`:''}
    <div class="proj-add"><input id="it-input" type="text" placeholder="Type ${sec.kind==='req'?'a requirement':'an item'} and press Enter…" style="flex:1">
      <button class="btn sm" id="it-add">Add</button>
      ${AI.available?'<button class="btn ghost sm" id="it-ai">✨ Suggest</button>':''}</div>
    <div id="it-list" class="proj-items"></div>
  </div>`;
  const draw=()=>{ E('it-list').innerHTML = items.length? items.map((it,i)=>`
    <div class="proj-item-row ${it.confirmed?'confirmed':''}">
      <span class="pi-mark" data-i="${i}" title="confirm">${it.confirmed?'✓':'○'}</span>
      <span class="pi-text" contenteditable data-i="${i}">${esc(it.text)}</span>
      <span class="pi-del" data-i="${i}">✕</span>
    </div>`).join('') : '<div class="dim" style="padding:6px">Nothing yet. Add items above'+(AI.available?', or click ✨ Suggest.':'.')+'</div>';
    E('it-list').querySelectorAll('.pi-del').forEach(x=>x.onclick=()=>{ items.splice(+x.dataset.i,1); saveCur(p); draw(); refreshTabs(p); });
    E('it-list').querySelectorAll('.pi-mark').forEach(x=>x.onclick=()=>{ items[+x.dataset.i].confirmed=!items[+x.dataset.i].confirmed; saveCur(p); draw(); });
    E('it-list').querySelectorAll('.pi-text').forEach(x=>x.onblur=()=>{ items[+x.dataset.i].text=x.textContent.trim(); saveCur(p); });
  };
  const add=t=>{ t=String(t||'').trim(); if(!t) return; items.push({text:t, confirmed:false}); saveCur(p); draw(); refreshTabs(p); };
  E('it-add').onclick=()=>{ add(E('it-input').value); E('it-input').value=''; };
  E('it-input').onkeydown=e=>{ if(e.key==='Enter'){ add(E('it-input').value); E('it-input').value=''; } };
  body.querySelectorAll('.hintchip').forEach(c=>c.onclick=()=>add(sec.kind==='req'?('integrate with '+c.textContent):c.textContent));
  if(E('it-ai')) E('it-ai').onclick=async()=>{ E('it-ai').disabled=true; E('it-ai').textContent='✨…';
    try{ const got=await aiSuggestSection(p, sec); got.forEach(g=>items.push({text:g, confirmed:false})); saveCur(p); draw(); refreshTabs(p); }
    catch(e){ toast('AI suggest failed: '+e.message); } finally{ E('it-ai').disabled=false; E('it-ai').textContent='✨ Suggest'; } };
  draw();
}

/* ---- scope ---- */
function renderScopeSection(p, body){
  p.data.scopeIn=p.data.scopeIn||[]; p.data.scopeOut=p.data.scopeOut||[];
  const col=(key,label,cls)=>`<div><h3 class="sec ${cls}">${label}</h3>
    <div class="proj-add"><input id="sc-${key}" type="text" placeholder="Add…" style="flex:1"><button class="btn sm" data-add="${key}">Add</button></div>
    <div id="scl-${key}" class="proj-items"></div></div>`;
  body.innerHTML=`<div class="card"><div class="proj-q">${esc(projTemplate(p.docType).sections.find(s=>s.key==='scope').q)}</div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">${col('scopeIn','✓ In scope','')}${col('scopeOut','✕ Out of scope','')}</div></div>`;
  const draw=key=>{ const arr=p.data[key]; E('scl-'+key).innerHTML=arr.map((x,i)=>`<div class="proj-item-row"><span class="pi-text">${esc(x)}</span><span class="pi-del" data-k="${key}" data-i="${i}">✕</span></div>`).join('')||'<div class="dim" style="padding:6px">—</div>';
    E('scl-'+key).querySelectorAll('.pi-del').forEach(d=>d.onclick=()=>{ p.data[d.dataset.k].splice(+d.dataset.i,1); saveCur(p); draw(d.dataset.k); refreshTabs(p); }); };
  body.querySelectorAll('[data-add]').forEach(btn=>btn.onclick=()=>{ const k=btn.dataset.add, v=E('sc-'+k).value.trim(); if(v){ p.data[k].push(v); E('sc-'+k).value=''; saveCur(p); draw(k); refreshTabs(p); } });
  draw('scopeIn'); draw('scopeOut');
}

/* ---- stakeholders ---- */
function renderStakeSection(p, body){
  const items=p.data.stakeholders=p.data.stakeholders||[];
  const hints=brainKnown('stakeholder');
  body.innerHTML=`<div class="card"><div class="proj-q">Who are the stakeholders and their roles?</div>
    ${hints.length?`<div class="proj-hints">Known roles: ${hints.slice(0,10).map(h=>`<span class="chip hintchip">${esc(h)}</span>`).join('')}</div>`:''}
    <div class="proj-add"><input id="stk-role" placeholder="Role" style="flex:1"><input id="stk-note" placeholder="Responsibility / name (optional)" style="flex:2"><button class="btn sm" id="stk-add">Add</button></div>
    <div id="stk-list" class="proj-items"></div></div>`;
  const draw=()=>{ E('stk-list').innerHTML=items.map((it,i)=>`<div class="proj-item-row"><span class="pi-text"><strong>${esc(it.role)}</strong>${it.note?' — '+esc(it.note):''}</span><span class="pi-del" data-i="${i}">✕</span></div>`).join('')||'<div class="dim" style="padding:6px">—</div>';
    E('stk-list').querySelectorAll('.pi-del').forEach(d=>d.onclick=()=>{ items.splice(+d.dataset.i,1); saveCur(p); draw(); refreshTabs(p); }); };
  const add=(role,note)=>{ role=String(role||'').trim(); if(!role) return; items.push({role,note:String(note||'').trim()}); saveCur(p); draw(); refreshTabs(p); };
  E('stk-add').onclick=()=>{ add(E('stk-role').value,E('stk-note').value); E('stk-role').value='';E('stk-note').value=''; };
  body.querySelectorAll('.hintchip').forEach(c=>c.onclick=()=>add(c.textContent,''));
  draw();
}

/* ---- risks ---- */
function renderRiskSection(p, body){
  const items=p.data.risks=p.data.risks||[];
  body.innerHTML=`<div class="card"><div class="proj-q">What risks and mitigations should be captured?</div>
    <div class="proj-add"><input id="rk-risk" placeholder="Risk" style="flex:2"><input id="rk-mit" placeholder="Mitigation (optional)" style="flex:2"><button class="btn sm" id="rk-add">Add</button></div>
    <div id="rk-list" class="proj-items"></div></div>`;
  const draw=()=>{ E('rk-list').innerHTML=items.map((it,i)=>`<div class="proj-item-row"><span class="pi-text">${esc(it.risk)}${it.mitigation?' <span class="dim">— '+esc(it.mitigation)+'</span>':''}</span><span class="pi-del" data-i="${i}">✕</span></div>`).join('')||'<div class="dim" style="padding:6px">—</div>';
    E('rk-list').querySelectorAll('.pi-del').forEach(d=>d.onclick=()=>{ items.splice(+d.dataset.i,1); saveCur(p); draw(); refreshTabs(p); }); };
  E('rk-add').onclick=()=>{ const r=E('rk-risk').value.trim(); if(!r) return; items.push({risk:r,mitigation:E('rk-mit').value.trim()}); E('rk-risk').value='';E('rk-mit').value=''; saveCur(p); draw(); refreshTabs(p); };
  draw();
}

function refreshTabs(p){ // update the ✓ marks without full re-render
  E('proj-main').querySelectorAll('.ptab').forEach(b=>{ const k=b.dataset.k;
    b.textContent=(sectionFilled(p,k)?'✓ ':'')+ (projTabs(p).find(t=>t.key===k)||{label:k}).label; });
}

/* ---- review & generate ---- */
function completeness(p){
  const t=projTemplate(p.docType); const rows=[];
  rows.push(['Overview', p.idea?p.idea.length:0, !!p.idea]);
  t.sections.forEach(s=>{ let n; if(s.kind==='scope') n=(p.data.scopeIn||[]).length+(p.data.scopeOut||[]).length; else n=(p.data[s.key]||[]).length;
    rows.push([s.label, n, n>0]); });
  return rows;
}
function renderReview(p, body){
  const rows=completeness(p);
  const gaps=rows.filter(r=>!r[2]).map(r=>r[0]);
  body.innerHTML=`
  <div class="card">
    <h3 style="margin:0 0 10px">Completeness</h3>
    <table style="width:100%"><tbody>${rows.map(r=>`<tr><td style="padding:5px 8px">${esc(r[0])}</td><td style="padding:5px 8px" class="mono dim">${r[1]}</td><td style="padding:5px 8px">${r[2]?'<span class="tag p-Low">ready</span>':'<span class="tag p-Medium">empty</span>'}</td></tr>`).join('')}</tbody></table>
    ${gaps.length?`<div class="action-box" style="margin-top:10px"><strong>Empty sections:</strong> ${gaps.map(esc).join(', ')}. You can still generate — the engine will also flag any quality gaps.</div>`:'<div class="exp" style="margin-top:10px"><strong>All sections have content.</strong></div>'}
  </div>
  <div class="card" style="margin-top:12px">
    <h3 style="margin:0 0 8px">Generate</h3>
    <p class="dim" style="font-size:12px;margin:0 0 12px">Assembles the ${esc(projTemplate(p.docType).label.split(' (')[0])}, then runs the full engine — requirements, test cases, traceability and a gap/quality check.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="gen-go">⚙ Generate & analyze</button>
      <button class="btn ghost sm" id="gen-md">⬇ Download .md</button>
      <button class="btn ghost sm" id="gen-preview">👁 Preview text</button>
    </div>
    <div id="gen-out" style="margin-top:12px"></div>
  </div>`;
  E('gen-go').onclick=()=>{ const text=assembleDoc(p); if(text.trim().length<40){ toast('Add more content first.'); return; }
    p.status='complete'; saveCur(p); renderProjList();
    analyze(text, (p.meta.project||p.name||'Project')+'.md', text.length);
    setMode('doc'); toast('Generated & analyzed — test cases and gaps are in the tabs.'); };
  E('gen-md').onclick=()=>{ const text=assembleDoc(p); const blob=new Blob([text],{type:'text/markdown'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=(p.meta.project||p.name||'document').replace(/[^\w]+/g,'_')+'.md'; a.click(); URL.revokeObjectURL(a.href); };
  E('gen-preview').onclick=()=>{ E('gen-out').innerHTML=`<pre style="white-space:pre-wrap;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:11.5px;max-height:40vh;overflow:auto">${esc(assembleDoc(p))}</pre>`; };
}

/* ---- assemble engine-parseable document text ---- */
function ensureShall(text){ text=String(text||'').trim(); if(!text) return text;
  if(/\b(shall|must|should|will|is required to|are required to|needs? to|has to)\b/i.test(text)) return text;
  return 'The system shall '+text.charAt(0).toLowerCase()+text.slice(1); }
function assembleDoc(p){
  const t=projTemplate(p.docType), L=[]; let n=0;
  L.push(p.meta.project||p.name||('Untitled '+t.label));
  if(p.meta.version) L.push('Version: '+p.meta.version);
  if(p.meta.author) L.push('Author: '+p.meta.author);
  if(p.meta.department) L.push('Department: '+p.meta.department);
  if(p.meta.date) L.push('Date: '+p.meta.date);
  L.push(''); L.push((++n)+'. Overview'); L.push(p.idea||'(no overview provided)'); L.push('');
  t.sections.forEach(sec=>{
    if(sec.kind==='req'){ const items=p.data[sec.key]||[]; if(!items.length) return;
      L.push((++n)+'. '+sec.label+' Requirements'); items.forEach((it,i)=>L.push(`${sec.cat}-${String(i+1).padStart(3,'0')} ${ensureShall(it.text)}`)); L.push(''); }
    else if(sec.kind==='scope'){ const inS=p.data.scopeIn||[], outS=p.data.scopeOut||[]; if(!inS.length&&!outS.length) return;
      L.push((++n)+'. Scope'); if(inS.length){ L.push('In Scope:'); inS.forEach(x=>L.push('- '+x)); } if(outS.length){ L.push('Out of Scope:'); outS.forEach(x=>L.push('- '+x)); } L.push(''); }
    else if(sec.kind==='stakeholders'){ const items=p.data.stakeholders||[]; if(!items.length) return;
      L.push((++n)+'. Stakeholders'); items.forEach(it=>L.push(`${it.role}${it.note?' — '+it.note:''}`)); L.push(''); }
    else if(sec.kind==='risks'){ const items=p.data.risks||[]; if(!items.length) return;
      L.push((++n)+'. Risks'); items.forEach(it=>L.push(`Risk: ${it.risk}.${it.mitigation?' Mitigation: '+it.mitigation:''}`)); L.push(''); }
    else if(sec.kind==='list'){ const items=p.data[sec.key]||[]; if(!items.length) return;
      L.push((++n)+'. '+sec.label); items.forEach(it=>L.push('- '+(it.text||it))); L.push(''); }
  });
  return L.join('\n');
}

/* ---- AI helpers ---- */
function projectContext(p){
  const known={ systems:brainKnown('system').slice(0,12), roles:brainKnown('stakeholder').slice(0,12) };
  const parts=[];
  if(known.systems.length) parts.push('Known systems in the brain: '+known.systems.join(', '));
  if(known.roles.length) parts.push('Known roles: '+known.roles.join(', '));
  return parts.join('\n');
}
async function aiSuggestSection(p, sec){
  const prompt=`You are a senior business analyst drafting a ${projTemplate(p.docType).label}. Based ONLY on the project idea and context, draft specific ${sec.kind==='req'?sec.label.toLowerCase()+' requirements (each a single "the system shall …" style sentence)':sec.label.toLowerCase()+' items'}. Do not invent systems not implied by the idea or the known list. Return STRICT JSON {"items":["…","…"]}, at most 8.\n\nPROJECT: ${p.meta.project||p.name}\nIDEA: ${p.idea}\n${projectContext(p)}`;
  const j=await llmJSON(prompt,{temperature:0.3});
  return ((j&&(j.items||j.requirements))||[]).map(x=>String(x)).filter(Boolean).slice(0,8);
}
async function aiDraftAllSections(p){
  const secs=projTemplate(p.docType).sections.filter(s=>s.kind==='req'||s.kind==='list');
  for(const sec of secs){
    try{ const got=await aiSuggestSection(p, sec); if(got.length){ p.data[sec.key]=p.data[sec.key]||[];
      got.forEach(g=> p.data[sec.key].push(sec.kind==='req'?{text:g,confirmed:false}:{text:g})); } }catch(e){ /* continue */ }
  }
  saveCur(p);
}
