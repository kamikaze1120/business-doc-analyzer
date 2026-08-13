/* ============================================================
   CLARIFY — the living-document Q&A loop.

   Open questions (extracted, plus AI-suggested when Ollama is on) get
   answered by you. Each answer is written back INTO the document:
     • on a requirements doc / PRD → a new FR / NFR / INT / BR requirement
       that immediately flows into Tests, Traceability and the score;
     • on a charter / plan / process doc → a recorded clarification note.
   Answers persist to the brain and reload next time you open the file,
   so the document genuinely grows over time.
   ============================================================ */

/* Lazily attach the Q&A working set to STATE. */
function ensureQA(){
  if(STATE.qa) return STATE.qa;
  const qs = (STATE.el.questions||[]).map((t,i)=>({qid:'x'+i, text:(typeof t==='string'?t:t.text), source:'extracted'}));
  STATE.qa = { questions: qs, answered: [] };
  return STATE.qa;
}
/* Whether this document type records answers as requirements or as notes. */
function recordsAsRequirement(){ return ['requirements','prd','agile','generic'].includes(STATE.docType.id); }

/* ---- adding to the living document ---- */
function nextReqId(cat){
  const n = STATE.reqs.filter(r=>r.cat===cat).length + 1;
  return `${cat}-${String(n).padStart(3,'0')}A`;   // trailing A marks an added requirement
}
function addRequirement(text, cat, priority, skipRecompute){
  const r = { seq: STATE.reqs.length+1, id: nextReqId(cat), derived:false, added:true,
    text, cat, priority: priority||'Medium', actors: actorsIn(text),
    section:'Clarifications (added)', line:0,
    testable:true, measurable:/\b\d/.test(text) };
  try{ r.sem = decompose(text, ACTOR_HINTS); }catch(e){ r.sem=null; }
  STATE.reqs.push(r);
  if(!skipRecompute) recomputeDerived();
  return r;
}
function addNote(text, section){
  (STATE.el.clarifications = STATE.el.clarifications || []).push({text, section:section||'', ts:Date.now()});
}
/* Rebuild the derived analysis after the requirement set changes. */
function recomputeDerived(){
  try{
    STATE.scen  = buildScenarios(STATE.reqs, STATE.steps);
    STATE.tests = genTests(STATE.reqs, STATE.scen);
    STATE.gaps  = analyzeSemanticGaps(STATE.reqs, STATE.sections, STATE.norm||'');
    const sc = scoreDocument(STATE.reqs, STATE.gaps, STATE.sections, STATE.norm||'');
    STATE.score=sc.score; STATE.dims=sc.dims;
  }catch(e){ console.error('recompute failed', e); }
  buildTabs('clarify');   // re-render everything, keep the user on Clarify
}

/* ---- persistence (browser Store, no server) ---- */
async function persistAnswer(question, answer, recordedAs){
  try{ Store.saveAnswer({docTitle: STATE.meta.title||STATE.fileName, question, answer, recordedAs}); }
  catch(e){ /* non-fatal */ }
}
/* Reload prior answers for this document (called on mount). */
async function loadPriorClarifications(){
  try{
    const j = Store.getDoc(STATE.meta.title||STATE.fileName);
    const stored = (j && j.clarifications) || [];
    if(!stored.length) return;
    const qa = ensureQA();
    let changed=false;
    stored.forEach(c=>{
      if(qa.answered.some(a=>a.answer===c.answer && a.question===c.question)) return;
      const ra=c.recordedAs||{kind:'note'};
      if(ra.kind==='requirement') addRequirement(c.answer, ra.cat||'FR', ra.priority||'Medium', true);
      else addNote(c.answer, ra.section);
      qa.answered.push({question:c.question, answer:c.answer, recordedAs:ra, restored:true});
      changed=true;
    });
    if(changed){ recomputeDerived(); }   // one rebuild after restoring all
  }catch(e){ /* server may be off */ }
}

/* ---- AI: suggest clarifying questions grounded in the document ---- */
async function aiSuggestQuestions(){
  const s=STATE;
  const prompt =
`You are a business analyst reviewing a ${s.docType.name}. Based ONLY on the facts below, list the most important CLARIFYING QUESTIONS a stakeholder should answer to make this document complete and testable. Focus on ambiguities, missing acceptance criteria, undefined actors/permissions, unmeasured non-functional needs, and undefined terms. Do not answer them.
Return STRICT JSON: {"questions":["...","..."]}. At most 8, each one sentence.

FACTS:
${(typeof aiContext==='function')?aiContext(s):(s.meta.title)}`;
  const j = await llmJSON(prompt, {temperature:0.4});
  const qs = (j && (j.questions||j.Questions)) || [];
  const qa = ensureQA();
  qs.forEach((t,i)=>{ if(t && !qa.questions.some(q=>q.text===t) && !qa.answered.some(a=>a.question===t))
    qa.questions.push({qid:'ai'+Date.now()+i, text:String(t), source:'ai'}); });
  return qs.length;
}

/* ---- the view ---- */
function renderClarify(){
  const qa = ensureQA();
  const asReq = recordsAsRequirement();
  const catOptions = ['FR','NFR','INT','BR'].map(c=>`<option value="${c}">${CAT_NAME[c]}</option>`).join('');
  const secOptions = ['General', ...STATE.sections.map(s=>(s.num?s.num+' ':'')+s.title)]
    .map(x=>`<option>${esc(x)}</option>`).join('');

  const row = q=>`<div class="qa-item" data-qid="${esc(q.qid)}">
    <div class="qa-q"><span class="qa-src ${q.source}">${q.source==='ai'?'✨ AI':'from doc'}</span> ${esc(q.text)}</div>
    <textarea class="qa-ans" rows="2" placeholder="Type the answer…"></textarea>
    <div class="qa-controls">
      ${asReq
        ? `<label class="dim">Record as</label>
           <select class="qa-cat">${catOptions}</select>
           <select class="qa-pri"><option>High</option><option selected>Medium</option><option>Low</option></select>
           ${AI.available?'<button class="btn ghost sm qa-phrase">✨ Phrase as requirement</button>':''}`
        : `<label class="dim">Attach to</label><select class="qa-sec">${secOptions}</select>`}
      <button class="btn sm qa-record">Record →</button>
    </div>
  </div>`;

  E('p-clarify').innerHTML = `
  <div class="toolbar">
    <span class="dim">${qa.questions.length} open · ${qa.answered.length} recorded · answers ${asReq?'become new requirements':'are saved as notes'}${Store.available()?' and persist to the brain':''}</span>
    ${AI.available?'<button class="btn sm" id="qa-suggest">✨ Suggest clarifying questions</button>':''}
  </div>
  ${qa.questions.length? qa.questions.map(row).join('') : '<div class="card"><span class="dim">No open questions. '+(AI.available?'Click “Suggest clarifying questions”, or ':'')+'the document looks clarified.</span></div>'}
  ${qa.answered.length? `<h3 class="sec">Recorded (${qa.answered.length}) — now part of the document</h3>
    <div class="card"><ul class="itemlist">${qa.answered.map(a=>`<li><span class="li-main">${esc(a.answer)}</span>
      <span class="li-sub">${a.recordedAs.kind==='requirement'?`→ ${esc(a.recordedAs.id||'')} (${esc(a.recordedAs.cat||'')})`:`→ note${a.recordedAs.section?' · '+esc(a.recordedAs.section):''}`}${a.restored?' · restored':''}</span></li>`).join('')}</ul></div>` : ''}`;

  if(E('qa-suggest')) E('qa-suggest').onclick = async e=>{
    e.target.disabled=true; e.target.textContent='✨ Thinking…';
    try{ const n=await aiSuggestQuestions(); buildTabs('clarify'); if(!n) toast('No new questions suggested.'); }
    catch(err){ toast('AI could not suggest questions: '+err.message); e.target.disabled=false; e.target.textContent='✨ Suggest clarifying questions'; }
  };

  E('p-clarify').querySelectorAll('.qa-item').forEach(item=>{
    const qid=item.dataset.qid;
    const phrase=item.querySelector('.qa-phrase');
    if(phrase) phrase.onclick=async()=>{
      const ans=item.querySelector('.qa-ans'); if(!ans.value.trim()) return;
      phrase.disabled=true; const old=phrase.textContent; phrase.textContent='✨…';
      try{ const r=await llmGenerate(`Rewrite this as a single, testable requirement sentence in the form "The <actor> shall <verb> <object> [conditions] [measurable limit]." Return only the sentence.\n\nAnswer: ${ans.value}`, {temperature:0.2});
        ans.value = r.trim().replace(/^["']|["']$/g,''); }catch(e){ toast('Rephrase failed: '+e.message); }
      finally{ phrase.disabled=false; phrase.textContent=old; }
    };
    item.querySelector('.qa-record').onclick=()=>{
      const q = ensureQA().questions.find(x=>x.qid===qid);
      const answer = item.querySelector('.qa-ans').value.trim();
      if(!answer){ toast('Type an answer first.'); return; }
      let recordedAs;
      if(asReq){
        const cat=item.querySelector('.qa-cat').value, pri=item.querySelector('.qa-pri').value;
        const r=addRequirement(answer, cat, pri);
        recordedAs={kind:'requirement', id:r.id, cat, priority:pri};
      }else{
        const sec=item.querySelector('.qa-sec').value; addNote(answer, sec);
        recordedAs={kind:'note', section:sec};
      }
      const qa=ensureQA();
      qa.answered.push({question:q?q.text:'', answer, recordedAs});
      qa.questions = qa.questions.filter(x=>x.qid!==qid);
      persistAnswer(q?q.text:'', answer, recordedAs);
      toast(recordedAs.kind==='requirement' ? `Added ${recordedAs.id} — Tests & Traceability updated.` : 'Clarification recorded.');
      buildTabs('clarify');
    };
  });
}

/* Register the Clarify view. Always available — every document can be clarified. */
if(typeof VIEWS!=='undefined'){
  VIEWS.clarify = {label:'❓ Clarify', render:renderClarify, has:()=>true};
}
