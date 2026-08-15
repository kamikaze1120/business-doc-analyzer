/* ============================================================
   COMPOSE — generate real documents FROM THE BRAIN, no AI.

   Deterministic templates assemble stored knowledge (requirements,
   stakeholders, risks, tests, milestones…) across one or all
   documents into a formatted, exportable document. Pure data-merge.
   ============================================================ */

const COMPOSE_TEMPLATES = [
  {id:'brief',       name:'Project Brief (one document)',        scope:'single'},
  {id:'stakeholders',name:'Stakeholder Register (all docs)',      scope:'multi'},
  {id:'risks',       name:'Consolidated Risk Register (all docs)',scope:'multi'},
  {id:'rtm',         name:'Requirements Traceability Matrix',      scope:'multi'},
  {id:'testplan',    name:'Master Test Plan',                      scope:'multi'},
  {id:'systems',     name:'Systems & Integration Inventory',       scope:'multi'},
  {id:'raci',        name:'RACI Matrix (one document)',            scope:'single'},
  {id:'timeline',    name:'Milestone Timeline (all docs)',          scope:'multi'},
  {id:'duplicates',  name:'Duplicate / Similar Requirements',       scope:'multi'}
];

function _esc(s){ return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function _rows(data, docs, pick){    // gather items across selected docs, tagging source
  const out=[];
  docs.forEach(id=>{ const e=data[id]||{}; (pick(e)||[]).forEach(x=>out.push(Object.assign({__src:id}, typeof x==='string'?{value:x}:x))); });
  return out;
}
function _docTitle(meta,id){ return (meta[id]&&meta[id].title)||id; }

/* Each builder returns {title, html, md}. */
const COMPOSER = {
  brief(data, meta, docs){
    const id=docs[0], e=data[id]||{}, title=_docTitle(meta,id);
    const L=(arr,f)=>arr&&arr.length?('<ul>'+arr.map(x=>'<li>'+_esc(f(x))+'</li>').join('')+'</ul>'):'<p class="muted">—</p>';
    const html=`<h1>Project Brief — ${_esc(title)}</h1>
      <p class="muted">Generated from the brain · ${new Date().toLocaleDateString()} · type: ${_esc((meta[id]||{}).docTypeName||'')}</p>
      <h2>Objectives</h2>${L(e.objectives,o=>o.text||o)}
      <h2>In Scope</h2>${L(e.scopeIn,x=>x)}
      <h2>Out of Scope</h2>${L(e.scopeOut,x=>x)}
      <h2>Stakeholders</h2>${e.stakeholders&&e.stakeholders.length?tbl(['Role','Name','Responsibilities'],e.stakeholders.map(s=>[s.role,s.name!=='—'?s.name:'',s.note||''])):'<p class="muted">—</p>'}
      <h2>Milestones</h2>${e.milestones&&e.milestones.length?tbl(['Milestone','Target'],e.milestones.map(m=>[m.label,m.date||''])):'<p class="muted">—</p>'}
      <h2>Risks</h2>${e.risks&&e.risks.length?tbl(['Severity','Risk','Mitigation'],e.risks.map(r=>[r.sev||'',r.risk,r.mitigation||''])):'<p class="muted">—</p>'}
      <h2>Success Metrics</h2>${L(e.metrics,m=>m.name+(m.target?': '+m.target:''))}`;
    return {title:'Project Brief — '+title, html, md:htmlToMd(html)};
  },
  stakeholders(data, meta, docs){
    const rows=_rows(data,docs,e=>e.stakeholders);
    const byRole={}; rows.forEach(r=>{ const k=(r.role||'')+'|'+(r.name||''); (byRole[k]=byRole[k]||{role:r.role,name:r.name,note:r.note,src:new Set()}).src.add(r.__src); if(r.note&&!byRole[k].note)byRole[k].note=r.note; });
    const list=Object.values(byRole);
    const html=`<h1>Stakeholder Register</h1><p class="muted">${list.length} stakeholders across ${docs.length} document(s) · ${new Date().toLocaleDateString()}</p>`+
      tbl(['Role','Name / Team','Responsibilities','Appears in'], list.map(s=>[s.role, s.name!=='—'?s.name:'', s.note||'', [...s.src].map(id=>_docTitle(meta,id)).join('; ')]));
    return {title:'Stakeholder Register', html, md:htmlToMd(html)};
  },
  risks(data, meta, docs){
    const rows=_rows(data,docs,e=>e.risks);
    const sev=s=>({critical:0,high:1,severe:1,medium:2,moderate:2,low:3,minor:3}[(s||'').toLowerCase()]??2);
    rows.sort((a,b)=>sev(a.sev)-sev(b.sev));
    const html=`<h1>Consolidated Risk Register</h1><p class="muted">${rows.length} risks across ${docs.length} document(s) · ${new Date().toLocaleDateString()}</p>`+
      tbl(['#','Severity','Risk','Mitigation','Source'], rows.map((r,i)=>[i+1, r.sev||'—', r.risk, r.mitigation||'—', _docTitle(meta,r.__src)]));
    return {title:'Consolidated Risk Register', html, md:htmlToMd(html)};
  },
  rtm(data, meta, docs){
    const reqRows=[];
    docs.forEach(id=>{ const e=data[id]||{}; const tests=e.tests||[];
      (e.requirements||[]).forEach(r=>{ const linked=tests.filter(t=>String(t.req).split(',').map(s=>s.trim()).includes(r.id)).map(t=>t.id);
        reqRows.push([r.id, r.cat, r.priority, r.text, linked.join(', ')||'—', linked.length?'Covered':'GAP', _docTitle(meta,id)]); }); });
    const gaps=reqRows.filter(r=>r[5]==='GAP').length;
    const html=`<h1>Requirements Traceability Matrix</h1><p class="muted">${reqRows.length} requirements · ${gaps} without test coverage · ${new Date().toLocaleDateString()}</p>`+
      tbl(['Req ID','Type','Priority','Requirement','Test cases','Status','Source'], reqRows);
    return {title:'Requirements Traceability Matrix', html, md:htmlToMd(html)};
  },
  testplan(data, meta, docs){
    const tests=_rows(data,docs,e=>e.tests);
    const byType={}; tests.forEach(t=>{ (byType[t.type]=byType[t.type]||[]).push(t); });
    let body='';
    Object.keys(byType).sort().forEach(ty=>{ body+=`<h2>${_esc(ty)} (${byType[ty].length})</h2>`+
      tbl(['Test ID','Traces to','Priority','Title','Source'], byType[ty].map(t=>[t.id,t.req,t.priority,t.title,_docTitle(meta,t.__src)])); });
    const html=`<h1>Master Test Plan</h1><p class="muted">${tests.length} test cases across ${docs.length} document(s) · ${new Date().toLocaleDateString()}</p>${body||'<p class="muted">No test cases in the selected documents.</p>'}`;
    return {title:'Master Test Plan', html, md:htmlToMd(html)};
  },
  systems(data, meta, docs){
    const map={};
    docs.forEach(id=>{ (data[id]&&data[id].systems||[]).forEach(s=>{ (map[s]=map[s]||new Set()).add(id); }); });
    const list=Object.entries(map).sort((a,b)=>b[1].size-a[1].size);
    const html=`<h1>Systems &amp; Integration Inventory</h1><p class="muted">${list.length} systems across ${docs.length} document(s) · ${new Date().toLocaleDateString()}</p>`+
      (list.length?tbl(['System / Integration','# Docs','Referenced in'], list.map(([s,set])=>[s,set.size,[...set].map(id=>_docTitle(meta,id)).join('; ')])):'<p class="muted">No systems detected.</p>');
    return {title:'Systems & Integration Inventory', html, md:htmlToMd(html)};
  },
  raci(data, meta, docs){
    const id=docs[0], e=data[id]||{}, title=_docTitle(meta,id);
    const roles=[...new Set((e.stakeholders||[]).map(s=>s.role))].slice(0,10);
    let acts=[];
    if((e.requirements||[]).length) acts=e.requirements.map(r=>({label:r.id+': '+String(r.text).slice(0,70), text:r.text}));
    else if((e.milestones||[]).length) acts=e.milestones.map(m=>({label:m.label, text:m.label}));
    else acts=(e.objectives||[]).map(o=>({label:o.text||o, text:o.text||o}));
    if(!roles.length || !acts.length){
      const h=`<h1>RACI Matrix — ${_esc(title)}</h1><p class="muted">Not enough roles or activities in this document to build a matrix.</p>`;
      return {title:'RACI Matrix — '+title, html:h, md:htmlToMd(h)}; }
    const accountable = roles.find(r=>/sponsor|owner|director|chief|head|vp|manager|lead/i.test(r)) || roles[0];
    const cell=(role,a)=>{ const kw=role.toLowerCase().split(/\s+/).filter(w=>w.length>3);
      const R=kw.some(w=>a.text.toLowerCase().includes(w)); const marks=[]; if(R)marks.push('R'); if(role===accountable)marks.push('A'); return marks.join('/'); };
    const html=`<h1>RACI Matrix — ${_esc(title)}</h1>
      <p class="muted">Draft · R (Responsible) auto-derived from role mentions · A (Accountable) = ${_esc(accountable)} · add C/I as you refine · ${new Date().toLocaleDateString()}</p>`+
      tbl(['Activity', ...roles], acts.slice(0,60).map(a=>[a.label, ...roles.map(r=>cell(r,a))]));
    return {title:'RACI Matrix — '+title, html, md:htmlToMd(html)};
  },
  timeline(data, meta, docs){
    const items=[];
    docs.forEach(id=>{ (data[id]&&data[id].milestones||[]).forEach(m=>items.push({label:m.label, date:m.date||'', src:id})); });
    if(!items.length){ const h='<h1>Milestone Timeline</h1><p class="muted">No milestones with dates found in the selected documents.</p>'; return {title:'Milestone Timeline', html:h, md:htmlToMd(h)}; }
    items.forEach(it=>it._k=_timeKey(it.date));
    items.sort((a,b)=> (a._k===null)-(b._k===null) || (a._k>b._k?1:a._k<b._k?-1:0));
    // simple visual timeline + table
    const vis=`<div style="margin:10px 0">`+items.map(it=>`<div style="display:flex;gap:10px;align-items:baseline;padding:4px 0;border-left:3px solid #5b8cff;padding-left:12px;margin-left:4px">
        <strong style="min-width:120px;color:#0b5">${_esc(it.date||'(undated)')}</strong>
        <span>${_esc(it.label)} <span class="muted">— ${_esc(_docTitle(meta,it.src))}</span></span></div>`).join('')+`</div>`;
    const html=`<h1>Milestone Timeline</h1><p class="muted">${items.length} milestones across ${docs.length} document(s) · sorted by date · ${new Date().toLocaleDateString()}</p>${vis}`+
      tbl(['Date','Milestone','Project'], items.map(it=>[it.date||'(undated)', it.label, _docTitle(meta,it.src)]));
    return {title:'Milestone Timeline', html, md:htmlToMd(html)};
  },
  duplicates(data, meta, docs){
    const reqs=[]; docs.forEach(id=>{ (data[id]&&data[id].requirements||[]).forEach(r=>reqs.push({id:r.id, text:r.text, doc:id})); });
    const norm=t=>new Set(String(t).toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2 && !_DUP_STOP.has(w)));
    const toks=reqs.map(r=>norm(r.text));
    const jac=(a,b)=>{ let i=0; a.forEach(x=>{ if(b.has(x)) i++; }); const u=a.size+b.size-i; return u?i/u:0; };
    const parent=reqs.map((_,i)=>i); const find=x=>parent[x]===x?x:(parent[x]=find(parent[x]));
    const TH=0.55;
    for(let i=0;i<reqs.length;i++) for(let j=i+1;j<reqs.length;j++){ if(toks[i].size<3||toks[j].size<3) continue; if(jac(toks[i],toks[j])>=TH) parent[find(i)]=find(j); }
    const groups={}; reqs.forEach((r,i)=>{ (groups[find(i)]=groups[find(i)]||[]).push(r); });
    const dup=Object.values(groups).filter(g=>g.length>1).sort((a,b)=>b.length-a.length);
    if(!dup.length){ const h=`<h1>Duplicate / Similar Requirements</h1><p class="muted">Scanned ${reqs.length} requirements across ${docs.length} document(s) — no near-duplicates found.</p>`; return {title:'Duplicate Requirements', html:h, md:htmlToMd(h)}; }
    let body=''; dup.forEach((g,i)=>{ const cross=new Set(g.map(r=>r.doc)).size>1;
      body+=`<h2>Group ${i+1} — ${g.length} similar${cross?' · across projects':''}</h2>`+tbl(['Req ID','Requirement','Project'], g.map(r=>[r.id, r.text, _docTitle(meta,r.doc)])); });
    const html=`<h1>Duplicate / Similar Requirements</h1><p class="muted">${dup.length} group(s) of near-duplicate requirements across ${docs.length} document(s) · ${new Date().toLocaleDateString()}</p>${body}`;
    return {title:'Duplicate Requirements', html, md:htmlToMd(html)};
  }
};
const _DUP_STOP=new Set('the a an of to for in on at by with from into via and or but if then that this these those its their is are was were be been being shall must should will may can not no system user users able required order various appropriate relevant applicable all each any able provide provides allow allows enable enables support supports'.split(/\s+/));
function _timeKey(d){
  if(!d) return null; d=String(d).trim(); let m;
  if(m=d.match(/^(\d{4})-(\d{2})-(\d{2})$/)) return m[1]+m[2]+m[3];
  const mo={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  if(m=d.match(/([a-z]{3,9})\.?\s+(\d{1,2})?,?\s*(\d{4})/i)){ const k=mo[m[1].slice(0,3).toLowerCase()]; if(k) return m[3]+k+String(m[2]||'00').padStart(2,'0'); }
  if(m=d.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)){ const y=m[3].length===2?'20'+m[3]:m[3]; return y+String(m[1]).padStart(2,'0')+String(m[2]).padStart(2,'0'); }
  if(m=d.match(/Q([1-4])\s*'?(\d{2,4})/i)){ const y=m[2].length===2?'20'+m[2]:m[2]; return y+'Q'+m[1]; }
  return null;
}

function tbl(headers, rows){
  return `<table><thead><tr>${headers.map(h=>'<th>'+_esc(h)+'</th>').join('')}</tr></thead><tbody>`+
    rows.map(r=>'<tr>'+r.map(c=>'<td>'+_esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
/* very small HTML→Markdown for the .md download */
function htmlToMd(html){
  let md=html
    .replace(/<h1>(.*?)<\/h1>/g,'# $1\n')
    .replace(/<h2>(.*?)<\/h2>/g,'\n## $1\n')
    .replace(/<p class="muted">(.*?)<\/p>/g,'_$1_\n')
    .replace(/<ul>/g,'').replace(/<\/ul>/g,'\n').replace(/<li>(.*?)<\/li>/g,'- $1\n');
  md=md.replace(/<table>[\s\S]*?<\/table>/g, t=>{
    const heads=[...t.matchAll(/<th>(.*?)<\/th>/g)].map(m=>m[1]);
    const rows=[...t.matchAll(/<tr>((?:(?!<\/tr>)[\s\S])*?)<\/tr>/g)].map(r=>[...r[1].matchAll(/<td>(.*?)<\/td>/g)].map(m=>m[1])).filter(r=>r.length);
    let out='\n| '+heads.join(' | ')+' |\n| '+heads.map(()=>'---').join(' | ')+' |\n';
    rows.forEach(r=>out+='| '+r.join(' | ')+' |\n'); return out;
  });
  return md.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\n{3,}/g,'\n\n').trim();
}

let LAST_COMPOSED=null;
function openCompose(){
  const meta=Store.docMeta(), docIds=Object.keys(meta);
  if(!docIds.length){ toast('Add documents to the brain first.'); return; }
  const modal=E('compose'); modal.classList.remove('hidden');
  E('compose-body').innerHTML=`
    <div class="kv">
      <div class="k">Template</div><div class="v"><select id="cmp-tpl">${COMPOSE_TEMPLATES.map(t=>`<option value="${t.id}">${_esc(t.name)}</option>`).join('')}</select></div>
      <div class="k">Source</div><div class="v"><select id="cmp-src"></select></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn sm" id="cmp-gen">Generate</button>
      <button class="btn ghost sm hidden" id="cmp-md">⬇ Download .md</button>
      <button class="btn ghost sm hidden" id="cmp-print">🖨 Print / PDF</button>
      <button class="btn ghost sm hidden" id="cmp-add">＋ Add to Brain</button>
    </div>
    <div id="cmp-out" style="margin-top:14px"></div>`;
  const tpl=E('cmp-tpl'), src=E('cmp-src');
  const syncSrc=()=>{ const t=COMPOSE_TEMPLATES.find(x=>x.id===tpl.value);
    src.innerHTML = t.scope==='single'
      ? docIds.map(id=>`<option value="${id}">${_esc(meta[id].title)}</option>`).join('')
      : `<option value="__all">All documents (${docIds.length})</option>`+docIds.map(id=>`<option value="${id}">Only: ${_esc(meta[id].title)}</option>`).join(''); };
  tpl.onchange=syncSrc; syncSrc();
  E('cmp-gen').onclick=()=>{
    const data=Store.data(), t=tpl.value;
    const docs = src.value==='__all' ? docIds : [src.value];
    let res; try{ res=COMPOSER[t](data, meta, docs); }catch(e){ console.error(e); toast('Could not compose: '+e.message); return; }
    LAST_COMPOSED=res;
    E('cmp-out').innerHTML=`<div class="compose-doc" id="cmp-doc">${res.html}</div>`;
    ['cmp-md','cmp-print','cmp-add'].forEach(id=>E(id).classList.remove('hidden'));
  };
  E('cmp-md').onclick=()=>{ if(!LAST_COMPOSED)return; const blob=new Blob([LAST_COMPOSED.md],{type:'text/markdown'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=LAST_COMPOSED.title.replace(/[^\w]+/g,'_')+'.md'; a.click(); URL.revokeObjectURL(a.href); };
  E('cmp-print').onclick=()=>{ if(!LAST_COMPOSED)return; const w=window.open('','_blank');
    w.document.write('<html><head><title>'+_esc(LAST_COMPOSED.title)+'</title><style>body{font-family:system-ui,Arial;margin:40px;color:#111}h1{font-size:22px}h2{font-size:16px;border-bottom:1px solid #ddd;padding-bottom:3px;margin-top:22px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #bbb;padding:6px 9px;text-align:left;font-size:12px}th{background:#eee}.muted{color:#666}</style></head><body>'+LAST_COMPOSED.html+'</body></html>');
    w.document.close(); setTimeout(()=>w.print(),400); };
  E('cmp-add').onclick=()=>{ if(!LAST_COMPOSED)return;
    // store the composed document as its own brain document (so it becomes searchable/linkable)
    Store.ingest({doc:{title:LAST_COMPOSED.title, fileName:LAST_COMPOSED.title+' (composed)', type:'generic', typeName:'Composed Document', confidence:100, words:LAST_COMPOSED.md.split(/\s+/).length, sections:0}, entities:{}});
    toast('Saved “'+LAST_COMPOSED.title+'” to the brain.');
    if(!E('brain').classList.contains('hidden')) renderBrain();
  };
}
