/* ============================================================
   LLM CLIENT — pluggable, browser-only, no local server.

   Three ways to get AI, tried in this order of preference:
     1. builtin  — Chrome/Edge on-device model (window.LanguageModel /
                   window.ai). No key, nothing leaves the machine.
     2. cloud    — an approved OpenAI-compatible or Anthropic endpoint
                   you configure in Settings (endpoint + key + model).
     3. off      — no AI; every AI feature hides and the rest works.
   Config is saved in the browser (localStorage), never in the page.
   ============================================================ */
const AI = { available:false, provider:'off', model:'', label:'AI off', builtin:false, cfg:{}, onProgress:null };

/* Small open models that run entirely in the browser via WebLLM (WebGPU). */
const WEBLLM_VERSION = '0.2.84';   // pinned so a future release can't break the app
const WEBLLM_MODELS = [
  {id:'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label:'Qwen2.5 1.5B (~1.2 GB) — recommended'},
  {id:'Llama-3.2-1B-Instruct-q4f32_1-MLC', label:'Llama 3.2 1B (~1.2 GB) — fastest'},
  {id:'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label:'Qwen2.5 0.5B (~0.9 GB) — tiny, weak machines'},
  {id:'Qwen2.5-3B-Instruct-q4f16_1-MLC',   label:'Qwen2.5 3B (~2.3 GB) — stronger'},
  {id:'Llama-3.2-3B-Instruct-q4f16_1-MLC', label:'Llama 3.2 3B (~2.3 GB) — stronger'},
  {id:'Phi-3.5-mini-instruct-q4f16_1-MLC', label:'Phi-3.5 mini (~2.2 GB)'}
];
const WEBGPU_OK = (typeof navigator!=='undefined' && !!navigator.gpu);

function loadAICfg(){ try{ return JSON.parse(localStorage.getItem('bda:ai'))||{}; }catch(e){ return {}; } }
function saveAICfg(c){ AI.cfg=c; try{ localStorage.setItem('bda:ai', JSON.stringify(c)); }catch(e){} }

async function detectBuiltin(){
  try{
    const LM = self.LanguageModel || (self.ai && self.ai.languageModel);
    if(!LM) return false;
    if(LM.availability){ const a=await LM.availability(); return a==='available'||a==='downloadable'||a==='downloading'; }
    if(LM.capabilities){ const c=await LM.capabilities(); return c && c.available && c.available!=='no'; }
    return !!LM.create;
  }catch(e){ return false; }
}

/* Decide which provider is active, based on saved config then on-device detection. */
async function probeAI(){
  const cfg = loadAICfg(); AI.cfg = cfg;
  if(cfg.provider==='openai' || cfg.provider==='anthropic'){
    if(cfg.endpoint && cfg.key){ AI.available=true; AI.provider=cfg.provider; AI.model=cfg.model||''; AI.builtin=false;
      AI.label = 'Cloud AI · '+(cfg.model||cfg.provider); return AI; }
  }
  if(cfg.provider==='webllm'){
    AI.provider='webllm'; AI.model=cfg.model||WEBLLM_MODELS[0].id; AI.builtin=true;
    AI.available = WEBGPU_OK;
    AI.label = WEBGPU_OK ? ('In-browser · '+shortModel(AI.model)) : 'WebLLM needs WebGPU (use Chrome/Edge)';
    return AI;
  }
  if(cfg.provider==='off'){ AI.available=false; AI.provider='off'; AI.label='AI off'; return AI; }
  // default: try on-device
  const b = await detectBuiltin();
  if(b){ AI.available=true; AI.provider='builtin'; AI.builtin=true; AI.model='on-device'; AI.label='On-device AI'; }
  else { AI.available=false; AI.provider='off'; AI.label='AI off'; }
  return AI;
}

function shortModel(id){ const m=WEBLLM_MODELS.find(x=>x.id===id); return m?m.label.split(' (')[0]:id; }

/* ---- generation dispatch ---- */
async function llmGenerate(prompt, opts={}){
  if(AI.provider==='builtin') return genBuiltin(prompt, opts);
  if(AI.provider==='webllm')  return genWebLLM(prompt, opts);
  if(AI.provider==='openai')  return genOpenAI(prompt, opts);
  if(AI.provider==='anthropic') return genAnthropic(prompt, opts);
  throw new Error('No AI provider is configured. Open Settings (⚙︎) to enable on-device AI or add an approved endpoint.');
}

/* ---- WebLLM: a real small model running in the browser via WebGPU ---- */
let _webllmEngine=null, _webllmLoadedModel=null;
async function ensureWebLLM(){
  if(!WEBGPU_OK) throw new Error('This browser has no WebGPU. Use a recent Chrome or Edge to run an in-browser model.');
  const model = AI.cfg.model || WEBLLM_MODELS[0].id;
  if(_webllmEngine && _webllmLoadedModel===model) return _webllmEngine;
  let webllm;
  try{ webllm = await import('https://esm.run/@mlc-ai/web-llm@'+WEBLLM_VERSION); }
  catch(e){ throw new Error('Could not load the WebLLM library (network/CDN blocked). '+e.message); }
  const cb = p=>{ if(AI.onProgress) AI.onProgress(p && p.text ? p.text : ('Loading '+shortModel(model)+'…')); };
  // Switching models: reload on the existing engine instead of spawning a second
  // one (two engines fight over the GPU and can hang). Fall back to a clean engine.
  if(_webllmEngine){
    try{ await _webllmEngine.reload(model); _webllmLoadedModel=model; return _webllmEngine; }
    catch(e){ try{ await (_webllmEngine.unload && _webllmEngine.unload()); }catch(_){}
      _webllmEngine=null; _webllmLoadedModel=null; }
  }
  _webllmEngine = await webllm.CreateMLCEngine(model, {initProgressCallback: cb});
  _webllmLoadedModel = model;
  return _webllmEngine;
}
async function genWebLLM(prompt, opts){
  const eng = await ensureWebLLM();
  // Generation itself emits no progress; tell the user we've moved past loading
  // so a slow Intel GPU doesn't look frozen on the "Finish loading" message.
  if(AI.onProgress) AI.onProgress('Model loaded ✓ — generating the answer… (on an Intel GPU this can take up to a minute)');
  const messages = [ ...(opts.system?[{role:'system',content:opts.system}]:[]), {role:'user',content:prompt} ];
  const req = { messages, temperature: opts.temperature!=null?opts.temperature:0.2 };
  if(opts.format==='json') req.response_format = {type:'json_object'};
  const res = await eng.chat.completions.create(req);
  return (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
}
async function llmJSON(prompt, opts={}){
  const raw = await llmGenerate(prompt, Object.assign({format:'json', temperature:0.2}, opts));
  return extractJSON(raw);
}

async function genBuiltin(prompt, opts){
  const LM = self.LanguageModel || (self.ai && self.ai.languageModel);
  const create = LM.create ? LM.create.bind(LM) : null;
  const session = await create(opts.system ? {initialPrompts:[{role:'system',content:opts.system}]} : {});
  try{ return await session.prompt(prompt); }
  finally{ try{ session.destroy && session.destroy(); }catch(e){} }
}

async function genOpenAI(prompt, opts){
  const c=AI.cfg;
  const base=c.endpoint.replace(/\/+$/,'');
  const url = /\/chat\/completions$/.test(base) ? base : base+'/v1/chat/completions';
  const body={ model:c.model||opts.model, messages:[
    ...(opts.system?[{role:'system',content:opts.system}]:[]),
    {role:'user',content:prompt}], temperature: opts.temperature!=null?opts.temperature:0.2 };
  if(opts.format==='json') body.response_format={type:'json_object'};
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.key,
    ...(c.extraHeader?JSON.parse(c.extraHeader):{})},body:JSON.stringify(body)});
  if(!r.ok) throw new Error('AI endpoint error '+r.status+' — '+(await r.text()).slice(0,140));
  const j=await r.json(); return (j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||'';
}

async function genAnthropic(prompt, opts){
  const c=AI.cfg; const base=c.endpoint.replace(/\/+$/,'');
  const url = /\/messages$/.test(base)?base:base+'/v1/messages';
  const body={ model:c.model||opts.model, max_tokens:1024, temperature:opts.temperature!=null?opts.temperature:0.2,
    system:opts.system||undefined, messages:[{role:'user',content:prompt}] };
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':c.key,
    'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error('AI endpoint error '+r.status+' — '+(await r.text()).slice(0,140));
  const j=await r.json(); return (j.content&&j.content[0]&&j.content[0].text)||'';
}

function extractJSON(raw){
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch(e){}
  const fence=raw.match(/```(?:json)?\s*([\s\S]*?)```/i); if(fence){ try{ return JSON.parse(fence[1]); }catch(e){} }
  const a=raw.indexOf('{'), b=raw.lastIndexOf('}'); if(a>-1&&b>a){ try{ return JSON.parse(raw.slice(a,b+1)); }catch(e){} }
  return null;
}
