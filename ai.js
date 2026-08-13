/* ============================================================
   AI INSIGHTS — optional layer powered by your local Ollama model.
   Proves the full loop (browser → local server → Ollama) and gives
   deeper, generative output than the rule-based engine: use cases,
   assumptions, blockers, and risks grounded in the extracted facts.
   Appears only when Ollama is reachable; otherwise the tab is hidden.
   ============================================================ */

/* Compact, factual context so a small model stays grounded and fast. */
function aiContext(s){
  const el=s.el, L=(arr,f,n)=>arr.slice(0,n||8).map(f).map(x=>'  - '+x).join('\n');
  const P=[];
  P.push(`Title: ${s.meta.title}`);
  P.push(`Document type: ${s.docType.name}`);
  if(el.objectives.length) P.push('Objectives:\n'+L(el.objectives, o=>o.text||o));
  if(el.scopeIn.length)  P.push('In scope:\n'+L(el.scopeIn, x=>x));
  if(el.scopeOut.length) P.push('Out of scope:\n'+L(el.scopeOut, x=>x));
  if(el.stakeholders.length) P.push('Roles:\n'+L(el.stakeholders, r=>r.role+(r.note?' ('+r.note+')':'')));
  const systems = (typeof extractSystems==='function') ? extractSystems(s) : [];
  if(systems.length) P.push('Systems/integrations: '+systems.join(', '));
  if(s.actors.length) P.push('Actors: '+s.actors.join(', '));
  if(s.reqs.length) P.push('Requirements:\n'+L(s.reqs, r=>`[${r.cat}] ${r.text}`, 14));
  if(el.risks.length) P.push('Stated risks:\n'+L(el.risks, r=>r.risk));
  if(el.metrics.length) P.push('Metrics:\n'+L(el.metrics, m=>m.name+(m.target?': '+m.target:'')));
  return P.join('\n');
}

async function aiSynthesize(s){
  const prompt =
`You are a senior business analyst reviewing a ${s.docType.name}. Using ONLY the facts below, produce specific, non-generic analysis. Do not invent systems, names, or numbers that are not implied by the facts.

Return STRICT JSON with this shape:
{"useCases":[{"title":"","actor":"","steps":["",""]}],
 "assumptions":["",""],
 "blockers":["",""],
 "risks":[{"risk":"","mitigation":""}],
 "questions":["",""]}
At most 6 items per list. Keep each string short.

FACTS:
${aiContext(s)}`;
  const json = await llmJSON(prompt, {temperature:0.3});
  if(!json) throw new Error('The model did not return usable JSON. Try again, or pick a stronger model in Settings.');
  return json;
}

function renderAI(){
  const host = E('p-ai');
  if(!AI.available){ host.innerHTML = emptyMsg('AI is off. Open Settings (⚙︎) to enable on-device AI or add an approved endpoint.'); return; }
  host.innerHTML = `
  <div class="toolbar">
    <button class="btn" id="ai-run">✨ Generate AI insights</button>
    <span class="dim" id="ai-model">${esc(AI.label)}</span>
    <span class="dim" id="ai-status2"></span>
  </div>
  <div id="ai-out"><div class="dim" style="padding:8px">Runs your local model over the extracted facts to draft use cases, assumptions, blockers, risks and open questions. Nothing leaves your machine.</div></div>`;
  E('ai-run').onclick = async ()=>{
    const out=E('ai-out'); E('ai-run').disabled=true; E('ai-status2').textContent='';
    out.innerHTML = '<div class="empty"><span class="spin"></span> Thinking with '+esc(AI.label)+'…</div>';
    // Surface WebLLM's one-time model download progress live.
    AI.onProgress = (t)=>{ out.innerHTML = '<div class="empty"><span class="spin"></span> '+esc(t)+'</div>'; };
    try{
      const j = await aiSynthesize(STATE);
      out.innerHTML = renderInsights(j);
      LAST_AI = j;
      E('ai-save').onclick = saveInsightsToBrain;
    }catch(err){
      out.innerHTML = `<div class="card"><strong style="color:var(--bad)">Could not generate.</strong><div class="dim" style="margin-top:6px">${esc(err.message)}</div></div>`;
    }finally{ AI.onProgress=null; E('ai-run').disabled=false; }
  };
}

let LAST_AI = null;
function renderInsights(j){
  const list = (title, arr, fmt)=> (arr&&arr.length) ? `<h3 class="sec">${title}</h3><div class="card"><ul class="itemlist">${arr.map(x=>`<li><span class="li-main">${fmt(x)}</span></li>`).join('')}</ul></div>` : '';
  const uc = (j.useCases||j.use_cases||[]).map(u=>`<details><summary><span class="stitle">${esc(u.title||'Use case')}</span>${u.actor?`<span class="chip">${esc(u.actor)}</span>`:''}</summary>
      <div class="dbody"><ol class="tsteps">${(u.steps||[]).map(st=>`<li>${esc(st)}</li>`).join('')}</ol></div></details>`).join('');
  return `
    ${Store.available()?'<div class="toolbar" style="position:static;margin:0 0 8px"><button class="btn ghost sm" id="ai-save">＋ Save these to the brain</button><span class="dim" id="ai-saved"></span></div>':''}
    ${uc?`<h3 class="sec">Use cases</h3>${uc}`:''}
    ${list('Assumptions', j.assumptions, esc)}
    ${list('Blockers', j.blockers, esc)}
    ${list('Risks', j.risks||[], r=>esc(r.risk||r)+(r.mitigation?` <span class="dim">— mitigation: ${esc(r.mitigation)}</span>`:''))}
    ${list('Open questions', j.questions, esc)}`;
}

function saveInsightsToBrain(){
  if(!LAST_AI) return;
  const r = Store.saveAI({docTitle: STATE.meta.title||STATE.fileName, model:AI.label, insights:LAST_AI});
  const el=E('ai-saved'); if(el) el.textContent = r && r.ok ? 'saved ✓' : (r&&r.error?r.error:'add to brain first');
}

/* Register the AI Insights view (only shown when Ollama is up — see activeTabIds). */
if(typeof VIEWS!=='undefined'){
  VIEWS.ai = {label:'✨ AI Insights', render:renderAI, has:()=>AI.available};
}
