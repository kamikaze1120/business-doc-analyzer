/* ============================================================
   RENDER LAYER — turns STATE into the adaptive, tabbed UI.
   Shared DOM helpers + one renderer per view. app.js decides
   which views to mount based on the detected document type.
   ============================================================ */

const E = (id)=>document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function countBy(arr,f){ const o={}; arr.forEach(x=>{const k=f(x); o[k]=(o[k]||0)+1;}); return o; }
function confBar(v){
  const c = v>=70?'var(--ok)':v>=45?'var(--warn)':'var(--bad)';
  return `<span class="conf" title="Parse confidence ${v}%"><i style="width:${v}%;background:${c}"></i></span>`;
}
function scoreClass(v){ return v>=75?'ok':v>=50?'warn':'bad'; }
function emptyMsg(t){ return `<div class="empty">${esc(t)}</div>`; }
function chips(arr){ return arr.length? arr.map(a=>`<span class="chip">${esc(a)}</span>`).join(' ') : '—'; }
function sevTag(sev){
  const s=(sev||'').toLowerCase();
  const cls = /crit|severe|high/.test(s)?'p-High' : /med|moder/.test(s)?'p-Medium' : /low|minor/.test(s)?'p-Low':'';
  return sev? `<span class="tag ${cls}">${esc(sev)}</span>` : '';
}
/* generic list-card of {primary, secondary} rows */
function listCard(items, primaryKey, secondaryKey){
  if(!items.length) return emptyMsg('Nothing detected for this section.');
  return `<div class="card"><ul class="itemlist">${items.map(it=>{
    const p = typeof it==='string'?it:it[primaryKey];
    const sec = typeof it==='string'?'':(it[secondaryKey]||'');
    return `<li><span class="li-main">${esc(p)}</span>${sec?`<span class="li-sub">${esc(sec)}</span>`:''}</li>`;
  }).join('')}</ul></div>`;
}

/* ---------------- OVERVIEW (adaptive) ---------------- */
function headlineStats(s){
  const el=s.el;
  const testable = s.reqs.filter(r=>r.sem&&r.sem.verb&&r.sem.object).length;
  const map={
    requirements:[[s.reqs.length,'Requirements','acc'],[s.scen.length,'E2E scenarios',''],[s.tests.length,'Test cases',''],[s.score,'Quality score',scoreClass(s.score)]],
    generic:     [[s.reqs.length,'Requirements','acc'],[s.steps.length,'Process steps',''],[s.tests.length,'Test cases',''],[s.score,'Quality score',scoreClass(s.score)]],
    prd:         [[el.features.length,'Features','acc'],[el.personas.length,'Personas',''],[el.metrics.length,'Metrics / KPIs',''],[el.stories.length,'User stories','']],
    charter:     [[el.objectives.length,'Objectives','acc'],[el.stakeholders.length,'Stakeholders',''],[el.milestones.length,'Milestones',''],[el.risks.length,'Risks', el.risks.length?'warn':'']],
    agile:       [[el.stories.length,'User stories','acc'],[el.features.length,'Features / epics',''],[s.tests.length,'Test cases',''],[s.score,'Quality score',scoreClass(s.score)]],
    process:     [[s.steps.length,'Process steps','acc'],[s.actors.length,'Roles / lanes',''],[el.actions.length,'Action items',''],[el.questions.length,'Open questions', el.questions.length?'warn':'']]
  };
  return map[s.docType.id]||map.generic;
}
function elementSummary(s){
  const el=s.el;
  const rows=[
    ['Requirements',s.reqs.length],['Process steps',s.steps.length],['Objectives',el.objectives.length],
    ['In / out of scope',el.scopeIn.length+el.scopeOut.length],['Stakeholders',el.stakeholders.length],
    ['Milestones',el.milestones.length],['Risks',el.risks.length],['Assumptions',el.assumptions.length],
    ['Constraints',el.constraints.length],['Dependencies',el.dependencies.length],['Personas',el.personas.length],
    ['Features',el.features.length],['Metrics / KPIs',el.metrics.length],['User stories',el.stories.length],
    ['Action items',el.actions.length],['Open questions',el.questions.length],['Test cases',s.tests.length]
  ].filter(r=>r[1]>0);
  return rows;
}
function renderOverview(){
  const s=STATE, dt=s.docType;
  const stats=headlineStats(s);
  const testable = s.reqs.filter(r=>r.sem&&r.sem.verb&&r.sem.object).length;
  const alt = dt.ranked.filter(r=>r.id!==dt.id && r.score>0).slice(0,3);
  E('p-overview').innerHTML=`
  <div class="card typecard">
    <div class="tc-icon">${esc(dt.icon)}</div>
    <div class="tc-main">
      <div class="tc-label">Detected document type</div>
      <div class="tc-name">${esc(dt.name)} <span class="dim" style="font-weight:400">· ${esc(dt.short)}</span></div>
      <div class="tc-conf"><span class="bar" style="max-width:220px"><i style="width:${dt.confidence}%;background:var(--accent)"></i></span>
        <span class="num" style="color:var(--accent)">${dt.confidence}% confident</span></div>
      ${alt.length?`<div class="dim" style="font-size:11px;margin-top:6px">Also considered: ${alt.map(a=>esc(a.short||a.name)).join(' · ')}</div>`:''}
    </div>
    <div class="tc-switch">
      <label class="dim" style="font-size:11px;display:block;margin-bottom:4px">View as</label>
      <select id="typeoverride"></select>
    </div>
  </div>

  <div class="grid g4">
    ${stats.map(([n,label,cls])=>`<div class="card"><div class="kpi ${cls}">${n}</div><div class="klabel">${esc(label)}</div></div>`).join('')}
  </div>

  <h3 class="sec">Quality breakdown</h3>
  <div class="card">
    ${s.dims.map(d=>{
      const col = d.value>=70?'var(--ok)':d.value>=45?'var(--warn)':'var(--bad)';
      return `<div class="dim-row"><span>${esc(d.key)}</span>
        <span class="bar"><i style="width:${d.value}%;background:${col}"></i></span>
        <span class="num" style="color:${col}">${d.value}</span></div>
        <div class="dim-hint">${esc(d.hint)}</div>`;
    }).join('')}
  </div>

  <h3 class="sec">What we found</h3>
  <div class="grid g4">
    ${elementSummary(s).map(([label,n])=>`<div class="card mini"><div class="kpi" style="font-size:22px">${n}</div><div class="klabel">${esc(label)}</div></div>`).join('')}
  </div>

  <h3 class="sec">Document metadata</h3>
  <div class="card">
    <div class="kv">
      <div class="k">Title</div><div class="v"><strong>${esc(s.meta.title)}</strong></div>
      <div class="k">Version</div><div class="v">${esc(s.meta.version||'not detected')}</div>
      <div class="k">Date</div><div class="v">${esc(s.meta.date||'not detected')}</div>
      <div class="k">Author</div><div class="v">${esc(s.meta.author||'not detected')}</div>
      <div class="k">Department</div><div class="v">${esc(s.meta.dept||'not detected')}</div>
      <div class="k">Sections</div><div class="v">${s.sections.length}</div>
      <div class="k">Actors found</div><div class="v">${chips(s.actors)}</div>
      ${s.reqs.length?`<div class="k">Fully testable</div><div class="v">${Math.round(testable/Math.max(1,s.reqs.length)*100)}% of requirements</div>`:''}
    </div>
  </div>

  <h3 class="sec">Document structure</h3>
  <div class="card" style="max-height:320px;overflow:auto">
    ${s.sections.length? s.sections.map(x=>`<div style="padding-left:${(x.level-1)*18}px;padding-block:3px;font-size:12.5px">
      <span class="mono dim">${esc(x.num||'•')}</span> ${esc(x.title)}</div>`).join('')
      : '<div class="dim">No headings detected.</div>'}
  </div>`;
}

/* ---------------- REQUIREMENTS ---------------- */
function renderRequirements(){
  const s=STATE;
  E('p-requirements').innerHTML=`
  <div class="toolbar">
    <input type="search" id="rq" placeholder="Search requirements…">
    <select id="rcat"><option value="">All categories</option>${Object.keys(CAT_NAME).map(k=>`<option value="${k}">${CAT_NAME[k]}</option>`).join('')}</select>
    <select id="rpri"><option value="">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select>
    <span class="dim mono" id="rcount"></span>
  </div>
  <div class="card" style="padding:0"><div class="tablewrap">
    <table id="rtbl"><colgroup>
      <col style="width:96px"><col style="width:64px"><col style="width:78px">
      <col><col style="width:150px"><col style="width:118px"><col style="width:74px">
    </colgroup><thead><tr>
      <th>ID</th><th>Type</th><th>Priority</th><th>Requirement</th>
      <th>Interpreted as</th><th>Actor</th><th>Parse</th>
    </tr></thead><tbody></tbody></table>
  </div></div>`;
  const draw=()=>{
    const q=E('rq').value.toLowerCase(), c=E('rcat').value, p=E('rpri').value;
    const rows=s.reqs.filter(r=>(!q||r.text.toLowerCase().includes(q)||r.id.toLowerCase().includes(q))&&(!c||r.cat===c)&&(!p||r.priority===p));
    E('rcount').textContent=`${rows.length} of ${s.reqs.length}`;
    E('rtbl').querySelector('tbody').innerHTML=rows.map(r=>{
      const d=r.sem||{};
      const interp = d.verb&&d.object ? `${esc(d.verb)} → ${esc(d.object)}` : `<span style="color:var(--warn)">not parseable</span>`;
      return `<tr>
      <td class="mono">${esc(r.id)}${r.derived?'<br><span class="dim" style="font-size:10px">derived</span>':''}</td>
      <td><span class="tag t-${r.cat}">${r.cat}</span></td>
      <td><span class="tag p-${r.priority}">${r.priority}</span></td>
      <td class="wrap">${esc(r.text)}</td>
      <td class="wrap dim" style="font-size:11.5px">${interp}</td>
      <td class="wrap dim">${esc(d.actor?d.actor.name:'—')}</td>
      <td>${confBar(d.confidence||0)}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">No matches</td></tr>';
  };
  ['rq','rcat','rpri'].forEach(id=>E(id).addEventListener('input',draw));
  draw();
}

/* ---------------- PROCESS FLOW ---------------- */
function renderFlow(){
  const s=STATE;
  if(!s.steps.length){ E('p-flow').innerHTML=emptyMsg('No sequential process steps detected. Add numbered steps (1. 2. 3.) or action-verb statements.'); return; }
  const lanes={}; s.steps.forEach(st=>{ (lanes[st.lane]=lanes[st.lane]||[]).push(st); });
  const handoffs=s.steps.filter((x,i)=>i>0 && s.steps[i-1].lane!==x.lane).length;
  E('p-flow').innerHTML=`
  <div class="toolbar"><span class="dim">Persona swimlanes · ${s.steps.length} steps · ${Object.keys(lanes).length} actors · ${handoffs} hand-off${handoffs===1?'':'s'} · ${s.steps.filter(x=>x.decision).length} decision points</span></div>
  <div class="flowwrap" id="swimlane" style="overflow:auto"></div>
  <div class="dim" style="font-size:11px;margin-top:6px"><span style="color:var(--accent)">━▸</span> hand-off between actors · <span style="color:var(--dim)">━▸</span> same actor · <span style="color:var(--warn)">◆</span> decision</div>
  <h3 class="sec">Linear sequence</h3>
  <div class="card" style="padding:0"><div class="tablewrap" style="max-height:50vh">
    <table><colgroup><col style="width:52px"><col style="width:130px"><col style="width:88px"><col><col style="width:96px"></colgroup>
    <thead><tr><th>#</th><th>Lane</th><th>Type</th><th>Action</th><th>Req</th></tr></thead>
    <tbody>${s.steps.map(x=>`<tr>
      <td class="mono">${x.n}</td><td class="wrap">${esc(x.lane)}</td>
      <td>${x.decision?'<span class="tag p-Medium">Decision</span>':'<span class="tag p-Low">Task</span>'}</td>
      <td class="wrap">${esc(x.full)}</td><td class="mono dim">${esc(x.reqId||'—')}</td></tr>`).join('')}</tbody></table>
  </div></div>`;
  try{ renderSwimlaneSVG(E('swimlane'), s.steps); }catch(e){ console.error('swimlane failed',e); }
}

/* ---------------- GLOSSARY ---------------- */
function renderGlossary(){
  const g=STATE.el.glossary||[];
  E('p-glossary').innerHTML = `
  <div class="toolbar"><span class="dim">${g.length} term${g.length===1?'':'s'} & acronym${g.length===1?'':'s'} detected${(typeof Store!=='undefined'&&Store.available())?' · shared terms cross-reference in the brain':''}</span></div>
  ${g.length?`<div class="card" style="padding:0"><div class="tablewrap">
    <table><colgroup><col style="width:180px"><col></colgroup>
    <thead><tr><th>Term</th><th>Definition</th></tr></thead>
    <tbody>${g.map(t=>`<tr><td class="wrap"><strong>${esc(t.term)}</strong></td><td class="wrap dim">${esc(t.definition||'—')}</td></tr>`).join('')}</tbody></table>
  </div></div>`:emptyMsg('No glossary terms or acronyms detected.')}`;
}

/* ---------------- E2E SCENARIOS ---------------- */
function renderScenarios(){
  const s=STATE;
  if(!s.scen.length){ E('p-scenarios').innerHTML=emptyMsg('No scenarios could be derived.'); return; }
  E('p-scenarios').innerHTML=`
  <div class="toolbar"><span class="dim">${s.scen.length} end-to-end scenarios derived from the process flow, integrations and measurable targets</span></div>
  ${s.scen.map(x=>`<details ${x.type==='Positive'?'open':''}>
    <summary>
      <span class="mono" style="color:var(--accent);flex:0 0 auto">${esc(x.id)}</span>
      <span class="stitle">${esc(x.name)}</span><span class="chip">${esc(x.type)}</span>
    </summary>
    <div class="dbody">
      <div class="kv"><div class="k">Actors</div><div class="v">${esc(x.actors.join(', '))}</div>
        ${x.reqs.length?`<div class="k">Traces to</div><div class="v mono">${esc(x.reqs.join(', '))}</div>`:''}</div>
      <div style="margin-top:12px"><span style="color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px">Scenario steps</span></div>
      <ol class="tsteps">${x.steps.map(st=>`<li>${esc(st)}</li>`).join('')}</ol>
      <div class="exp"><strong>Expected result:</strong> ${esc(x.expected)}</div>
    </div></details>`).join('')}`;
}

/* ---------------- TEST CASES ---------------- */
function renderTests(){
  const s=STATE;
  E('p-tests').innerHTML=`
  <div class="toolbar">
    <input type="search" id="tq" placeholder="Search test cases…">
    <select id="ttype"><option value="">All types</option>${[...new Set(s.tests.map(t=>t.type))].sort().map(t=>`<option>${t}</option>`).join('')}</select>
    <select id="tpri"><option value="">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select>
    <span class="dim mono" id="tcount"></span>
  </div>
  <div id="tlist"></div>`;
  const draw=()=>{
    const q=E('tq').value.toLowerCase(), ty=E('ttype').value, p=E('tpri').value;
    const rows=s.tests.filter(t=>(!q||t.title.toLowerCase().includes(q)||String(t.req).toLowerCase().includes(q))&&(!ty||t.type===ty)&&(!p||t.priority===p));
    E('tcount').textContent=`${rows.length} of ${s.tests.length}`;
    E('tlist').innerHTML=rows.map(t=>`<details>
      <summary>
        <span class="mono" style="color:var(--accent);flex:0 0 auto">${esc(t.id)}</span>
        <span class="stitle">${esc(t.title)}</span>
        <span class="tag p-${t.priority}">${esc(t.priority)}</span><span class="chip">${esc(t.type)}</span>
      </summary>
      <div class="dbody">
        <div class="kv">
          <div class="k">Traces to</div><div class="v mono">${esc(t.req)}</div>
          ${t.basis?`<div class="k">Verifies</div><div class="v">${esc(t.basis)}</div>`:''}
          <div class="k">Preconditions</div><div class="v">${esc(t.pre)}</div>
        </div>
        <div style="margin-top:12px"><span class="k" style="color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px">Test steps</span></div>
        <ol class="tsteps">${t.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
        <div class="exp"><strong>Expected result:</strong> ${esc(t.expected)}</div>
        ${t.vague?`<div class="action-box"><strong>Note:</strong> This requirement could not be parsed into a concrete action. It needs rewriting before a meaningful test can exist.</div>`:''}
      </div></details>`).join('') || emptyMsg('No matches');
  };
  ['tq','ttype','tpri'].forEach(id=>E(id).addEventListener('input',draw));
  draw();
}

/* ---------------- TRACEABILITY ---------------- */
function renderTrace(){
  const s=STATE;
  const map={}; s.reqs.forEach(r=>map[r.id]={req:r,tests:[],scen:[]});
  s.tests.forEach(t=>String(t.req).split(',').map(x=>x.trim()).forEach(id=>{ if(map[id]) map[id].tests.push(t.id); }));
  s.scen.forEach(sc=>sc.reqs.forEach(id=>{ if(map[id]) map[id].scen.push(sc.id); }));
  const rows=Object.values(map);
  const uncovered=rows.filter(r=>!r.tests.length).length;
  E('p-trace').innerHTML=`
  <div class="grid g4" style="margin-bottom:18px">
    <div class="card"><div class="kpi acc">${rows.length}</div><div class="klabel">Requirements</div></div>
    <div class="card"><div class="kpi ok">${rows.length-uncovered}</div><div class="klabel">Covered</div></div>
    <div class="card"><div class="kpi ${uncovered?'bad':'ok'}">${uncovered}</div><div class="klabel">Uncovered</div></div>
    <div class="card"><div class="kpi">${Math.round((rows.length-uncovered)/Math.max(1,rows.length)*100)}%</div><div class="klabel">Coverage</div></div>
  </div>
  <div class="card" style="padding:0"><div class="tablewrap">
    <table><colgroup><col style="width:96px"><col style="width:62px"><col><col style="width:190px"><col style="width:118px"><col style="width:88px"></colgroup>
    <thead><tr><th>Req ID</th><th>Type</th><th>Requirement</th><th>Test cases</th><th>Scenarios</th><th>Status</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td class="mono">${esc(r.req.id)}</td><td><span class="tag t-${r.req.cat}">${r.req.cat}</span></td>
      <td class="wrap">${esc(r.req.text)}</td>
      <td class="wrap mono dim" style="font-size:11px">${esc(r.tests.join(', ')||'—')}</td>
      <td class="wrap mono dim" style="font-size:11px">${esc(r.scen.join(', ')||'—')}</td>
      <td>${r.tests.length?'<span class="tag p-Low">Covered</span>':'<span class="tag p-High">Gap</span>'}</td>
    </tr>`).join('')}</tbody></table>
  </div></div>`;
}

/* ---------------- OBJECTIVES ---------------- */
function renderObjectives(){
  const s=STATE, o=s.el.objectives;
  E('p-objectives').innerHTML=`
  <div class="toolbar"><span class="dim">${o.length} objective${o.length===1?'':'s'} extracted from goal / purpose / vision content</span></div>
  ${o.length? `<div class="card"><ul class="itemlist">${o.map(x=>`<li><span class="mono dim" style="flex:0 0 auto">${esc(x.id)}</span> <span class="li-main">${esc(x.text)}</span></li>`).join('')}</ul></div>`
    : emptyMsg('No objectives detected.')}`;
}

/* ---------------- SCOPE ---------------- */
function renderScope(){
  const s=STATE, i=s.el.scopeIn, o=s.el.scopeOut;
  E('p-scope').innerHTML=`
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
    <div><h3 class="sec" style="color:var(--ok)">✓ In scope (${i.length})</h3>
      ${i.length?`<div class="card"><ul class="itemlist ok">${i.map(x=>`<li><span class="li-main">${esc(x)}</span></li>`).join('')}</ul></div>`:emptyMsg('No in-scope items detected.')}</div>
    <div><h3 class="sec" style="color:var(--bad)">✕ Out of scope (${o.length})</h3>
      ${o.length?`<div class="card"><ul class="itemlist bad">${o.map(x=>`<li><span class="li-main">${esc(x)}</span></li>`).join('')}</ul></div>`:emptyMsg('No out-of-scope items detected.')}</div>
  </div>
  ${renderAssumptionsBlock(s)}`;
}
function renderAssumptionsBlock(s){
  const {assumptions,constraints,dependencies}=s.el;
  if(!assumptions.length&&!constraints.length&&!dependencies.length) return '';
  const col=(title,arr)=>arr.length?`<div><h3 class="sec">${title} (${arr.length})</h3>${listCard(arr)}</div>`:'';
  return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:8px">
    ${col('Assumptions',assumptions)}${col('Constraints',constraints)}${col('Dependencies',dependencies)}</div>`;
}

/* ---------------- STAKEHOLDERS ---------------- */
function renderStakeholders(){
  const s=STATE, st=s.el.stakeholders;
  E('p-stakeholders').innerHTML=`
  <div class="toolbar"><span class="dim">${st.length} stakeholder${st.length===1?'':'s'} / role${st.length===1?'':'s'} identified</span></div>
  ${st.length?`<div class="card" style="padding:0"><div class="tablewrap">
    <table><colgroup><col style="width:200px"><col style="width:200px"><col></colgroup>
    <thead><tr><th>Name / Team</th><th>Role</th><th>Notes</th></tr></thead>
    <tbody>${st.map(x=>`<tr><td class="wrap"><strong>${esc(x.name)}</strong></td><td class="wrap">${esc(x.role)}</td><td class="wrap dim">${esc(x.note||'—')}</td></tr>`).join('')}</tbody></table>
  </div></div>`:emptyMsg('No stakeholders or roles detected.')}`;
}

/* ---------------- MILESTONES ---------------- */
function renderMilestones(){
  const s=STATE, m=s.el.milestones;
  E('p-milestones').innerHTML=`
  <div class="toolbar"><span class="dim">${m.length} milestone${m.length===1?'':'s'} / key date${m.length===1?'':'s'}</span></div>
  ${m.length?`<div class="card"><div class="timeline">${m.map(x=>`
    <div class="tl-item"><div class="tl-dot"></div>
      <div class="tl-body"><div class="tl-label">${esc(x.label)}</div>${x.date?`<div class="tl-date mono">${esc(x.date)}</div>`:''}</div>
    </div>`).join('')}</div></div>`:emptyMsg('No milestones or dates detected.')}`;
}

/* ---------------- RISKS ---------------- */
function renderRisks(){
  const s=STATE, r=s.el.risks;
  E('p-risks').innerHTML=`
  <div class="toolbar"><span class="dim">${r.length} risk${r.length===1?'':'s'} identified${r.filter(x=>x.mitigation).length?` · ${r.filter(x=>x.mitigation).length} with mitigation`:''}</span></div>
  ${r.length?`<div class="card" style="padding:0"><div class="tablewrap">
    <table><colgroup><col style="width:84px"><col><col></colgroup>
    <thead><tr><th>Severity</th><th>Risk</th><th>Mitigation</th></tr></thead>
    <tbody>${r.map(x=>`<tr><td>${sevTag(x.sev)||'<span class="dim">—</span>'}</td>
      <td class="wrap">${esc(x.risk)}</td>
      <td class="wrap dim">${x.mitigation?esc(x.mitigation):'<span style="color:var(--warn)">no mitigation stated</span>'}</td></tr>`).join('')}</tbody></table>
  </div></div>`:emptyMsg('No risks detected.')}`;
}

/* ---------------- PERSONAS ---------------- */
function renderPersonas(){
  const s=STATE, p=s.el.personas;
  E('p-personas').innerHTML=`
  <div class="toolbar"><span class="dim">${p.length} persona${p.length===1?'':'s'} / user type${p.length===1?'':'s'}</span></div>
  ${p.length?`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    ${p.map(x=>`<div class="card"><div class="persona-name">👤 ${esc(x.name)}</div>${x.desc?`<div class="dim" style="margin-top:6px;font-size:12.5px">${esc(x.desc)}</div>`:''}</div>`).join('')}
  </div>`:emptyMsg('No personas detected.')}`;
}

/* ---------------- FEATURES ---------------- */
function renderFeatures(){
  const s=STATE, f=s.el.features;
  E('p-features').innerHTML=`
  <div class="toolbar"><span class="dim">${f.length} feature${f.length===1?'':'s'} / capabilit${f.length===1?'y':'ies'}</span></div>
  ${f.length?`<div class="card" style="padding:0"><div class="tablewrap">
    <table><colgroup><col style="width:96px"><col style="width:280px"><col></colgroup>
    <thead><tr><th>ID</th><th>Feature</th><th>Detail</th></tr></thead>
    <tbody>${f.map(x=>`<tr><td class="mono">${esc(x.id)}</td><td class="wrap"><strong>${esc(x.name)}</strong></td><td class="wrap dim">${esc(x.desc||'—')}</td></tr>`).join('')}</tbody></table>
  </div></div>`:emptyMsg('No features detected.')}`;
}

/* ---------------- METRICS / KPIs ---------------- */
function renderMetrics(){
  const s=STATE, m=s.el.metrics;
  E('p-metrics').innerHTML=`
  <div class="toolbar"><span class="dim">${m.length} metric${m.length===1?'':'s'} / KPI${m.length===1?'':'s'} with success targets</span></div>
  ${m.length?`<div class="grid g4">${m.map(x=>`<div class="card">
      <div class="kpi acc" style="font-size:22px">${esc(x.target||'—')}</div>
      <div class="klabel" style="text-transform:none;letter-spacing:0;font-size:12px;margin-top:6px">${esc(x.name)}</div>
    </div>`).join('')}</div>`:emptyMsg('No metrics or KPIs detected.')}`;
}

/* ---------------- USER STORIES ---------------- */
function renderStories(){
  const s=STATE, st=s.el.stories;
  E('p-stories').innerHTML=`
  <div class="toolbar"><span class="dim">${st.length} user stor${st.length===1?'y':'ies'}${st.filter(x=>x.ac.length).length?` · ${st.filter(x=>x.ac.length).length} with acceptance criteria`:''}</span></div>
  ${st.length? st.map(x=>`<details>
    <summary>
      <span class="mono" style="color:var(--accent);flex:0 0 auto">${esc(x.id)}</span>
      <span class="stitle">As a ${esc(x.role||'user')}, I want ${esc(x.want)}</span>
      ${x.points?`<span class="tag p-Medium">${esc(x.points)} pts</span>`:''}
    </summary>
    <div class="dbody">
      <div class="kv">
        <div class="k">Role</div><div class="v">${esc(titleCase(x.role||'user'))}</div>
        <div class="k">Wants</div><div class="v">${esc(x.want)}</div>
        ${x.benefit?`<div class="k">So that</div><div class="v">${esc(x.benefit)}</div>`:''}
      </div>
      ${x.ac.length?`<div style="margin-top:12px"><span style="color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px">Acceptance criteria</span></div>
        <ul class="tsteps">${x.ac.map(a=>`<li>${esc(a)}</li>`).join('')}</ul>`:`<div class="action-box" style="margin-top:10px"><strong>Gap:</strong> no acceptance criteria found — this story is not yet testable.</div>`}
    </div></details>`).join('') : emptyMsg('No user stories detected.')}`;
}

/* ---------------- ACTIONS & DECISIONS ---------------- */
function renderActions(){
  const s=STATE, a=s.el.actions, q=s.el.questions;
  E('p-actions').innerHTML=`
  <h3 class="sec">Action items (${a.length})</h3>
  ${a.length?`<div class="card" style="padding:0"><div class="tablewrap">
    <table><colgroup><col><col style="width:160px"><col style="width:140px"></colgroup>
    <thead><tr><th>Action</th><th>Owner</th><th>Due</th></tr></thead>
    <tbody>${a.map(x=>`<tr><td class="wrap">${esc(x.text)}</td><td class="wrap dim">${esc(x.owner||'—')}</td><td class="wrap dim">${esc(x.due||'—')}</td></tr>`).join('')}</tbody></table>
  </div></div>`:emptyMsg('No action items detected.')}
  <h3 class="sec">Open questions / decisions pending (${q.length})</h3>
  ${q.length?`<div class="card"><ul class="itemlist warn">${q.map(x=>`<li><span class="li-main">${esc(x)}</span></li>`).join('')}</ul></div>`:emptyMsg('No open questions detected.')}`;
}

/* ---------------- QUALITY & GAPS ---------------- */
function renderGaps(){
  const s=STATE;
  const bad=s.gaps.filter(g=>g.sev==='bad').length, warn=s.gaps.filter(g=>g.sev==='warn').length;
  E('p-gaps').innerHTML=`
  <div class="grid g4" style="margin-bottom:18px">
    <div class="card"><div class="kpi ${scoreClass(s.score)}">${s.score}</div><div class="klabel">Quality score</div></div>
    <div class="card"><div class="kpi bad">${bad}</div><div class="klabel">Critical findings</div></div>
    <div class="card"><div class="kpi warn">${warn}</div><div class="klabel">Warnings</div></div>
    <div class="card"><div class="kpi">${s.el.questions.length + s.reqs.filter(r=>r.cat==='OI').length}</div><div class="klabel">Open items</div></div>
  </div>
  <h3 class="sec">Findings — each names the content at fault</h3>
  ${s.gaps.length? s.gaps.map(g=>`
    <details ${g.sev==='bad'?'open':''}>
      <summary>
        <span style="flex:0 0 auto;font-size:15px">${g.sev==='bad'?'⛔':'⚠️'}</span>
        <span class="stitle">${esc(g.title)}</span>
        <span class="tag ${g.sev==='bad'?'p-High':'p-Medium'}">${g.sev==='bad'?'Critical':'Warning'}</span>
      </summary>
      <div class="dbody">
        <div style="font-size:12.8px;line-height:1.6">${esc(g.detail)}</div>
        ${g.evidence.length?`<div style="margin-top:12px">
          <span style="color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px">Evidence</span>
          ${g.evidence.map(e=>`<div class="ev"><span class="evid">${esc(e.id)}</span>${esc(e.text)}
            ${e.note?`<span class="evnote">${esc(e.note)}</span>`:''}</div>`).join('')}
        </div>`:''}
        ${g.action?`<div class="action-box"><strong>Recommended action:</strong> ${esc(g.action)}</div>`:''}
      </div>
    </details>`).join('')
   : '<div class="card"><span style="color:var(--ok)">No structural issues detected.</span></div>'}`;
}

/* ---------------- TAB REGISTRY ---------------- */
const VIEWS = {
  overview:     {label:'Overview',            render:renderOverview,     has:()=>true},
  requirements: {label:'Requirements',        render:renderRequirements, has:s=>s.reqs.length>0},
  flow:         {label:'Process Flow',        render:renderFlow,         has:s=>s.steps.length>0},
  scenarios:    {label:'E2E Scenarios',       render:renderScenarios,    has:s=>s.scen.length>0},
  tests:        {label:'Test Cases',          render:renderTests,        has:s=>s.tests.length>0},
  trace:        {label:'Traceability',        render:renderTrace,        has:s=>s.reqs.length>0},
  objectives:   {label:'Objectives',          render:renderObjectives,   has:s=>s.el.objectives.length>0},
  scope:        {label:'Scope',               render:renderScope,        has:s=>s.el.scopeIn.length+s.el.scopeOut.length+s.el.assumptions.length+s.el.constraints.length+s.el.dependencies.length>0},
  stakeholders: {label:'Stakeholders',        render:renderStakeholders, has:s=>s.el.stakeholders.length>0},
  milestones:   {label:'Milestones',          render:renderMilestones,   has:s=>s.el.milestones.length>0},
  risks:        {label:'Risks',               render:renderRisks,        has:s=>s.el.risks.length>0},
  personas:     {label:'Personas',            render:renderPersonas,     has:s=>s.el.personas.length>0},
  features:     {label:'Features',            render:renderFeatures,     has:s=>s.el.features.length>0},
  metrics:      {label:'Metrics & KPIs',      render:renderMetrics,      has:s=>s.el.metrics.length>0},
  stories:      {label:'User Stories',        render:renderStories,      has:s=>s.el.stories.length>0},
  actions:      {label:'Actions & Decisions', render:renderActions,      has:s=>s.el.actions.length+s.el.questions.length>0},
  glossary:     {label:'📖 Glossary',          render:renderGlossary,     has:s=>(s.el.glossary||[]).length>0},
  gaps:         {label:'Quality & Gaps',      render:renderGaps,         has:()=>true}
};
