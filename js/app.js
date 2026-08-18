/* ============================================================
   APP ORCHESTRATION — pipeline, adaptive tab mounting, file
   loading, export and wiring. Runs fully in the browser; no
   network, no AI. Load order (see index.html) puts every engine
   and view module in global scope before this file executes.
   ============================================================ */

let STATE=null;

const EMPTY_EL = {objectives:[],scopeIn:[],scopeOut:[],stakeholders:[],milestones:[],risks:[],
  assumptions:[],constraints:[],dependencies:[],personas:[],features:[],metrics:[],stories:[],actions:[],questions:[]};

/* ---------- Master analyze pipeline ---------- */
function analyze(text, fileName, fileSize){
  const norm=normalize(text);
  const lines=norm.split('\n');
  const sections=detectSections(lines);
  const reqs=extractRequirements(lines,sections);

  // Semantic pass: decompose every requirement into actor/action/object/…
  reqs.forEach(r=>{ try{ r.sem=decompose(r.text, ACTOR_HINTS); }catch(e){ r.sem=null; } });

  const steps=extractFlow(lines,reqs);
  const scen=buildScenarios(reqs,steps);
  const tests=genTests(reqs,scen);
  const gaps=analyzeSemanticGaps(reqs,sections,norm);
  const scoring=scoreDocument(reqs,gaps,sections,norm);
  const meta=extractMeta(norm,lines);
  const words=norm.split(/\s+/).filter(Boolean).length;
  const actors=[...new Set(reqs.map(r=>r.sem&&r.sem.actor?r.sem.actor.name:null).filter(Boolean))].sort();

  let el; try{ el=extractElements(lines,sections); }catch(e){ console.error('element extraction failed',e); el=Object.assign({},EMPTY_EL); }
  let docType; try{ docType=classifyDocument(norm,lines,sections,reqs,el,steps); }
  catch(e){ console.error('classification failed',e); docType={id:'generic',name:'General Business Document',short:'Auto',icon:'📄',confidence:40,ranked:[]}; }

  STATE={meta,fileName,fileSize,words,lines:lines.length,sections,reqs,steps,scen,tests,
         gaps,actors,score:scoring.score,dims:scoring.dims,el,docType,activeType:docType.id,
         norm};                       // keep normalized text so added requirements can recompute
  mount();
}

/* ---------- Mount the adaptive UI ---------- */
function mount(){
  E('tabs').classList.remove('hidden');
  E('fileinfo').classList.remove('hidden');
  E('drop').classList.add('hidden');
  E('fname').textContent=STATE.fileName;
  E('fmeta').innerHTML=`${STATE.docType.icon} <strong>${esc(STATE.docType.name)}</strong> · `+
    `${(STATE.fileSize/1024).toFixed(1)} KB · ${STATE.words.toLocaleString()} words · ${STATE.sections.length} sections`;
  E('addbrain').classList.toggle('hidden', !brainOn());
  buildTabs();
  // If this document has stored clarifications from a previous session, fold them back in.
  if(brainOn() && typeof loadPriorClarifications==='function') loadPriorClarifications();
}

/* Ordered, curated tab set for the active document type, minus empty views. */
function activeTabIds(){
  let ids=tabsForType(STATE.activeType).filter(id=>VIEWS[id] && VIEWS[id].has(STATE));
  if(!ids.includes('overview')) ids.unshift('overview');
  // Connections (how this doc relates to the brain) sits right after Overview.
  if(VIEWS.connections && VIEWS.connections.has(STATE) && !ids.includes('connections')) ids.splice(1,0,'connections');
  // Glossary appears when the document defines terms/acronyms.
  if(VIEWS.glossary && VIEWS.glossary.has(STATE) && !ids.includes('glossary')) ids.push('glossary');
  // Clarify (living-document Q&A) sits just before Quality & Gaps on every document.
  if(VIEWS.clarify && !ids.includes('clarify')) ids.push('clarify');
  if(!ids.includes('gaps')) ids.push('gaps');
  // AI Insights tab appears only when a local Ollama is reachable.
  if(VIEWS.ai && VIEWS.ai.has(STATE) && !ids.includes('ai')) ids.push('ai');
  return ids;
}

function buildTabs(keepActive){
  const ids=activeTabIds();
  // Preserve which tab is open across rebuilds (e.g. after recording an answer).
  const prev = keepActive || (document.querySelector('#tabs .tab.active')||{}).dataset && document.querySelector('#tabs .tab.active').dataset.p;
  const active = ids.includes(prev) ? prev : ids[0];
  E('tabs').innerHTML=ids.map(id=>`<div class="tab ${id===active?'active':''}" data-p="${id}">${esc(VIEWS[id].label)}</div>`).join('');
  E('panes').innerHTML=ids.map(id=>`<div class="pane ${id===active?'active':''}" id="p-${id}"></div>`).join('');
  // Render each present view once, up front.
  ids.forEach(id=>{ try{ VIEWS[id].render(); }catch(e){ console.error('render '+id+' failed',e); E('p-'+id).innerHTML=emptyMsg('This view could not be rendered.'); } });
  // Tab switching
  document.querySelectorAll('#tabs .tab').forEach(t=>t.onclick=()=>{
    document.querySelectorAll('#tabs .tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('#panes .pane').forEach(x=>x.classList.remove('active'));
    t.classList.add('active'); E('p-'+t.dataset.p).classList.add('active');
  });
  // Populate + wire the "view as" override (lives inside the overview pane).
  wireTypeOverride();
}

function wireTypeOverride(){
  const sel=E('typeoverride'); if(!sel) return;
  sel.innerHTML=DOC_TYPES.map(t=>`<option value="${t.id}" ${t.id===STATE.activeType?'selected':''}>${t.icon} ${esc(t.name)}</option>`).join('');
  sel.onchange=()=>{ STATE.activeType=sel.value; buildTabs();
    // keep the user on the Overview tab after switching lens
    const first=document.querySelector('#tabs .tab'); if(first) first.click();
  };
}

/* ---------- Export: printable report of the current lens ---------- */
function exportReport(){
  const ids=activeTabIds();
  const w=window.open('','_blank');
  if(!w){ alert('Pop-up blocked — allow pop-ups to export the report.'); return; }
  const body=ids.map(id=>`<div class="pane active"><h2 style="border-bottom:1px solid var(--line);padding-bottom:8px">${esc(VIEWS[id].label)}</h2>${E('p-'+id).innerHTML}</div>`).join('');
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+esc(STATE.docType.name)+' Report — '+esc(STATE.meta.title)+'</title>'+
    document.querySelector('style').outerHTML+'</head><body><main>'+
    '<h1 style="font-size:18px">'+esc(STATE.docType.icon)+' '+esc(STATE.meta.title)+' <span style="font-weight:400;color:var(--dim);font-size:13px">— '+esc(STATE.docType.name)+'</span></h1>'+
    body+'</main></body></html>');
  w.document.close();
  setTimeout(()=>w.print(),700);
}

/* ---------- Export: test cases → CSV ---------- */
function exportCSV(){
  if(!STATE.tests.length){ alert('No test cases were generated for this document.'); return; }
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const rows=[['Test ID','Requirement ID','Category','Test Type','Priority','Title',
               'Verifies','Preconditions','Test Steps','Expected Result','Parse Confidence']];
  STATE.tests.forEach(t=>rows.push([t.id,t.req,t.cat,t.type,t.priority,t.title,
    t.basis||'', t.pre, t.steps.map((s,i)=>(i+1)+'. '+s).join('\n'), t.expected,
    (t.confidence!=null? t.confidence+'%':'')]));
  const blob=new Blob(['﻿'+rows.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=STATE.fileName.replace(/\.[^.]+$/,'')+'_testcases.csv';
  a.click(); URL.revokeObjectURL(a.href);
}

/* Convert mammoth's HTML to line-based text, PRESERVING tables as tab-separated
   rows. Word tables (RACI, risk registers, stakeholder lists) otherwise collapse
   to one cell per line — which destroys row structure and pollutes heading
   detection. Tab-joined rows are exactly what the table extractors expect. */
function htmlToText(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  const out=[];
  const clean=t=>(t||'').replace(/ /g,' ').replace(/\s+/g,' ').trim();
  (function walk(node){
    for(const n of node.childNodes){
      if(n.nodeType!==1) continue;
      const tag=n.tagName.toLowerCase();
      if(tag==='table'){
        for(const tr of n.querySelectorAll('tr')){
          const cells=[...tr.querySelectorAll('th,td')].map(td=>clean(td.textContent));
          if(cells.some(Boolean)) out.push(cells.join('\t'));
        }
        out.push('');
      } else if(/^(h[1-6]|p|li)$/.test(tag)){
        const t=clean(n.textContent); if(t) out.push(t);
      } else { walk(n); }
    }
  })(doc.body);
  return out.join('\n');
}

/* ---------- File loading ---------- */
async function readFile(f){
  const ext=f.name.split('.').pop().toLowerCase();
  if(ext==='docx'){
    const buf=await f.arrayBuffer();
    const r=await mammoth.convertToHtml({arrayBuffer:buf});   // HTML keeps table structure
    return htmlToText(r.value);
  }
  if(ext==='xlsx'||ext==='xls'){
    const buf=await f.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    return wb.SheetNames.map(n=>{
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,blankrows:false});
      return `\n${n}\n`+rows.map(r=>r.map(c=>c==null?'':String(c)).join('\t')).join('\n');
    }).join('\n\n');
  }
  if(ext==='pdf'){
    const buf=await f.arrayBuffer();
    if(typeof pdfjsLib==='undefined')
      throw new Error('PDF support is not bundled in this build. Convert the file to .docx, .txt or .md and try again.');
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    let out='';
    for(let i=1;i<=pdf.numPages;i++){
      const pg=await pdf.getPage(i);
      const tc=await pg.getTextContent();
      let last=null;
      tc.items.forEach(it=>{ if(last!==null && Math.abs(it.transform[5]-last)>3) out+='\n'; out+=it.str+' '; last=it.transform[5]; });
      out+='\n\n';
    }
    return out;
  }
  return await f.text();
}

async function handle(f){
  if(!f) return;
  E('drop').innerHTML='<h2><span class="spin"></span> Parsing '+esc(f.name)+'…</h2><p>Everything stays on this machine.</p>';
  try{
    const text=await readFile(f);
    if(!text || text.trim().length<40) throw new Error('Document appears empty or unreadable.');
    analyze(text,f.name,f.size);
  }catch(err){
    E('drop').innerHTML='<h2 style="color:var(--bad)">Could not read file</h2><p>'+esc(err.message)+'</p><p style="margin-top:10px"><button class="btn">Try another file</button></p>';
    E('drop').querySelector('button').onclick=e=>{e.stopPropagation();resetAll();};
    console.error(err);
  }
}

function resetAll(){
  STATE=null;
  E('tabs').classList.add('hidden'); E('fileinfo').classList.add('hidden');
  E('tabs').innerHTML=''; E('panes').innerHTML='';
  E('drop').classList.remove('hidden');
  E('drop').innerHTML='<h2>Drop your business document here</h2><p>.docx · .xlsx · .csv · .txt · .md · .pdf &nbsp;—&nbsp; or click to browse</p><input type="file" id="file" class="hidden" accept=".docx,.xlsx,.xls,.csv,.txt,.md,.pdf">';
  wire();
}

function wire(){
  const d=E('drop'), f=E('file');
  d.onclick=()=>f.click();
  f.onchange=e=>handle(e.target.files[0]);
  d.ondragenter=e=>{ e.preventDefault(); d.classList.add('over'); };
  d.ondragover =e=>{ e.preventDefault(); d.classList.add('over'); };
  d.ondragleave=e=>{ e.preventDefault(); d.classList.remove('over'); };
  d.ondrop     =e=>{ e.preventDefault(); d.classList.remove('over'); handle(e.dataTransfer.files[0]); };
}

/* ---------- Brain mode + chrome ---------- */
function setMode(m){
  const brain = m==='brain', projects = m==='projects', os = m==='os', doc = !brain && !projects && !os;
  E('brain').classList.toggle('hidden', !brain);
  E('projects').classList.toggle('hidden', !projects);
  E('os').classList.toggle('hidden', !os);
  E('drop').classList.toggle('hidden', !doc || !!STATE);
  E('fileinfo').classList.toggle('hidden', !doc || !STATE);
  E('tabs').classList.toggle('hidden', !doc || !STATE);
  E('panes').classList.toggle('hidden', !doc);
  E('mode-doc').classList.toggle('active', doc);
  E('mode-brain').classList.toggle('active', brain);
  E('mode-projects').classList.toggle('active', projects);
  E('mode-os').classList.toggle('active', os);
  if(brain) renderBrain();
  if(projects) renderProjects();
  if(os && typeof renderOS==='function') renderOS();
}
function toast(msg){
  const t=E('toast'); t.textContent=msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.add('hidden'), 3200);
}
const brainOn = ()=> Store.available();
function updateChrome(){
  const s=E('ai-status');
  // Brain + settings are always available in the browser (no server needed).
  ['mode-doc','mode-os','mode-projects','mode-brain','settings-btn'].forEach(id=>E(id).classList.remove('hidden'));
  if(STATE) E('addbrain').classList.toggle('hidden', !brainOn());
  if(AI.available){ s.textContent=AI.label; s.className='pill on'; }
  else if(brainOn()){ s.textContent='Brain on · AI off'; s.className='pill'; }
  else { s.textContent='Local only'; s.className='pill off'; }
}
async function addToBrain(){
  if(!STATE) return;
  try{
    const r=await brainIngest();
    if(!r.ok) throw new Error(r.error||'ingest failed');
    const rec=(r.recurring||[]).filter(x=>x.docs>1);
    toast(rec.length ? `Added. ${rec.length} entit${rec.length===1?'y':'ies'} now cross-referenced (e.g. ${rec[0].title}).`
                     : `Added “${STATE.meta.title||STATE.fileName}” to the brain (${r.entities} entities).`);
    E('addbrain').textContent='✓ In Brain';
    setTimeout(()=>E('addbrain').textContent='＋ Add to Brain', 2500);
  }catch(e){ toast('Could not add to brain: '+e.message); }
}
function openSettings(){
  E('settings').classList.remove('hidden');
  const c=AI.cfg||{};
  E('settings-body').innerHTML=`
    <div class="kv">
      <div class="k">Brain storage</div><div class="v">${brainOn()?'browser storage ✓ (persists on this machine)':'unavailable — use Export/Import to save'}</div>
      <div class="k">AI status</div><div class="v">${AI.available?esc(AI.label)+' ✓':'off'}</div>
      <div class="k">AI provider</div><div class="v"><select id="set-prov">
        <option value="auto"${!c.provider||c.provider==='auto'?' selected':''}>Auto — on-device browser AI</option>
        <option value="webllm"${c.provider==='webllm'?' selected':''}>In-browser model (WebLLM · Qwen/Llama)</option>
        <option value="openai"${c.provider==='openai'?' selected':''}>OpenAI-compatible / Ollama (open or internal server)</option>
        <option value="anthropic"${c.provider==='anthropic'?' selected':''}>Anthropic endpoint</option>
        <option value="off"${c.provider==='off'?' selected':''}>Off</option>
      </select></div>
    </div>
    <div id="set-webllm" class="${c.provider==='webllm'?'':'hidden'}" style="margin-top:10px">
      <div class="kv"><div class="k">Model</div><div class="v"><select id="set-wmodel" style="width:100%">
        ${WEBLLM_MODELS.map(m=>`<option value="${m.id}"${c.model===m.id?' selected':''}>${esc(m.label)}</option>`).join('')}
      </select></div></div>
    </div>
    <div id="set-cloud" class="${(c.provider==='openai'||c.provider==='anthropic')?'':'hidden'}" style="margin-top:10px">
      <div class="kv">
        <div class="k">Endpoint</div><div class="v"><input id="set-endpoint" type="text" style="width:100%" placeholder="https://…" value="${esc(c.endpoint||'')}"></div>
        <div class="k">API key</div><div class="v"><input id="set-key" type="password" style="width:100%" placeholder="stored only in this browser" value="${esc(c.key||'')}"></div>
        <div class="k">Model</div><div class="v"><input id="set-cmodel" type="text" style="width:100%" placeholder="e.g. gpt-4o-mini / claude-… " value="${esc(c.model||'')}"></div>
      </div>
    </div>
    <div id="set-hint" class="dim" style="font-size:11.5px;margin-top:12px"></div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn sm" id="set-save">Save & re-check</button>
      <button class="btn ghost sm" id="set-export">⬇ Export brain</button>
      <button class="btn ghost sm" id="set-import">⬆ Import brain</button>
      <input type="file" id="set-import-file" accept=".json" class="hidden">
    </div>`;
  const prov=E('set-prov');
  const syncHint=()=>{
    E('set-cloud').classList.toggle('hidden', !(prov.value==='openai'||prov.value==='anthropic'));
    E('set-webllm').classList.toggle('hidden', prov.value!=='webllm');
    E('set-hint').innerHTML = prov.value==='auto'
      ? 'On-device AI uses Chrome/Edge’s built-in model — no key, nothing leaves your laptop. If your browser doesn’t support it, AI features stay hidden.'
      : prov.value==='webllm'
      ? 'Runs a real small model (Qwen/Llama) inside your browser via WebGPU — no install, no server, nothing leaves your machine. The first use downloads the model (~1–2 GB, cached afterward). Needs a recent Chrome/Edge and network access to the model CDN.'
      : prov.value==='off' ? 'AI features are turned off. Everything else still works.'
      : 'Paste an approved endpoint + key (OpenAI-compatible or Anthropic). Works with an open LLM provider, Claude/Anthropic, or an Ollama server on your internal network — e.g. endpoint http://your-server:11434/v1, any key, model qwen2.5:3b. The key is stored only in this browser and used directly from your machine.'; };
  prov.onchange=syncHint; syncHint();
  E('set-save').onclick=async()=>{
    const provider=prov.value;
    const cfg = (provider==='openai'||provider==='anthropic')
      ? {provider, endpoint:E('set-endpoint').value.trim(), key:E('set-key').value.trim(), model:E('set-cmodel').value.trim()}
      : provider==='webllm' ? {provider, model:E('set-wmodel').value}
      : {provider};
    saveAICfg(cfg); await probeAI(); updateChrome(); openSettings(); toast('Settings saved. '+AI.label);
  };
  E('set-export').onclick=()=>{
    const blob=new Blob([Store.exportAll()],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='brain-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  E('set-import').onclick=()=>E('set-import-file').click();
  E('set-import-file').onchange=async e=>{ const f=e.target.files[0]; if(!f) return;
    const r=Store.importAll(await f.text()); toast(r.ok?`Brain imported (${r.stats.documents} docs).`:('Import failed: '+r.error));
    if(r.ok){ E('settings').classList.add('hidden'); if(!E('brain').classList.contains('hidden')) renderBrain(); } };
}

/* ---------- Boot ---------- */
E('reset').onclick=resetAll;
E('export').onclick=exportReport;
E('exportcsv').onclick=exportCSV;
E('addbrain').onclick=addToBrain;
E('mode-doc').onclick=()=>setMode('doc');
E('mode-projects').onclick=()=>setMode('projects');
E('mode-os').onclick=()=>setMode('os');
E('mode-brain').onclick=()=>setMode('brain');
E('settings-btn').onclick=openSettings;
E('settings-close').onclick=()=>E('settings').classList.add('hidden');
E('settings').onclick=e=>{ if(e.target===E('settings')) E('settings').classList.add('hidden'); };
E('compose-close').onclick=()=>E('compose').classList.add('hidden');
E('compose').onclick=e=>{ if(e.target===E('compose')) E('compose').classList.add('hidden'); };
wire();

// Mirror any existing guided-builder projects into the canonical Project
// Truth Model (idempotent, non-destructive — writes only the new truth store,
// never touches legacy data). Safe no-op if the model layer isn't present.
try{ if(typeof Migrate!=='undefined') Migrate.run(); }catch(e){ console.warn('truth-model migration skipped', e); }

// Detect AI (on-device or configured cloud). Brain works regardless.
probeAI().then(updateChrome);
