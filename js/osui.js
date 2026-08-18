/* ============================================================
   ANALYST OS — the workspace UI over the Project Truth Model.

   This is where the whole system becomes visible and editable: a
   project health dashboard, a structured object explorer with full
   provenance/evidence and traceability, the prioritized clarification
   queue, the conflict board, and document generation with freshness.
   Everything reads and writes the ONE Truth Model — the AI is an
   assistant, never the hidden source of truth (Phase 18).
   ============================================================ */

let OS_PROJECT=null, OS_VIEW='dashboard', OS_SEL=null;

function osReady(){ return typeof Model!=='undefined' && !!Model; }
function osProjects(){ return osReady()?Model.listProjects():[]; }
function osCur(){ return OS_PROJECT?Model.getProject(OS_PROJECT):null; }

function renderOS(){
  const host=E('os'); if(!host) return;
  if(!osReady()){ host.innerHTML=emptyMsg('The Truth Model layer is not available.'); return; }
  const projs=osProjects();
  if(!OS_PROJECT && projs.length) OS_PROJECT=projs[0].id;
  host.innerHTML=`
   <div class="os-wrap">
     <aside class="os-side">
       <button class="btn sm" id="os-new" style="width:100%">＋ New project</button>
       <div class="os-plist" id="os-plist"></div>
     </aside>
     <section class="os-main" id="os-main"></section>
   </div>`;
  E('os-new').onclick=()=>{ const name=prompt('Project name:','New Analysis Project'); if(name){ const p=Model.createProject({name, meta:{project:name}}); OS_PROJECT=p.id; OS_VIEW='dashboard'; renderOS(); } };
  osSidebar(); osMain();
}
function osSidebar(){
  const projs=osProjects();
  E('os-plist').innerHTML = projs.length? projs.map(p=>{
    const h=(typeof Health!=='undefined')?Health.score(p.id):null;
    return `<div class="os-pitem ${p.id===OS_PROJECT?'on':''}" data-id="${p.id}">
      <div class="os-pname">${esc(p.meta&&p.meta.project||p.name)}</div>
      <div class="os-psub">${Object.keys(p.objects).length} objects${h?` · ${h.readiness}% ready`:''}</div></div>`;
  }).join('') : '<div class="dim" style="padding:10px;font-size:12px">No projects yet. Generate one from the 📁 Projects tab, or create one here.</div>';
  E('os-plist').querySelectorAll('.os-pitem').forEach(el=>el.onclick=()=>{ OS_PROJECT=el.dataset.id; OS_SEL=null; OS_VIEW='dashboard'; renderOS(); });
}
function osMain(){
  const p=osCur(); const main=E('os-main'); if(!main) return;
  if(!p){ main.innerHTML='<div class="empty">Select or create a project.</div>'; return; }
  const nav=[['dashboard','Dashboard'],['objects','Knowledge'],['questions','Questions'],['conflicts','Conflicts'],['documents','Documents']];
  main.innerHTML=`
    <div class="os-head"><strong>${esc(p.meta&&p.meta.project||p.name)}</strong>
      <span class="pill">${Object.keys(p.objects).length} objects</span></div>
    <div class="os-nav">${nav.map(n=>`<button class="os-tab ${n[0]===OS_VIEW?'on':''}" data-v="${n[0]}">${esc(n[1])}${osBadge(p,n[0])}</button>`).join('')}</div>
    <div id="os-body" class="os-body"></div>`;
  main.querySelectorAll('.os-tab').forEach(b=>b.onclick=()=>{ OS_VIEW=b.dataset.v; OS_SEL=null; osMain(); });
  const body=E('os-body');
  try{
    if(OS_VIEW==='dashboard') osDashboard(p, body);
    else if(OS_VIEW==='objects') osObjects(p, body);
    else if(OS_VIEW==='questions') osQuestions(p, body);
    else if(OS_VIEW==='conflicts') osConflicts(p, body);
    else if(OS_VIEW==='documents') osDocuments(p, body);
  }catch(e){ console.error('OS view failed',e); body.innerHTML=emptyMsg('This view could not be rendered.'); }
}
function osBadge(p,view){
  try{
    if(view==='questions' && typeof Questions!=='undefined'){ const n=Questions.generateQuestions(p.id).length; return n?` <span class="os-count">${n}</span>`:''; }
    if(view==='conflicts' && typeof Conflicts!=='undefined'){ const n=Conflicts.detectConflicts(p.id).items.length; return n?` <span class="os-count bad">${n}</span>`:''; }
  }catch(e){}
  return '';
}

/* ---- dashboard ---- */
function osDashboard(p, body){
  if(typeof Health==='undefined'){ body.innerHTML=emptyMsg('Health engine unavailable.'); return; }
  const h=Health.score(p.id); const m=h.metrics;
  const ring=`<div class="os-ring" style="background:conic-gradient(var(--accent) ${h.readiness*3.6}deg, var(--panel2) 0)"><div class="os-ring-in"><div class="kpi ${h.readiness>=75?'ok':h.readiness>=50?'warn':'bad'}">${h.readiness}%</div><div class="klabel">Readiness</div></div></div>`;
  const dim=(label,v)=>`<div class="dim-row"><span>${label}</span><div class="bar"><i style="width:${v}%;background:${v>=75?'var(--ok)':v>=50?'var(--warn)':'var(--bad)'}"></i></div><span class="num">${v}%</span></div>`;
  const card=(t,rows)=>`<div class="card"><h3 class="sec" style="margin-top:0">${t}</h3>${rows}</div>`;
  const kv=(k,v,cls)=>`<div class="os-kv"><span>${k}</span><b class="${cls||''}">${v}</b></div>`;
  body.innerHTML=`
    <div class="os-dash">
      <div class="card os-readycard">${ring}
        <div class="os-issues"><h3 class="sec" style="margin-top:0">Primary issues</h3>
          ${h.primaryIssues.length? '<ul class="itemlist warn">'+h.primaryIssues.map(i=>`<li><span class="li-main">${esc(i)}</span></li>`).join('')+'</ul>' : '<div class="exp"><strong>No blocking issues.</strong> The project model looks healthy.</div>'}</div>
      </div>
      <div class="grid g4">
        ${card('Requirements', kv('Total',m.requirements.total)+kv('Approved',m.requirements.approved,'ok')+kv('Untestable',m.requirements.untestable,m.requirements.untestable?'bad':'')+kv('Ambiguous',m.requirements.ambiguous,m.requirements.ambiguous?'warn':'')+kv('Conflicting',m.requirements.conflicting,m.requirements.conflicting?'bad':'')+kv('Orphaned',m.requirements.orphaned,m.requirements.orphaned?'warn':''))}
        ${card('Traceability', kv('Reqs with tests',m.traceability.reqsWithTests+'/'+m.requirements.total)+kv('Reqs with source',m.traceability.reqsWithSource+'/'+m.requirements.total)+kv('Objectives covered',m.traceability.objectivesWithReqs+'/'+m.traceability.objectivesTotal))}
        ${card('Documentation', kv('Generated',m.documentation.total)+kv('Needs review',m.documentation.needsReview,m.documentation.needsReview?'warn':'')+kv('Not yet generated',m.documentation.missing.length,m.documentation.missing.length?'dim':''))}
        ${card('Risks & Open', kv('Open risks',m.risks.openRisks)+kv('Unresolved conflicts',m.risks.unresolvedConflicts,m.risks.unresolvedConflicts?'bad':'')+kv('Open questions',m.risks.openQuestions,m.risks.openQuestions?'warn':'')+kv('Unapproved assumptions',m.risks.unapprovedAssumptions,m.risks.unapprovedAssumptions?'warn':''))}
      </div>
      <div class="card"><h3 class="sec" style="margin-top:0">Dimensions</h3>
        ${dim('Requirement quality',h.dimensions.requirementsQuality)}${dim('Test coverage',h.dimensions.testCoverage)}${dim('Objective traceability',h.dimensions.traceability)}${dim('Document freshness',h.dimensions.documentFreshness)}${dim('Conflict-free',h.dimensions.conflictFree)}
      </div>
    </div>`;
}

/* ---- knowledge / objects + inspector ---- */
function osObjects(p, body){
  const objs=Model.listObjects(p.id);
  const groups={}; objs.forEach(o=>{ (groups[o.type]=groups[o.type]||[]).push(o); });
  const label=t=>t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const list=Object.keys(groups).sort().map(t=>`<div class="os-group"><div class="os-gh">${esc(label(t))} <span class="dim">(${groups[t].length})</span></div>
    ${groups[t].map(o=>`<div class="os-obj ${o.id===OS_SEL?'on':''}" data-id="${o.id}"><span class="mono">${esc(o.displayId)}</span> ${esc((o.title||o.description||'').slice(0,70))} ${typeof Provenance!=='undefined'?Provenance.badge(o):''}</div>`).join('')}</div>`).join('')
    || '<div class="dim" style="padding:10px">No objects yet.</div>';
  body.innerHTML=`<div class="os-objwrap"><div class="os-objlist">${list}</div><div class="os-inspect" id="os-inspect"></div></div>`;
  body.querySelectorAll('.os-obj').forEach(el=>el.onclick=()=>{ OS_SEL=el.dataset.id; osObjects(p, body); });
  osInspector(p, E('os-inspect'));
}
function osInspector(p, el){
  if(!OS_SEL){ el.innerHTML='<div class="dim" style="padding:14px">Select an object to see its evidence, relationships, and history.</div>'; return; }
  const o=Model.getObject(p.id, OS_SEL); if(!o){ el.innerHTML=''; return; }
  const rel=Model.relationshipsOf(p.id, o.id);
  const line=e=>{ const other=Model.getObject(p.id, e.from===o.id?e.to:e.from); return other?`<li><span class="mono">${esc(other.displayId)}</span> <span class="dim">${esc(e.type)}</span> ${esc((other.title||'').slice(0,50))}</li>`:''; };
  const gapsFor=(typeof Gaps!=='undefined')?Gaps.detectGaps(p.id).all.filter(g=>g.objectId===o.id):[];
  el.innerHTML=`
    <div class="os-insp-h"><span class="mono">${esc(o.displayId)}</span> <strong>${esc(o.title||'')}</strong></div>
    <p>${esc(o.description||'')}</p>
    ${typeof Provenance!=='undefined'?Provenance.evidenceHtml(o):''}
    <h3 class="sec">Traceability</h3>
    <div class="os-trace"><div><div class="dim">Upstream</div><ul class="os-rel">${rel.upstream.map(line).join('')||'<li class="dim">—</li>'}</ul></div>
      <div><div class="dim">Downstream</div><ul class="os-rel">${rel.downstream.map(line).join('')||'<li class="dim">—</li>'}</ul></div></div>
    ${gapsFor.length?`<h3 class="sec">Gaps</h3><ul class="itemlist warn">${gapsFor.map(g=>`<li><span class="li-main">${esc(g.message)}</span><span class="li-sub">${esc(g.recommendation||'')}</span></li>`).join('')}</ul>`:''}
    <h3 class="sec">History (v${o.version})</h3>
    <ul class="os-hist">${(o.attrs&&o.attrs.history||[]).slice().reverse().map(h=>`<li><span class="mono">v${h.version}</span> ${esc(h.changeReason||'')} <span class="dim">${esc((h.at||'').slice(0,10))}</span></li>`).join('')||'<li class="dim">—</li>'}</ul>`;
}

/* ---- questions ---- */
function osQuestions(p, body){
  if(typeof Questions==='undefined'){ body.innerHTML=emptyMsg('Clarification engine unavailable.'); return; }
  const qs=Questions.generateQuestions(p.id);
  if(!qs.length){ body.innerHTML='<div class="exp"><strong>No open questions.</strong> Gaps and conflicts are resolved for now.</div>'; return; }
  body.innerHTML=qs.map(q=>{
    const tone=q.priority>=70?'bad':q.priority>=45?'warn':'dim';
    const input = q.choices ? `<select class="qa-ans os-ans">${q.choices.map(c=>`<option>${esc(c)}</option>`).join('')}</select>`
      : `<input class="qa-ans os-ans" placeholder="Type the answer…">`;
    return `<div class="qa-item" data-qid="${esc(q.id)}">
      <div class="qa-q"><span class="os-prio ${tone}">P${q.priority}</span> ${esc(q.text)}</div>
      <div class="dim" style="font-size:11.5px;margin:4px 0 8px">${esc(q.reason||'')}</div>
      <div class="qa-controls">${input}<button class="btn sm os-record">Record →</button></div></div>`;
  }).join('');
  body.querySelectorAll('.qa-item').forEach(item=>{
    const qid=item.dataset.qid; const q=qs.find(x=>x.id===qid);
    item.querySelector('.os-record').onclick=()=>{ const val=item.querySelector('.os-ans').value.trim(); if(!val){ toast('Type an answer first.'); return; }
      const res=Questions.answerQuestion(p.id, q, val, 'Mujtaba');
      toast(`Recorded. ${res.impacted.length} object(s) updated.`); osMain(); };
  });
}

/* ---- conflicts ---- */
function osConflicts(p, body){
  if(typeof Conflicts==='undefined'){ body.innerHTML=emptyMsg('Conflict engine unavailable.'); return; }
  const det=Conflicts.detectConflicts(p.id);
  const recorded=Model.listObjects(p.id,'conflict');
  body.innerHTML=`
    <div class="toolbar"><span class="dim">${det.items.length} detected · ${recorded.length} recorded</span>
      <button class="btn sm" id="os-recconf">Record &amp; link conflicts</button></div>
    ${det.items.length? det.items.map(c=>`<div class="card os-conf">
      <div class="os-conf-h"><span class="tag t-OI">${esc(c.kind)}</span> <strong>${esc(c.topic)}</strong> <span class="os-prio bad">${esc(c.severity)}</span></div>
      <ul class="itemlist">${c.statements.map((s,i)=>`<li><span class="li-main">${esc(c.sourceDisplay[i]||'')}: ${esc(s)}</span></li>`).join('')}</ul>
      <div class="action-box"><strong>Recommended:</strong> ${esc(c.recommendation)}</div></div>`).join('')
      : '<div class="exp"><strong>No conflicts detected.</strong></div>'}
    ${recorded.length?`<h3 class="sec">Recorded conflicts (lifecycle)</h3>${recorded.map(o=>`<div class="os-obj"><span class="mono">${esc(o.displayId)}</span> ${esc(o.title)} <span class="status-badge st-warn">${esc((o.attrs&&o.attrs.conflictStatus)||'detected')}</span></div>`).join('')}`:''}`;
  E('os-recconf').onclick=()=>{ const r=Conflicts.recordConflicts(p.id); toast(`${r.created} conflict(s) recorded and linked.`); osMain(); };
}

/* ---- documents ---- */
function osDocuments(p, body){
  if(typeof Factory==='undefined'){ body.innerHTML=emptyMsg('Document factory unavailable.'); return; }
  const types=Factory.availableTypes(); const docs=Factory.listDocuments(p.id);
  body.innerHTML=`
    <div class="card"><h3 class="sec" style="margin-top:0">Generate a document from the Truth Model</h3>
      <div class="os-gen">${types.map(t=>`<button class="btn ghost sm os-gd" data-t="${t.id}">${esc(t.label)}</button>`).join('')}</div></div>
    <h3 class="sec">Generated documents</h3>
    ${docs.length? docs.map(d=>{ const tone=d.status==='needs_review'?'warn':d.status==='outdated'?'bad':'ok';
      return `<div class="card os-doc"><div class="os-doc-h"><strong>${esc(d.title)}</strong> <span class="status-badge st-${tone}">${esc(d.status)}</span>
        <span class="dim">${d.sources} sources · ${esc((d.generatedAt||'').slice(0,10))}</span>
        <span style="margin-left:auto"><button class="btn ghost sm os-view" data-id="${d.id}">View</button> <button class="btn ghost sm os-regen" data-t="${d.docType}">Regenerate</button></span></div>
        <pre class="os-md hidden" id="md-${d.id}"></pre></div>`; }).join('')
      : '<div class="dim" style="padding:10px">No documents generated yet — pick a type above.</div>'}`;
  body.querySelectorAll('.os-gd').forEach(b=>b.onclick=()=>{ const r=Factory.generate(p.id,b.dataset.t); toast(`Generated ${r.title} from ${r.sources} sources.`); osMain(); });
  body.querySelectorAll('.os-regen').forEach(b=>b.onclick=()=>{ Factory.generate(p.id,b.dataset.t); toast('Regenerated — freshness reset to current.'); osMain(); });
  body.querySelectorAll('.os-view').forEach(b=>b.onclick=()=>{ const pre=E('md-'+b.dataset.id); pre.textContent=Factory.documentMarkdown(p.id,b.dataset.id); pre.classList.toggle('hidden'); });
}
