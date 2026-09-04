/* ============================================================
   MOCKUP GENERATOR (AI-only) — turn an analyzed BRD into an
   interactive, clickable HTML prototype in a clean enterprise
   style (role switcher · dashboard · submission form · request
   tracking · approval workflow · record timeline · notifications).

   Philosophy (same as the rest of the tool): the AI never emits raw
   markup. An AI agent reads the BRD analysis and returns a COMPACT,
   TYPED app-model (roles, form fields, approval pipeline, metrics,
   sample rows). We validate + backfill that model deterministically,
   then a fixed template renders a real working prototype from it. So
   the output is reliable, never hallucinated HTML, and the AI is the
   analyst — exactly what was asked.

   Gating: generation REQUIRES an AI provider. `generate()` throws if
   no llm function is supplied; the UI only exposes it when AI is on.

   DOM-free and dual-exported (browser global + Node module) so the
   validation/rendering can be unit-tested headlessly.
   ============================================================ */
;(function(root){
  'use strict';

  const KNOWN_PAGES = ['dashboard','submit','requests','approvals','record','reports','notifications'];
  const TONES = ['pending','review','approved','rejected','info'];
  const FIELD_TYPES = ['text','number','date','email','select','textarea','file','currency'];

  /* ---------- 1. Build a compact context from the BRD analysis ---------- */
  function buildContext(state){
    state = state || {};
    const el = state.el || {};
    const pick = (arr,n,f)=> (Array.isArray(arr)?arr:[]).slice(0,n).map(f).filter(Boolean);
    const reqText = r => (r && (r.text||r)) || '';
    return {
      title: (state.meta && state.meta.title) || state.fileName || 'Business Application',
      docType: (state.docType && state.docType.name) || 'Business Document',
      objectives: pick(el.objectives, 8, o=> (o.text||o)),
      stakeholders: pick(el.stakeholders, 12, s=> (s.role||s.name||s)),
      personas: pick(el.personas, 8, p=> (p.name||p.role||p)),
      actors: pick(state.actors, 10, a=> a),
      features: pick(el.features, 12, f=> (f.text||f.name||f)),
      dataFields: pick(el.dataFields || el.fields, 20, f=> (f.name||f.text||f)),
      requirements: pick(state.reqs, 40, r=> ({ text: reqText(r).slice(0,240), cat: r.cat||'FR' })),
      metrics: pick(el.metrics, 8, m=> (m.name||m.text||m))
    };
  }

  /* ---------- 2. The AI instruction (returns a typed app-model) ---------- */
  function promptFor(ctx){
    return `You are a senior business analyst turning a Business Requirements Document into an INTERACTIVE UI PROTOTYPE spec.
Read the analyzed BRD below and return ONE JSON object describing a clickable enterprise web app that fulfills it.

BRD ANALYSIS:
${JSON.stringify(ctx, null, 1)}

Return JSON with EXACTLY this shape (no markdown, JSON only):
{
  "app": { "name": "<short app name>", "subtitle": "<one line>", "brandInitials": "<2-3 letters>", "entity": "<singular record noun, e.g. Request>", "entityPlural": "<plural>" },
  "roles": [ { "id": "<slug>", "label": "<role name>", "user": "<sample person name>", "canApprove": <true|false> } ],
  "pipeline": [ "<ordered approval stage names, submitter first stage last approval>" ],
  "statusApproved": "<final approved label>",
  "statusRejected": "<rejected label>",
  "form": { "title": "<form title>", "intro": "<short helper sentence>",
    "sections": [ { "title": "<section>", "fields": [ { "label": "<field>", "type": "text|number|date|email|select|textarea|file|currency", "auto": <true if auto-populated from the user profile>, "required": <bool>, "options": ["<for select only>"], "help": "<optional>" } ] } ] },
  "tableColumns": [ "<3-6 field labels to show in the tracking table>" ],
  "metrics": [ { "label": "<dashboard card>", "stage": "<a pipeline stage / approved / rejected>" } ],
  "workflow": [ { "label": "<step>", "desc": "<short>" } ],
  "demo": [ { "values": { "<field label>": "<value>" }, "stageIndex": <int 0-based into pipeline, or -1 approved, -2 rejected> } ]
}
Rules: 3-4 roles (at least one submitter and one approver). 2-4 pipeline stages. 6-14 form fields grouped in 1-3 sections; mark identity fields (name, id, email, manager, date) auto:true. 3-5 metrics. 2-4 workflow steps. 2-3 demo rows. Keep every string under 80 chars. Base everything on the BRD; do not invent unrelated domains.`;
  }

  /* ---------- 3. Validate + backfill (never throws; always renderable) ---------- */
  function s(v, max, dflt){ v=(v==null?'':String(v)).trim(); if(!v) return dflt||''; return v.length>max?v.slice(0,max):v; }
  function slug(v){ return s(v,40,'x').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'f'; }
  function arr(v){ return Array.isArray(v)?v:[]; }

  function coerceSpec(raw, ctx){
    raw = (raw && typeof raw==='object') ? raw : {};
    ctx = ctx || {};
    const a = raw.app||{};
    const app = {
      name: s(a.name, 60, ctx.title || 'Business Application'),
      subtitle: s(a.subtitle, 120, ctx.docType || 'Interactive prototype'),
      brandInitials: s(a.brandInitials, 3, (ctx.title||'AP').replace(/[^A-Za-z]/g,'').slice(0,2).toUpperCase()||'AP').toUpperCase(),
      entity: s(a.entity, 30, 'Request'),
      entityPlural: s(a.entityPlural, 30, s(a.entity,28,'Request')+'s')
    };

    let roles = arr(raw.roles).map((r,i)=>({
      id: slug(r.id||r.label||('role'+i)),
      label: s(r.label, 40, 'Role '+(i+1)),
      user: s(r.user, 50, 'User '+(i+1)),
      canApprove: !!r.canApprove
    })).slice(0,5);
    if(!roles.length) roles = [{id:'employee',label:'Employee',user:'Alex Johnson',canApprove:false},{id:'manager',label:'Manager',user:'Taylor Morgan',canApprove:true}];
    // de-dup role ids
    const seen={}; roles.forEach(r=>{ let id=r.id, n=2; while(seen[id]){ id=r.id+'_'+n++; } r.id=id; seen[id]=1; });
    if(!roles.some(r=>r.canApprove)) roles[roles.length-1].canApprove=true;
    if(!roles.some(r=>!r.canApprove)) roles[0].canApprove=false;

    let pipeline = arr(raw.pipeline).map(x=>s(x,48,'')).filter(Boolean).slice(0,4);
    if(pipeline.length<1) pipeline = ['Pending Approval'];
    const statusApproved = s(raw.statusApproved, 40, 'Approved');
    const statusRejected = s(raw.statusRejected, 40, 'Rejected');

    // form
    const rf = raw.form||{};
    let sections = arr(rf.sections).map(sec=>({
      title: s(sec.title, 60, 'Details'),
      fields: arr(sec.fields).map(f=>{
        let type = s(f.type,12,'text').toLowerCase(); if(FIELD_TYPES.indexOf(type)<0) type='text';
        const label = s(f.label, 60, 'Field');
        return { key: slug(label), label, type, auto: !!f.auto, required: !!f.required,
          options: arr(f.options).map(o=>s(o,60,'')).filter(Boolean).slice(0,12),
          help: s(f.help, 160, '') };
      }).filter(f=>f.label).slice(0,16)
    })).filter(sec=>sec.fields.length).slice(0,3);
    if(!sections.length){
      sections=[{title:'Request Information', fields:[
        {key:'requester',label:'Requester',type:'text',auto:true,required:true,options:[],help:''},
        {key:'date',label:'Date',type:'date',auto:true,required:true,options:[],help:''},
        {key:'amount',label:'Amount',type:'currency',auto:false,required:true,options:[],help:''},
        {key:'reason',label:'Reason',type:'textarea',auto:false,required:true,options:[],help:''}
      ]}];
    }
    // ensure unique field keys across the whole form
    const kseen={}; const allFields=[];
    sections.forEach(sec=>sec.fields.forEach(f=>{ let k=f.key,n=2; while(kseen[k]){k=f.key+'_'+n++;} f.key=k; kseen[k]=1; allFields.push(f); }));

    let tableColumns = arr(raw.tableColumns).map(c=>{
      const label=s(c,60,''); if(!label) return null;
      const f = allFields.find(x=>x.label.toLowerCase()===label.toLowerCase());
      return { key: f?f.key:slug(label), label };
    }).filter(Boolean).slice(0,6);
    if(!tableColumns.length) tableColumns = allFields.slice(0,4).map(f=>({key:f.key,label:f.label}));

    const stageNames = pipeline.concat([statusApproved, statusRejected]);
    let metrics = arr(raw.metrics).map(m=>{
      const stage=s(m.stage,48,''); const label=s(m.label,40,stage||'Metric');
      const match = stageNames.find(n=>n.toLowerCase()===stage.toLowerCase()) || stage;
      return { label, stage: match };
    }).filter(m=>m.label).slice(0,6);
    if(!metrics.length){ metrics = [{label:'Total '+app.entityPlural, stage:'*'}].concat(pipeline.map(p=>({label:p,stage:p}))).concat([{label:statusApproved,stage:statusApproved}]).slice(0,5); }

    let workflow = arr(raw.workflow).map(w=>({label:s(w.label,40,'Step'), desc:s(w.desc,90,'')})).filter(w=>w.label).slice(0,5);
    if(!workflow.length) workflow = [{label:'Submit',desc:'Requester submits'}].concat(pipeline.map(p=>({label:p,desc:'Approval stage'}))).concat([{label:'Done',desc:'Notification sent'}]).slice(0,5);

    const demo = arr(raw.demo).map((d,i)=>{
      const values={}; const dv=(d&&d.values&&typeof d.values==='object')?d.values:{};
      allFields.forEach(f=>{ const hit=Object.keys(dv).find(k=>k.toLowerCase()===f.label.toLowerCase());
        values[f.key]= hit!=null ? s(dv[hit],80,'') : sampleValue(f, i); });
      let si = Number(d && d.stageIndex); if(!isFinite(si)) si=0;
      si = Math.max(-2, Math.min(pipeline.length-1, si));
      return { values, stageIndex: si };
    }).slice(0,4);
    while(demo.length<2){ const i=demo.length; const values={}; allFields.forEach(f=>values[f.key]=sampleValue(f,i));
      demo.push({values, stageIndex: i===0?0:(pipeline.length>1?1:-1)}); }

    return { app, roles, pipeline, statusApproved, statusRejected, form:{title:s(rf.title,80,app.entity+' Submission'), intro:s(rf.intro,160,''), sections},
      tableColumns, metrics, workflow, demo };
  }

  function sampleValue(f, i){
    switch(f.type){
      case 'number': return String([120,175,240][i%3]);
      case 'currency': return '$'+[120,175,240][i%3];
      case 'date': { const d=new Date(Date.now()-i*86400000); return d.toISOString().slice(0,10); }
      case 'email': return ['alex.johnson','jordan.lee','casey.smith'][i%3]+'@example.com';
      case 'select': return f.options[0] || 'Option A';
      case 'file': return 'attachment-'+(i+1)+'.pdf';
      case 'textarea': return 'Sample '+f.label.toLowerCase()+' details.';
      default: return f.label + ' ' + (i+1);
    }
  }

  /* ---------- 4. Deterministic renderer → standalone HTML prototype ---------- */
  function esc(x){ return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function renderHTML(spec){
    const json = JSON.stringify(spec).replace(/</g,'\\u003c');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(spec.app.name)} — Prototype</title>
<style>${THEME_CSS}</style></head><body>
<header class="topbar">
  <div class="brand"><div class="brand-icon">${esc(spec.app.brandInitials)}</div>
    <div><h1>${esc(spec.app.name)}</h1><p>${esc(spec.app.subtitle)}</p></div></div>
  <div class="role-area"><label>Viewing as:</label>
    <select id="roleSelector"></select></div>
</header>
<nav class="nav" id="navigation"></nav>
<main class="container" id="main"></main>
<div class="modal-overlay" id="approvalModal"><div class="modal">
  <h3 id="modalTitle"></h3><p id="modalDescription" class="help-text"></p>
  <div class="form-group" style="margin-top:16px"><label>Comments</label>
    <textarea id="approvalComments" rows="4" placeholder="Optional comments…"></textarea></div>
  <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button id="modalActionButton" class="btn"></button></div></div></div>
<div class="mock-badge">PROTOTYPE · generated from your BRD</div>
<script>const SPEC=${json};\n${APP_JS}</script>
</body></html>`;
  }

  /* ---------- context from a Truth-Model project (Analyst OS path) ---------- */
  const REQ_TYPES = ['functional_requirement','non_functional_requirement','business_requirement','integration_requirement','data_requirement','reporting_requirement'];
  function contextFromProject(projectId, model){
    model = model || root.Model;
    if(!model || !model.getProject(projectId)) return null;
    const p = model.getProject(projectId);
    const objs = model.listObjects(projectId);
    const byType = t => objs.filter(o=>o.type===t);
    const titles = (t,n)=> byType(t).slice(0,n).map(o=> (o.title||o.description||'')).filter(Boolean);
    const catFor = t => t==='non_functional_requirement'?'NFR':t==='integration_requirement'?'INT':t==='business_requirement'?'BR':'FR';
    const requirements = objs.filter(o=>REQ_TYPES.indexOf(o.type)>=0).slice(0,40)
      .map(o=>({ text:((o.description||o.title)||'').slice(0,240), cat:catFor(o.type) })).filter(r=>r.text);
    return {
      title: (p.meta && p.meta.project) || p.name || 'Business Application',
      docType: 'Project Truth Model',
      objectives: titles('business_objective', 8),
      stakeholders: titles('stakeholder', 12),
      personas: titles('persona', 8),
      actors: titles('actor', 10),
      features: titles('user_story', 8).concat(titles('use_case', 4)).slice(0,12),
      dataFields: titles('data_entity', 12).concat(titles('data_field', 12)).slice(0,20),
      requirements,
      metrics: titles('metric', 6).concat(titles('kpi', 4)).slice(0,8)
    };
  }

  /* ---------- orchestration (AI required) ---------- */
  async function generate(state, opts){
    opts = opts||{};
    const llm = opts.llm;
    if(typeof llm!=='function') throw new Error('The mockup generator requires AI — enable an AI provider in Settings first.');
    const ctx = opts.context || buildContext(state);
    let raw=null;
    try{ raw = await llm(promptFor(ctx), {temperature:0.35, format:'json', system:'You are a precise business analyst. Return only valid JSON matching the requested shape.'}); }
    catch(e){ throw new Error('The AI could not produce a mockup: '+(e.message||e)); }
    const spec = coerceSpec(raw, ctx);
    return { spec, html: renderHTML(spec), context: ctx, usedFallback: !raw };
  }

  const Mockup = { buildContext, contextFromProject, promptFor, coerceSpec, renderHTML, generate, KNOWN_PAGES, TONES };
  root.Mockup = Mockup;
  if(typeof module!=='undefined' && module.exports) module.exports = Mockup;

  /* ============================ TEMPLATE ASSETS ============================ */
  const THEME_CSS = `
:root{--blue:#0176d3;--navy:#032d60;--light-blue:#eef6ff;--green:#2e844a;--orange:#fe9339;--red:#ba0517;--purple:#7b61a8;--gray-50:#f8f9fb;--gray-100:#f3f4f6;--gray-200:#e1e4e8;--gray-400:#6b7280;--gray-700:#374151;--white:#fff;--shadow:0 3px 12px rgba(0,0,0,.08);--radius:12px}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;background:#f4f6f9;color:var(--gray-700)}
.topbar{background:var(--navy);color:#fff;min-height:72px;padding:0 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{display:flex;align-items:center;gap:13px}.brand-icon{width:42px;height:42px;border-radius:8px;background:#fff;color:var(--navy);display:flex;align-items:center;justify-content:center;font-weight:bold}
.brand h1{font-size:18px}.brand p{font-size:12px;opacity:.8;margin-top:4px}.role-area{display:flex;align-items:center;gap:10px}
.role-area label{color:#fff;font-size:12px}.role-area select{width:250px;border:none;padding:9px;border-radius:6px}
.nav{background:#fff;display:flex;gap:4px;padding:0 22px;border-bottom:1px solid var(--gray-200);overflow-x:auto}
.nav button{background:transparent;border:none;padding:16px 18px;cursor:pointer;font-size:14px;color:var(--gray-700);white-space:nowrap;border-bottom:3px solid transparent}
.nav button:hover,.nav button.active{color:var(--blue);border-bottom-color:var(--blue);background:#f8fbff}
.container{max-width:1450px;margin:auto;padding:28px}.page-header{margin-bottom:24px}.page-header h2{color:var(--navy);margin-bottom:6px}.page-header p{color:var(--gray-400)}
.card{background:#fff;padding:24px;border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:20px}
.section-title{color:var(--navy);font-size:18px;border-bottom:1px solid var(--gray-200);padding-bottom:12px;margin-bottom:20px}
.btn{border:none;border-radius:6px;padding:11px 18px;cursor:pointer;font-size:14px}.btn-primary{background:var(--blue);color:#fff}.btn-success{background:var(--green);color:#fff}.btn-danger{background:var(--red);color:#fff}.btn-secondary{background:#fff;color:var(--blue);border:1px solid var(--blue)}
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.full-width{grid-column:1/-1}.form-group{display:flex;flex-direction:column;gap:7px}
label{font-size:13px;font-weight:bold}input,select,textarea{width:100%;border:1px solid #c9c9c9;border-radius:6px;padding:11px 12px;font-size:14px;font-family:inherit}input[readonly]{background:var(--gray-100);color:#555}
.required{color:var(--red)}.auto-tag{background:var(--green);color:#fff;border-radius:10px;padding:3px 7px;font-size:10px;margin-left:6px}
.help-text{font-size:12px;color:var(--gray-400);line-height:1.5}.alert{padding:16px;border-radius:8px;margin-bottom:20px;line-height:1.5}
.alert-info{background:var(--light-blue);color:var(--navy);border-left:4px solid var(--blue)}.alert-success{background:#eaf5ee;color:#1e6032;border-left:4px solid var(--green)}
.file-box{border:2px dashed #c9d9e8;padding:16px;border-radius:8px;background:#f9fcff;text-align:center}
.signature-box{height:90px;border:2px dashed #999;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fafafa;font-family:cursive;font-size:20px}
.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:18px;margin-bottom:24px}
.metric-card{background:#fff;border-left:5px solid var(--blue);padding:20px;border-radius:var(--radius);box-shadow:var(--shadow)}
.metric-card.green{border-color:var(--green)}.metric-card.orange{border-color:var(--orange)}.metric-card.purple{border-color:var(--purple)}.metric-card.red{border-color:var(--red)}
.metric-label{font-size:13px;color:var(--gray-400);margin-bottom:8px}.metric-value{font-size:30px;color:var(--navy);font-weight:bold}
.dashboard-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:20px}.bar-row{margin-bottom:18px}.bar-label{display:flex;justify-content:space-between;font-size:13px;margin-bottom:7px}
.bar-track{height:10px;background:var(--gray-100);border-radius:20px;overflow:hidden}.bar-fill{height:100%;background:var(--blue);border-radius:20px}
.table-wrap{overflow-x:auto}.table-controls{display:flex;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}.table-controls input,.table-controls select{width:auto;min-width:220px}
table{width:100%;border-collapse:collapse;font-size:13px}th{background:var(--gray-100);color:var(--navy);text-align:left;padding:13px}td{padding:13px;border-bottom:1px solid var(--gray-200)}
.status{padding:5px 9px;border-radius:15px;font-size:11px;font-weight:bold;display:inline-block}.status.pending{background:#fff1d6;color:#805400}.status.review{background:#eee5ff;color:#5e3f92}.status.approved{background:#e1f5e7;color:#1f7438}.status.rejected{background:#fde7e9;color:var(--red)}
.record-header{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}.record-details{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin-top:22px}
.detail{background:var(--gray-50);border-radius:8px;padding:14px}.detail small{display:block;color:var(--gray-400);margin-bottom:5px}
.timeline-item{padding:0 0 22px 30px;border-left:2px solid #ddd;margin-left:8px;position:relative}.timeline-item:last-child{border-left:none}
.timeline-dot{position:absolute;left:-8px;top:3px;width:14px;height:14px;background:var(--blue);border-radius:50%}.timeline-item h4{font-size:14px;margin-bottom:4px}.timeline-item p{color:var(--gray-400);font-size:12px}
.workflow{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}.workflow-step{background:var(--gray-100);padding:18px;border-radius:10px;text-align:center}
.workflow-step.complete{background:#eaf5ee;border:1px solid var(--green)}.workflow-step.active{background:var(--light-blue);border:1px solid var(--blue)}
.workflow-number{width:30px;height:30px;margin:0 auto 10px;border-radius:50%;background:#aaa;color:#fff;display:flex;justify-content:center;align-items:center}.complete .workflow-number{background:var(--green)}.active .workflow-number{background:var(--blue)}
.notification{background:#fff;border:1px solid var(--gray-200);border-radius:8px;padding:15px;margin-bottom:10px}.notification strong{color:var(--navy);display:block;margin-bottom:5px}.notification small{color:var(--gray-400)}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);align-items:center;justify-content:center;padding:20px;z-index:50}.modal-overlay.show{display:flex}
.modal{background:#fff;width:100%;max-width:620px;border-radius:14px;padding:28px}.modal h3{color:var(--navy);margin-bottom:12px}.modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
.mock-badge{position:fixed;right:14px;bottom:14px;background:var(--navy);color:#fff;font-size:11px;padding:7px 12px;border-radius:20px;opacity:.85}
@media(max-width:900px){.form-grid,.dashboard-grid,.record-details{grid-template-columns:1fr}.topbar{padding:15px;flex-direction:column;align-items:flex-start}}
`;

  const APP_JS = `
(function(){
'use strict';
var STATE_ROWS=[], NOTES=[], sel=null, role=SPEC.roles[0], seq=0;
var PIPE=SPEC.pipeline, APPROVED=SPEC.statusApproved, REJECTED=SPEC.statusRejected;
function el(id){return document.getElementById(id);}
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function statusOf(r){ if(r.stageIndex===-2) return REJECTED; if(r.stageIndex===-1) return APPROVED; return PIPE[r.stageIndex]||PIPE[0]; }
function tone(st){ if(st===APPROVED) return 'approved'; if(st===REJECTED) return 'rejected'; var i=PIPE.indexOf(st); return i>0?'review':'pending'; }
function badge(st){ return '<span class="status '+tone(st)+'">'+esc(st)+'</span>'; }
function pages(){ var p=['submit','requests','record','notifications']; if(role.canApprove) p=['dashboard','approvals','requests','record','reports','notifications']; return p; }
var LABELS={dashboard:'Dashboard',submit:SPEC.form.title||'Submit',requests:SPEC.app.entityPlural,approvals:'Approvals',record:'Details',reports:'Reports',notifications:'Notifications'};

function initRoles(){ var s=el('roleSelector'); s.innerHTML=SPEC.roles.map(function(r){return '<option value="'+r.id+'">'+esc(r.label+' — '+r.user)+'</option>';}).join('');
  s.onchange=function(){ role=SPEC.roles.find(function(r){return r.id===s.value;})||SPEC.roles[0]; buildNav(pages()[0]); show(pages()[0]); }; }
function buildNav(active){ var nav=el('navigation'); var ps=pages(); nav.innerHTML=ps.map(function(id){return '<button data-p="'+id+'" class="'+(id===active?'active':'')+'">'+esc(LABELS[id]||id)+'</button>';}).join('');
  Array.prototype.forEach.call(nav.children,function(b){ b.onclick=function(){ show(b.dataset.p); }; }); }
function show(id){ if(pages().indexOf(id)<0) id=pages()[0]; Array.prototype.forEach.call(el('navigation').children,function(b){ b.classList.toggle('active', b.dataset.p===id); });
  var m=el('main'); if(id==='dashboard') dash(m); else if(id==='submit') form(m); else if(id==='requests') table(m); else if(id==='approvals') approvals(m); else if(id==='record') record(m); else if(id==='reports') reports(m); else notifications(m); }

function visible(){ if(role.canApprove) return STATE_ROWS; return STATE_ROWS.filter(function(r){return r.submitterRole===role.id;}); }

function dash(m){ var v=visible(); var cards=SPEC.metrics.map(function(mt){ var n=mt.stage==='*'?v.length:v.filter(function(r){return statusOf(r)===mt.stage;}).length;
    var cl=mt.stage===APPROVED?'green':mt.stage===REJECTED?'red':mt.stage==='*'?'':'orange'; return '<div class="metric-card '+cl+'"><div class="metric-label">'+esc(mt.label)+'</div><div class="metric-value">'+n+'</div></div>'; }).join('');
  var bars=PIPE.concat([APPROVED]).map(function(st){ var n=v.filter(function(r){return statusOf(r)===st;}).length; var pct=v.length?Math.round(n/v.length*100):0;
    return '<div class="bar-row"><div class="bar-label"><span>'+esc(st)+'</span><strong>'+n+'</strong></div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div></div>'; }).join('');
  var steps=SPEC.workflow.map(function(w,i){ return '<div class="timeline-item"><div class="timeline-dot"></div><h4>'+esc(w.label)+'</h4><p>'+esc(w.desc)+'</p></div>'; }).join('');
  m.innerHTML='<div class="page-header"><h2>Dashboard</h2><p>Overview of '+esc(SPEC.app.entityPlural)+'.</p></div><div class="metric-grid">'+cards+'</div><div class="dashboard-grid"><div class="card"><h3 class="section-title">Status Overview</h3>'+bars+'</div><div class="card"><h3 class="section-title">Workflow</h3>'+steps+'</div></div>'; }

function fieldInput(f){ var v=f.auto? autoVal(f):'';
  if(f.type==='textarea') return '<textarea id="f_'+f.key+'" '+(f.auto?'readonly':'')+'>'+esc(v)+'</textarea>';
  if(f.type==='select') return '<select id="f_'+f.key+'"><option value="">Select…</option>'+f.options.map(function(o){return '<option>'+esc(o)+'</option>';}).join('')+'</select>';
  if(f.type==='file') return '<div class="file-box"><input type="file" id="f_'+f.key+'"></div>';
  var t=f.type==='currency'||f.type==='number'?'number':(f.type==='date'?'date':(f.type==='email'?'email':'text'));
  return '<input type="'+t+'" id="f_'+f.key+'" '+(f.auto?'readonly':'')+' value="'+esc(v)+'">'; }
function autoVal(f){ var k=f.label.toLowerCase(); if(k.indexOf('name')>=0||k.indexOf('requester')>=0||k.indexOf('employee')>=0) return role.user;
  if(k.indexOf('email')>=0) return role.user.toLowerCase().replace(/[^a-z]+/g,'.')+'@example.com'; if(k.indexOf('date')>=0) return new Date().toISOString().slice(0,10);
  if(k.indexOf('id')>=0) return '10'+(SPEC.roles.indexOf(role)+1)+'23'; if(k.indexOf('manager')>=0||k.indexOf('approver')>=0){ var a=SPEC.roles.find(function(r){return r.canApprove;}); return a?a.user:''; } return ''; }
function form(m){ var secs=SPEC.form.sections.map(function(sec){ return '<div class="card"><h3 class="section-title">'+esc(sec.title)+'</h3><div class="form-grid">'+sec.fields.map(function(f){
    return '<div class="form-group '+(f.type==='textarea'||f.type==='file'?'full-width':'')+'"><label>'+esc(f.label)+(f.required?' <span class="required">*</span>':'')+(f.auto?' <span class="auto-tag">AUTO</span>':'')+'</label>'+fieldInput(f)+(f.help?'<span class="help-text">'+esc(f.help)+'</span>':'')+'</div>'; }).join('')+'</div></div>'; }).join('');
  m.innerHTML='<div class="page-header"><h2>'+esc(SPEC.form.title)+'</h2><p>'+esc(SPEC.form.intro||'Complete and submit.')+'</p></div>'+(SPEC.form.intro?'<div class="alert alert-info">'+esc(SPEC.form.intro)+'</div>':'')+'<form id="mkForm">'+secs+'<div class="card"><h3 class="section-title">Signature</h3><div class="signature-box" id="sig">Click to Electronically Sign</div></div><div style="display:flex;justify-content:flex-end;gap:10px"><button type="button" class="btn btn-secondary" onclick="MK.reset()">Clear</button><button type="submit" class="btn btn-primary">Submit '+esc(SPEC.app.entity)+'</button></div></form>';
  var signed=false; el('sig').onclick=function(){ signed=true; el('sig').innerHTML=role.user+'<br><span style="font-family:Arial;font-size:11px;color:#777">Electronically Signed</span>'; };
  el('mkForm').onsubmit=function(e){ e.preventDefault(); if(!signed){ alert('Signature is required.'); return; }
    var vals={}, miss=false; SPEC.form.sections.forEach(function(sec){ sec.fields.forEach(function(f){ var node=el('f_'+f.key); var val=node&&node.type==='file'?(node.files[0]?node.files[0].name:''):(node?node.value:''); vals[f.key]=val; if(f.required&&!val&&f.type!=='file') miss=true; }); });
    if(miss){ alert('Please complete the required fields.'); return; }
    var id=SPEC.app.brandInitials.replace(/[^A-Za-z]/g,'').toUpperCase()+'-'+String(++seq).padStart(5,'0');
    var row={id:id, values:vals, stageIndex:0, submitter:role.user, submitterRole:role.id, history:[{title:'Submitted', desc:role.user+' submitted the '+SPEC.app.entity+'.', at:new Date().toLocaleString()}]};
    STATE_ROWS.unshift(row); sel=id; note(firstApprover(),'Approval needed', id+' is awaiting '+(PIPE[0]||'approval')+'.'); note(role.id,'Submitted', id+' was submitted.');
    alert(id+' submitted and routed to '+(PIPE[0]||'approval')+'.'); show('requests'); }; }
function firstApprover(){ var a=SPEC.roles.find(function(r){return r.canApprove;}); return a?a.id:role.id; }

function table(m){ var v=visible(); var cols=SPEC.tableColumns; var rows=v.length? v.map(function(r){ return '<tr>'+cols.map(function(c){return '<td>'+esc(r.values[c.key]||'')+'</td>';}).join('')+'<td>'+badge(statusOf(r))+'</td><td><button class="btn btn-secondary" style="padding:7px 10px" onclick="MK.view(\\''+r.id+'\\')">View</button></td></tr>'; }).join('') : '<tr><td colspan="'+(cols.length+2)+'" style="text-align:center;padding:30px">No '+esc(SPEC.app.entityPlural.toLowerCase())+' yet.</td></tr>';
  m.innerHTML='<div class="page-header"><h2>'+esc(SPEC.app.entityPlural)+'</h2><p>Track status and history.</p></div><div class="card"><div class="table-wrap"><table><thead><tr>'+cols.map(function(c){return '<th>'+esc(c.label)+'</th>';}).join('')+'<th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'; }

function approvals(m){ var pending=STATE_ROWS.filter(function(r){return r.stageIndex>=0;});
  if(!pending.length){ m.innerHTML='<div class="page-header"><h2>Approvals</h2></div><div class="card"><div class="alert alert-success">Nothing awaiting approval.</div></div>'; return; }
  var wf='<div class="workflow">'+SPEC.workflow.map(function(w,i){return '<div class="workflow-step '+(i===0?'complete':i===1?'active':'')+'"><div class="workflow-number">'+(i+1)+'</div><h4>'+esc(w.label)+'</h4><p>'+esc(w.desc)+'</p></div>';}).join('')+'</div>';
  var cards=pending.map(function(r){ return '<div class="card"><div class="record-header"><div><h3>'+esc(r.id)+'</h3><p class="help-text">By '+esc(r.submitter)+' · stage: '+esc(statusOf(r))+'</p></div>'+badge(statusOf(r))+'</div><div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-success" onclick="MK.modal(\\''+r.id+'\\',\\'approve\\')">Approve</button><button class="btn btn-danger" onclick="MK.modal(\\''+r.id+'\\',\\'reject\\')">Reject</button><button class="btn btn-secondary" onclick="MK.modal(\\''+r.id+'\\',\\'return\\')">Return</button><button class="btn btn-secondary" onclick="MK.view(\\''+r.id+'\\')">Details</button></div></div>'; }).join('');
  m.innerHTML='<div class="page-header"><h2>Approval Center</h2><p>'+esc(SPEC.app.entityPlural)+' awaiting your decision.</p></div>'+wf+cards; }

var pend=null;
function modal(id,action){ pend={id:id,action:action}; var r=byId(id);
  el('modalTitle').textContent=action==='approve'?'Approve '+SPEC.app.entity:action==='return'?'Return for Update':'Reject '+SPEC.app.entity;
  el('modalDescription').textContent=r.id+' — currently at '+statusOf(r)+'.';
  var b=el('modalActionButton'); b.textContent=action==='approve'?'Confirm Approval':action==='return'?'Confirm Return':'Confirm Rejection';
  b.className='btn '+(action==='approve'?'btn-success':action==='return'?'btn-secondary':'btn-danger'); b.onclick=processApproval; el('approvalModal').classList.add('show'); }
function closeModal(){ el('approvalModal').classList.remove('show'); el('approvalComments').value=''; pend=null; }
function processApproval(){ if(!pend) return; var r=byId(pend.id); var c=el('approvalComments').value; var at=new Date().toLocaleString();
  if(pend.action==='reject'){ r.stageIndex=-2; r.history.push({title:'Rejected',desc:role.user+' rejected the '+SPEC.app.entity+'.'+(c?' '+c:''),at:at}); note(r.submitterRole,'Rejected',r.id+' was rejected.'); }
  else if(pend.action==='return'){ r.stageIndex=0; r.history.push({title:'Returned',desc:role.user+' returned for update.'+(c?' '+c:''),at:at}); note(r.submitterRole,'Returned',r.id+' was returned for update.'); }
  else { if(r.stageIndex<PIPE.length-1){ r.stageIndex++; r.history.push({title:'Approved — '+PIPE[r.stageIndex-1],desc:role.user+' approved; routed to '+PIPE[r.stageIndex]+'.'+(c?' '+c:''),at:at}); note(r.submitterRole,'Advanced',r.id+' advanced to '+PIPE[r.stageIndex]+'.'); }
    else { r.stageIndex=-1; r.history.push({title:'Final Approval',desc:role.user+' gave final approval.'+(c?' '+c:''),at:at}); r.history.push({title:'Notification sent',desc:'Stakeholders were notified.',at:at}); note(r.submitterRole,'Approved',r.id+' was fully approved.'); } }
  closeModal(); show('approvals'); }

function record(m){ var r=byId(sel)||visible()[0]; if(!r){ m.innerHTML='<div class="page-header"><h2>Details</h2></div><div class="card"><div class="alert alert-info">No record to show.</div></div>'; return; } sel=r.id;
  var details=SPEC.tableColumns.concat([{key:'__id',label:SPEC.app.entity+' #'}]).map(function(c){ var val=c.key==='__id'?r.id:(r.values[c.key]||'—'); return '<div class="detail"><small>'+esc(c.label)+'</small><strong>'+esc(val)+'</strong></div>'; }).join('');
  var hist=r.history.map(function(h){return '<div class="timeline-item"><div class="timeline-dot"></div><h4>'+esc(h.title)+'</h4><p>'+esc(h.desc)+'</p><p style="margin-top:4px">'+esc(h.at)+'</p></div>';}).join('');
  m.innerHTML='<div class="page-header"><h2>'+esc(r.id)+'</h2><p>'+esc(SPEC.app.entity)+' record.</p></div><div class="card"><div class="record-header"><div><h2>'+esc(r.id)+'</h2></div>'+badge(statusOf(r))+'</div><div class="record-details">'+details+'</div></div><div class="card"><h3 class="section-title">History</h3>'+hist+'</div>'; }

function reports(m){ var v=visible(); var appr=v.filter(function(r){return statusOf(r)===APPROVED;}).length; var pend=v.filter(function(r){return r.stageIndex>=0;}).length;
  m.innerHTML='<div class="page-header"><h2>Reports</h2><p>Summary reporting.</p></div><div class="metric-grid"><div class="metric-card"><div class="metric-label">Total</div><div class="metric-value">'+v.length+'</div></div><div class="metric-card green"><div class="metric-label">Approved</div><div class="metric-value">'+appr+'</div></div><div class="metric-card orange"><div class="metric-label">In progress</div><div class="metric-value">'+pend+'</div></div></div><div class="card"><div class="table-wrap"><table><thead><tr><th>'+esc(SPEC.app.entity)+' #</th><th>Status</th><th>History</th></tr></thead><tbody>'+(v.map(function(r){return '<tr><td>'+esc(r.id)+'</td><td>'+badge(statusOf(r))+'</td><td>'+esc(r.history.map(function(h){return h.title;}).join(' | '))+'</td></tr>';}).join('')||'<tr><td colspan="3" style="text-align:center;padding:30px">No data.</td></tr>')+'</tbody></table></div></div>'; }

function notifications(m){ var v=NOTES.filter(function(n){return n.role===role.id;}); m.innerHTML='<div class="page-header"><h2>Notifications</h2></div>'+(v.length?v.map(function(n){return '<div class="notification"><strong>'+esc(n.title)+'</strong><div>'+esc(n.msg)+'</div><small>'+esc(n.at)+'</small></div>';}).join(''):'<div class="card"><div class="alert alert-info">No notifications.</div></div>'); }

function note(roleId,title,msg){ NOTES.unshift({role:roleId,title:title,msg:msg,at:new Date().toLocaleString()}); }
function byId(id){ return STATE_ROWS.find(function(r){return r.id===id;}); }

function loadDemo(){ SPEC.demo.forEach(function(d,i){ var id=SPEC.app.brandInitials.replace(/[^A-Za-z]/g,'').toUpperCase()+'-'+String(++seq).padStart(5,'0');
    var submitter=(SPEC.roles.find(function(r){return !r.canApprove;})||SPEC.roles[0]);
    STATE_ROWS.push({id:id,values:d.values,stageIndex:d.stageIndex,submitter:submitter.user,submitterRole:submitter.id,history:[{title:'Submitted',desc:submitter.user+' submitted the '+SPEC.app.entity+'.',at:'—'}].concat(d.stageIndex===-1?[{title:'Approved',desc:'Fully approved.',at:'—'}]:d.stageIndex===-2?[{title:'Rejected',desc:'Rejected.',at:'—'}]:[])}); }); sel=STATE_ROWS[0]&&STATE_ROWS[0].id; }

window.MK={ view:function(id){ sel=id; show('record'); }, modal:modal, reset:function(){ show('submit'); } };
window.closeModal=closeModal;
loadDemo(); initRoles(); buildNav(pages()[0]); show(pages()[0]);
})();
`;

})(typeof globalThis!=='undefined' ? globalThis : this);
