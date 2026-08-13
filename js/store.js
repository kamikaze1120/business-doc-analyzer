/* ============================================================
   BROWSER BRAIN STORE — the persistent vault, with NO server.

   Everything the local server used to do (ingest documents,
   cross-reference entities, store clarifications, render notes)
   now happens in the browser and persists in localStorage. Nothing
   is installed and nothing leaves your machine. Use Export/Import
   to back up or move the brain between computers.
   ============================================================ */
const Store = (()=>{
  const KEY = 'bda:brain:v1';
  let db = null;

  function load(){
    if(db) return db;
    try{ db = JSON.parse(localStorage.getItem(KEY)) || null; }catch(e){ db=null; }
    if(!db) db = { index:{version:1, updated:null, docs:{}, nodes:{}, edges:[]}, notes:{}, clar:{}, data:{} };
    if(!db.data) db.data={};
    return db;
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(db)); return true; }catch(e){ console.warn('brain save failed (storage full or blocked)',e); return false; } }

  /* ---- helpers (mirror the former server) ---- */
  function slug(s){ return String(s||'').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'')
    .trim().replace(/\s+/g,'-').replace(/-+/g,'-').slice(0,80) || 'untitled'; }
  const CROSS = {stakeholder:1, actor:1, system:1, metric:1, term:1};
  const ENTITY_LABEL = {stakeholder:'Stakeholders', actor:'Actors', system:'Systems / Integrations', metric:'Metrics / KPIs', term:'Glossary / Terms'};
  function nid(type,name){ return type+':'+slug(name); }
  function upsert(ix, type, name, props, docId){
    const id=nid(type,name);
    const n = ix.nodes[id] || (ix.nodes[id]={id,type,title:name,props:{},docs:[],count:0,firstSeen:new Date().toISOString()});
    n.title=name; n.lastSeen=new Date().toISOString(); Object.assign(n.props, props||{});
    if(docId && !n.docs.includes(docId)) n.docs.push(docId);
    n.count=n.docs.length; return n;
  }
  function edge(ix,from,to,type){ if(from===to) return;
    if(!ix.edges.some(e=>e.from===from&&e.to===to&&e.type===type)) ix.edges.push({from,to,type}); }
  function fm(o){ return '---\n'+Object.entries(o).map(([k,v])=>`${k}: ${Array.isArray(v)?JSON.stringify(v):(v==null?'':v)}`).join('\n')+'\n---\n'; }

  function writeDocNote(doc, e){
    const title=doc.title||doc.fileName, L=[];
    L.push(fm({type:'document', docType:doc.type, docTypeName:doc.typeName, title, file:doc.fileName, confidence:doc.confidence, ingested:new Date().toISOString()}));
    L.push(`# ${title}\n`);
    L.push(`**Detected type:** ${doc.typeName} (${doc.confidence}% confidence)  `);
    L.push(`**Source:** ${doc.fileName} · ${doc.words} words · ${doc.sections} sections\n`);
    const sec=(h,arr,f)=>{ if(arr&&arr.length){ L.push(`## ${h}`); arr.forEach(x=>L.push('- '+f(x))); L.push(''); } };
    sec('Objectives', e.objectives, o=>o.text||o);
    sec('Stakeholders', e.stakeholders, s=>`[[${s.role}]]${s.name&&s.name!=='—'?' — '+s.name:''}${s.note?' — '+s.note:''}`);
    sec('Actors', e.actors, a=>`[[${a}]]`);
    sec('Systems / Integrations', e.systems, s=>`[[${s}]]`);
    sec('Scope — In', e.scopeIn, x=>x);
    sec('Scope — Out', e.scopeOut, x=>x);
    sec('Milestones', e.milestones, m=>`${m.label}${m.date?' ('+m.date+')':''}`);
    sec('Risks', e.risks, r=>`${r.sev?'('+r.sev+') ':''}${r.risk}${r.mitigation?' — mitigation: '+r.mitigation:''}`);
    sec('Metrics / KPIs', e.metrics, m=>`[[${m.name}]]${m.target?' — target: '+m.target:''}`);
    sec('Glossary / Terms', e.glossary, g=>`[[${g.term}]]${g.definition?' — '+g.definition:''}`);
    sec('Personas', e.personas, p=>`${p.name}${p.desc?' — '+p.desc:''}`);
    sec('Features', e.features, f=>`${f.name||f}`);
    sec('User Stories', e.stories, s=>`As a ${s.role}, I want ${s.want}${s.benefit?' so that '+s.benefit:''}`);
    sec('Requirements', e.requirements, r=>`\`${r.id}\` (${r.cat}/${r.priority}) ${r.text}`);
    sec('Open Questions', e.questions, q=>typeof q==='string'?q:q.text);
    db.notes['documents/'+slug(title)] = L.join('\n');
    return slug(title);
  }
  function writeEntityNote(ix, node){
    const back=node.docs.map(d=>{ const dn=ix.docs[d]; return dn?`- [[${dn.title}]]`:null; }).filter(Boolean);
    db.notes['entities/'+node.type+'/'+slug(node.title)] =
      fm({type:node.type, name:node.title, appears_in:node.docs.length})+
      `# ${node.title}\n\n**Type:** ${node.type}\n`+(node.props&&node.props.definition?`\n> ${node.props.definition}\n`:'')+`\n## Appears in\n`+(back.join('\n')||'- (none)')+'\n';
  }

  /* ---- public API (same shapes the UI already expects) ---- */
  function ingest(payload){
    load();
    const ix=db.index, doc=payload.doc||{}, e=payload.entities||{};
    const title=doc.title||doc.fileName||'Untitled', docId=slug(title);
    const counts={}; ['objectives','stakeholders','actors','systems','risks','metrics','milestones','features','personas','stories','requirements','questions','scopeIn','scopeOut','glossary'].forEach(k=>counts[k]=(e[k]||[]).length);
    ix.docs[docId]={id:docId, title, file:doc.fileName, docType:doc.type, docTypeName:doc.typeName, confidence:doc.confidence, words:doc.words, ingested:new Date().toISOString(), counts};
    const touched=new Set();
    (e.stakeholders||[]).forEach(s=>{ const n=upsert(ix,'stakeholder',s.role,{},docId); edge(ix,docId,n.id,'mentions'); touched.add(n.id); });
    (e.actors||[]).forEach(a=>{ const n=upsert(ix,'actor',a,{},docId); edge(ix,docId,n.id,'mentions'); touched.add(n.id); });
    (e.systems||[]).forEach(s=>{ const n=upsert(ix,'system',s,{},docId); edge(ix,docId,n.id,'mentions'); touched.add(n.id); });
    (e.metrics||[]).forEach(m=>{ const n=upsert(ix,'metric',m.name,{target:m.target||''},docId); edge(ix,docId,n.id,'mentions'); touched.add(n.id); });
    (e.glossary||[]).forEach(g=>{ const n=upsert(ix,'term',g.term,{definition:g.definition||''},docId); edge(ix,docId,n.id,'mentions'); touched.add(n.id); });
    const ids=[...touched];
    for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) edge(ix,ids[i],ids[j],'co-occurs');
    // keep the full structured entities so we can COMPOSE documents from the brain later
    db.data[docId] = e;
    writeDocNote(doc,e); ids.forEach(id=>writeEntityNote(ix, ix.nodes[id]));
    ix.updated=new Date().toISOString(); save();
    return {ok:true, docId, entities:ids.length,
      recurring: ids.map(id=>ix.nodes[id]).filter(n=>n.docs.length>1).map(n=>({type:n.type,title:n.title,docs:n.docs.length}))};
  }
  function stats(ix){ const byType={}; Object.values(ix.nodes).forEach(n=>byType[n.type]=(byType[n.type]||0)+1);
    return {documents:Object.keys(ix.docs).length, entities:Object.keys(ix.nodes).length, byType, updated:ix.updated}; }
  function index(){ load(); return {stats:stats(db.index), docs:db.index.docs, nodes:db.index.nodes, edges:db.index.edges}; }
  function note(id, type){
    load();
    if(type==='document' || db.index.docs[slug(id)]) { const md=db.notes['documents/'+slug(id)]; return md?{ok:true,md}:{ok:false}; }
    const n=db.index.nodes[id]; if(n){ const md=db.notes['entities/'+n.type+'/'+slug(n.title)]; return md?{ok:true,md}:{ok:false}; }
    return {ok:false};
  }
  function saveAnswer(body){
    load(); const title=body.docTitle||'Untitled', s=slug(title);
    const rec={question:body.question||'', answer:body.answer||'', recordedAs:body.recordedAs||{kind:'note'}, ts:new Date().toISOString()};
    if(!rec.answer) return {ok:false,error:'answer required'};
    (db.clar[s]=db.clar[s]||[]).push(rec);
    // mirror into the doc note
    const key='documents/'+s;
    if(db.notes[key]){ const ra=rec.recordedAs;
      const line = ra.kind==='requirement'
        ? `- \`${ra.id||''}\` (${ra.cat||'FR'}/${ra.priority||'Medium'}) ${rec.answer}  _(Q: ${rec.question})_`
        : `- ${rec.answer}${ra.section?`  _(§ ${ra.section})_`:''}  _(Q: ${rec.question})_`;
      if(!/## Clarifications & Added Items/.test(db.notes[key])) db.notes[key]+=`\n## Clarifications & Added Items\n`;
      db.notes[key]+=line+'\n';
    }
    save(); return {ok:true, count:db.clar[s].length};
  }
  function getDoc(title){ load(); return {ok:true, clarifications: db.clar[slug(title)]||[]}; }
  function saveAI(body){
    load(); const s=slug(body.docTitle||'Untitled'), key='documents/'+s; if(!db.notes[key]) return {ok:false,error:'add to brain first'};
    const j=body.insights||{}, out=['', `## AI Insights (${body.model||'model'} · ${new Date().toISOString().slice(0,10)})`];
    const sec=(h,arr,f)=>{ if(arr&&arr.length){ out.push(`### ${h}`); arr.forEach(x=>out.push('- '+f(x))); } };
    sec('Use cases', j.useCases||j.use_cases, u=>`${u.title||'Use case'}${u.actor?' ['+u.actor+']':''}`);
    sec('Assumptions', j.assumptions, x=>x); sec('Blockers', j.blockers, x=>x);
    sec('Risks', j.risks, r=>r.risk?(r.risk+(r.mitigation?' — '+r.mitigation:'')):r); sec('Open questions', j.questions, x=>x);
    db.notes[key]+=out.join('\n')+'\n'; save(); return {ok:true};
  }
  function exportAll(){ load(); return JSON.stringify(db, null, 2); }
  function importAll(json){ try{ const d=JSON.parse(json); if(!d.index||!d.notes) throw 0; db=d; save(); return {ok:true, stats:stats(db.index)}; }catch(e){ return {ok:false,error:'not a valid brain file'}; } }
  function clear(){ db=null; localStorage.removeItem(KEY); load(); }
  function available(){ try{ localStorage.setItem('bda:test','1'); localStorage.removeItem('bda:test'); return true; }catch(e){ return false; } }

  function data(){ load(); return db.data||{}; }         // {docId: entities} for compose
  function docMeta(){ load(); return db.index.docs||{}; }
  return {ingest, index, note, saveAnswer, getDoc, saveAI, exportAll, importAll, clear, available, slug, data, docMeta};
})();
