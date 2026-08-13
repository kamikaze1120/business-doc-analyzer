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
  {id:'systems',     name:'Systems & Integration Inventory',       scope:'multi'}
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
  }
};

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
