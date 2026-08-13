#!/usr/bin/env node
/* ============================================================
   Business Document Analyzer — local server.

   Runs entirely on your machine. It does three things:
     1. Serves the web app (so the browser can use fetch, workers,
        and persistent storage that file:// can't).
     2. Proxies your local Ollama so the browser never hits CORS.
     3. Owns "the brain": an Obsidian-style vault of markdown +
        JSON on disk that accretes across every document you analyze.

   No external dependencies — Node's standard library only.
   Start:  node server.js      then open  http://localhost:7332
   ============================================================ */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT       = process.env.PORT || 7332;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEF_MODEL  = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const ROOT       = __dirname;
const BRAIN_DIR  = path.join(ROOT, 'brain');

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.map':'application/json',
  '.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8',
  '.woff':'font/woff','.woff2':'font/woff2'};

/* ---------------- small helpers ---------------- */
function send(res, code, body, type){
  res.writeHead(code, {'Content-Type': type||'application/json; charset=utf-8'});
  res.end(typeof body==='string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let b=''; req.on('data',c=>{ b+=c; if(b.length>25e6) req.destroy(); });
    req.on('end',()=>{ try{ resolve(b?JSON.parse(b):{}); }catch(e){ reject(e); } });
    req.on('error',reject);
  });
}
function slug(s){
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'')
    .trim().replace(/\s+/g,'-').replace(/-+/g,'-').slice(0,80) || 'untitled';
}
function ensureDir(d){ fs.mkdirSync(d, {recursive:true}); }
function readJSON(p, fallback){ try{ return JSON.parse(fs.readFileSync(p,'utf8')); }catch(e){ return fallback; } }
function writeFileSafe(p, data){ ensureDir(path.dirname(p)); fs.writeFileSync(p, data); }
function esc(s){ return String(s==null?'':s); }

/* ---------------- Ollama proxy ---------------- */
function ollama(pathname, payload){
  return new Promise((resolve)=>{
    const u = new url.URL(OLLAMA_URL);
    const data = payload ? JSON.stringify(payload) : null;
    const req = http.request({
      hostname:u.hostname, port:u.port||80, path:pathname,
      method: payload?'POST':'GET',
      headers: data ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)} : {}
    }, r=>{
      let b=''; r.on('data',c=>b+=c);
      r.on('end',()=>{ try{ resolve({ok:r.statusCode<400, status:r.statusCode, json:b?JSON.parse(b):null}); }
                       catch(e){ resolve({ok:false, status:r.statusCode, error:'bad json from ollama', raw:b.slice(0,400)}); } });
    });
    req.on('error',e=>resolve({ok:false, status:0, error:e.code==='ECONNREFUSED'
      ? 'Ollama is not reachable at '+OLLAMA_URL+'. Start it with `ollama serve` and pull a model.' : String(e.message)}));
    req.setTimeout(180000, ()=>{ req.destroy(); resolve({ok:false, status:0, error:'Ollama request timed out.'}); });
    if(data) req.write(data);
    req.end();
  });
}

/* ============================================================
   THE BRAIN — an on-disk vault of linked notes + a JSON index.
   ============================================================ */
const IDX_PATH = ()=>path.join(BRAIN_DIR,'index.json');
function loadIndex(){
  return readJSON(IDX_PATH(), {version:1, updated:null, docs:{}, nodes:{}, edges:[]});
}
function saveIndex(ix){
  ix.updated = new Date().toISOString();
  writeFileSafe(IDX_PATH(), JSON.stringify(ix, null, 2));
}
/* entities that are meaningfully shared ACROSS documents get their own node+page */
const CROSS_TYPES = ['stakeholder','actor','system','metric'];
const TYPE_DIR = t => path.join(BRAIN_DIR,'entities',t);

function nodeId(type, name){ return type+':'+slug(name); }
function upsertNode(ix, type, name, props, docId){
  const id = nodeId(type, name);
  const n = ix.nodes[id] || (ix.nodes[id]={id, type, title:name, props:{}, docs:[], count:0,
    firstSeen:new Date().toISOString()});
  n.title = name; n.lastSeen = new Date().toISOString();
  Object.assign(n.props, props||{});
  if(docId && !n.docs.includes(docId)) n.docs.push(docId);
  n.count = n.docs.length;
  return n;
}
function addEdge(ix, from, to, type){
  if(from===to) return;
  if(!ix.edges.some(e=>e.from===from && e.to===to && e.type===type)) ix.edges.push({from,to,type});
}

function fm(obj){ // YAML-ish frontmatter
  return '---\n'+Object.entries(obj).map(([k,v])=>`${k}: ${Array.isArray(v)?JSON.stringify(v):esc(v)}`).join('\n')+'\n---\n';
}

function writeDocNote(doc, e){
  const title = doc.title || doc.fileName;
  const lines = [];
  lines.push(fm({type:'document', docType:doc.type, docTypeName:doc.typeName, title,
    file:doc.fileName, confidence:doc.confidence, ingested:new Date().toISOString()}));
  lines.push(`# ${title}\n`);
  lines.push(`**Detected type:** ${doc.typeName} (${doc.confidence}% confidence)  `);
  lines.push(`**Source:** ${doc.fileName} · ${doc.words} words · ${doc.sections} sections\n`);
  const sec = (h, arr, fmt)=>{ if(arr && arr.length){ lines.push(`## ${h}`); arr.forEach(x=>lines.push('- '+fmt(x))); lines.push(''); } };
  sec('Objectives', e.objectives, o=>o.text||o);
  sec('Stakeholders', e.stakeholders, s=>`[[${s.role}]]${s.name&&s.name!=='—'?' — '+s.name:''}${s.note?' — '+s.note:''}`);
  sec('Actors', e.actors, a=>`[[${a}]]`);
  sec('Systems / Integrations', e.systems, s=>`[[${s}]]`);
  sec('Scope — In', e.scopeIn, x=>x);
  sec('Scope — Out', e.scopeOut, x=>x);
  sec('Milestones', e.milestones, m=>`${m.label}${m.date?' ('+m.date+')':''}`);
  sec('Risks', e.risks, r=>`${r.sev?'('+r.sev+') ':''}${r.risk}${r.mitigation?' — mitigation: '+r.mitigation:''}`);
  sec('Metrics / KPIs', e.metrics, m=>`[[${m.name}]]${m.target?' — target: '+m.target:''}`);
  sec('Personas', e.personas, p=>`${p.name}${p.desc?' — '+p.desc:''}`);
  sec('Features', e.features, f=>`${f.name||f}`);
  sec('User Stories', e.stories, s=>`As a ${s.role}, I want ${s.want}${s.benefit?' so that '+s.benefit:''}`);
  sec('Requirements', e.requirements, r=>`\`${r.id}\` (${r.cat}/${r.priority}) ${r.text}`);
  sec('Open Questions', e.questions, q=>typeof q==='string'?q:q.text);
  writeFileSafe(path.join(BRAIN_DIR,'documents',slug(title)+'.md'), lines.join('\n'));
  return slug(title);
}

function writeEntityNote(ix, node){
  const backlinks = node.docs.map(d=>{ const dn=ix.docs[d]; return dn?`- [[${dn.title}]]`:null; }).filter(Boolean);
  const body = fm({type:node.type, name:node.title, appears_in:node.docs.length})+
    `# ${node.title}\n\n**Type:** ${node.type}\n\n## Appears in\n`+(backlinks.join('\n')||'- (none)')+'\n';
  writeFileSafe(path.join(TYPE_DIR(node.type), slug(node.title)+'.md'), body);
}

function ingest(payload){
  ensureDir(BRAIN_DIR);
  const ix = loadIndex();
  const doc = payload.doc||{};
  const e   = payload.entities||{};
  const title = doc.title || doc.fileName || 'Untitled';
  const docId = slug(title);

  // document record
  const counts = {};
  ['objectives','stakeholders','actors','systems','risks','metrics','milestones','features','personas','stories','requirements','questions','scopeIn','scopeOut']
    .forEach(k=>counts[k]=(e[k]||[]).length);
  ix.docs[docId] = {id:docId, title, file:doc.fileName, docType:doc.type, docTypeName:doc.typeName,
    confidence:doc.confidence, words:doc.words, ingested:new Date().toISOString(), counts};

  // cross-document entity nodes
  const touched = new Set();
  (e.stakeholders||[]).forEach(s=>{ const n=upsertNode(ix,'stakeholder',s.role,{}, docId); addEdge(ix,docId,n.id,'mentions'); touched.add(n.id); });
  (e.actors||[]).forEach(a=>{ const n=upsertNode(ix,'actor',a,{}, docId); addEdge(ix,docId,n.id,'mentions'); touched.add(n.id); });
  (e.systems||[]).forEach(s=>{ const n=upsertNode(ix,'system',s,{}, docId); addEdge(ix,docId,n.id,'mentions'); touched.add(n.id); });
  (e.metrics||[]).forEach(m=>{ const n=upsertNode(ix,'metric',m.name,{target:m.target||''}, docId); addEdge(ix,docId,n.id,'mentions'); touched.add(n.id); });

  // co-occurrence edges between entities sharing this document
  const ids=[...touched];
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) addEdge(ix, ids[i], ids[j], 'co-occurs');

  writeDocNote(doc, e);
  ids.forEach(id=>writeEntityNote(ix, ix.nodes[id]));
  saveIndex(ix);

  return {ok:true, docId,
    entities: ids.length,
    recurring: ids.map(id=>ix.nodes[id]).filter(n=>n.docs.length>1).map(n=>({type:n.type,title:n.title,docs:n.docs.length}))};
}

/* Append AI-generated insights to a document's note (a distinct, labeled section). */
function saveAI(body){
  const title = body.docTitle||'Untitled';
  const j = body.insights||{};
  const file = path.join(BRAIN_DIR,'documents',slug(title)+'.md');
  if(!fs.existsSync(file)) return {ok:false, error:'document not in brain yet — add it first'};
  const out=['', `## AI Insights (${body.model||'model'} · ${new Date().toISOString().slice(0,10)})`];
  const sec=(h,arr,f)=>{ if(arr&&arr.length){ out.push(`### ${h}`); arr.forEach(x=>out.push('- '+f(x))); } };
  sec('Use cases', j.useCases||j.use_cases, u=>`${u.title||'Use case'}${u.actor?' ['+u.actor+']':''}`);
  sec('Assumptions', j.assumptions, x=>x);
  sec('Blockers', j.blockers, x=>x);
  sec('Risks', j.risks, r=>r.risk?(r.risk+(r.mitigation?' — '+r.mitigation:'')):r);
  sec('Open questions', j.questions, x=>x);
  fs.appendFileSync(file, out.join('\n')+'\n');
  return {ok:true};
}

/* Record a Q&A answer against a document: store structured JSON (for reload)
   and mirror a human-readable line into the document's markdown note. */
function saveAnswer(body){
  const title = body.docTitle||'Untitled';
  const rec = {question: body.question||'', answer: body.answer||'', recordedAs: body.recordedAs||{kind:'note'},
    ts: new Date().toISOString()};
  if(!rec.answer) return {ok:false, error:'answer required'};
  const jf = path.join(BRAIN_DIR,'clarifications',slug(title)+'.json');
  const arr = readJSON(jf, []); arr.push(rec); writeFileSafe(jf, JSON.stringify(arr, null, 2));
  // mirror into the document note if it exists
  const md = path.join(BRAIN_DIR,'documents',slug(title)+'.md');
  if(fs.existsSync(md)){
    const ra = rec.recordedAs;
    const line = ra.kind==='requirement'
      ? `- \`${ra.id||''}\` (${ra.cat||'FR'}/${ra.priority||'Medium'}) ${rec.answer}  _(Q: ${rec.question})_`
      : `- ${rec.answer}${ra.section?`  _(§ ${ra.section})_`:''}  _(Q: ${rec.question})_`;
    // keep a single "Clarifications" section, appending under it
    let txt = fs.readFileSync(md,'utf8');
    if(!/## Clarifications & Added Items/.test(txt)){ txt += `\n## Clarifications & Added Items\n`; }
    txt += line+'\n';
    fs.writeFileSync(md, txt);
  }
  return {ok:true, count:arr.length};
}

function brainStats(ix){
  const byType={}; Object.values(ix.nodes).forEach(n=>byType[n.type]=(byType[n.type]||0)+1);
  return {documents:Object.keys(ix.docs).length, entities:Object.keys(ix.nodes).length, byType,
    updated:ix.updated};
}

/* ---------------- request router ---------------- */
const server = http.createServer(async (req,res)=>{
  const u = url.parse(req.url, true);
  const p = u.pathname;
  try{
    /* ---- API ---- */
    if(p.startsWith('/api/')){
      // health of server + ollama
      if(p==='/api/health' && req.method==='GET'){
        const tags = await ollama('/api/tags');
        return send(res,200,{server:'ok', defaultModel:DEF_MODEL, ollamaUrl:OLLAMA_URL,
          ollama: tags.ok?'ok':'down',
          models: tags.ok && tags.json && tags.json.models ? tags.json.models.map(m=>m.name) : [],
          ollamaError: tags.ok?null:tags.error});
      }
      // LLM generate (proxy to Ollama)
      if(p==='/api/llm' && req.method==='POST'){
        const body = await readBody(req);
        if(!body.prompt) return send(res,400,{ok:false,error:'prompt required'});
        const r = await ollama('/api/generate', {
          model: body.model||DEF_MODEL, prompt: body.prompt, system: body.system||undefined,
          stream:false, format: body.format||undefined,
          options: Object.assign({temperature: body.temperature!=null?body.temperature:0.2}, body.options||{})
        });
        if(!r.ok) return send(res,503,{ok:false,error:r.error||('ollama status '+r.status)});
        return send(res,200,{ok:true, response:(r.json&&r.json.response)||'', model:body.model||DEF_MODEL});
      }
      // Brain
      if(p==='/api/vault/ingest' && req.method==='POST'){ const body=await readBody(req); return send(res,200,ingest(body)); }
      if(p==='/api/vault/ai' && req.method==='POST'){ const body=await readBody(req); return send(res,200,saveAI(body)); }
      // Living-document Q&A: record an answer against a document, and read them back.
      if(p==='/api/vault/answer' && req.method==='POST'){ const body=await readBody(req); return send(res,200,saveAnswer(body)); }
      if(p==='/api/vault/doc' && req.method==='GET'){
        const t=slug(u.query.title||''); const f=path.join(BRAIN_DIR,'clarifications',t+'.json');
        return send(res,200,{ok:true, clarifications: readJSON(f, [])});
      }
      if(p==='/api/vault/index' && req.method==='GET'){ const ix=loadIndex(); return send(res,200,{stats:brainStats(ix), docs:ix.docs, nodes:ix.nodes, edges:ix.edges}); }
      if(p==='/api/vault/note' && req.method==='GET'){
        const id=u.query.id||''; const type=u.query.type||'';
        let file;
        if(type==='document' || (!type && ix_hasDoc(id))) file=path.join(BRAIN_DIR,'documents',slug(id)+'.md');
        else { const n=loadIndex().nodes[id]; if(n) file=path.join(TYPE_DIR(n.type),slug(n.title)+'.md'); }
        if(file && fs.existsSync(file)) return send(res,200,{ok:true, md:fs.readFileSync(file,'utf8')}, 'application/json; charset=utf-8');
        return send(res,404,{ok:false,error:'note not found'});
      }
      if(p==='/api/vault/search' && req.method==='GET'){
        const q=(u.query.q||'').toLowerCase(); const ix=loadIndex();
        const nodes=Object.values(ix.nodes).filter(n=>n.title.toLowerCase().includes(q)).slice(0,50);
        const docs=Object.values(ix.docs).filter(d=>d.title.toLowerCase().includes(q)).slice(0,50);
        return send(res,200,{nodes,docs});
      }
      return send(res,404,{ok:false,error:'unknown api route'});
    }

    if(p==='/favicon.ico'){ return send(res,204,'',''); }

    /* ---- static files ---- */
    let rel = decodeURIComponent(p==='/'?'/index.html':p).replace(/\.\.+/g,'');
    let file = path.join(ROOT, rel);
    if(!file.startsWith(ROOT)) return send(res,403,'forbidden','text/plain');
    if(!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res,404,'Not found','text/plain');
    return send(res,200, fs.readFileSync(file), MIME[path.extname(file)]||'application/octet-stream');
  }catch(err){
    console.error(err); return send(res,500,{ok:false,error:String(err.message||err)});
  }
});
function ix_hasDoc(id){ return !!loadIndex().docs[slug(id)]; }

server.listen(PORT, ()=>{
  ensureDir(BRAIN_DIR);
  console.log(`\n  Business Document Analyzer — running locally`);
  console.log(`  App:    http://localhost:${PORT}`);
  console.log(`  Ollama: ${OLLAMA_URL}  (default model: ${DEF_MODEL})`);
  console.log(`  Brain:  ${BRAIN_DIR}\n`);
});
