/* ============================================================
   BRAIN CLIENT — turns the current analysis (STATE) into a vault
   payload and hands it to the browser Store (js/store.js), which
   persists everything locally. No server, no network.
   ============================================================ */

/* Named systems / integrations the document touches — lexicon hits plus
   proper-noun phrases inside integration-category requirements. */
const SYSTEM_LEXICON = /\b(salesforce|sap|oracle|mulesoft|laserfiche|jd ?edwards|jde|workday|servicenow|sharepoint|dynamics\s*365|dynamics|active directory|azure ad|okta|ping|docusign|tyler|munis|accela|cityworks|arcgis|esri|power ?bi|tableau|snowflake|databricks|stripe|twilio|sendgrid|sso|saml|oauth|ldap|rest api|soap|graphql|kafka|mq|edi)\b/i;
function extractSystems(s){
  const found = new Map();  // lower -> display
  const addLex = txt => { let m; const re=new RegExp(SYSTEM_LEXICON.source,'gi');
    while((m=re.exec(txt))){ const d=m[0].replace(/\s+/g,' ').trim(); found.set(d.toLowerCase(), tidySystem(d)); } };
  // lexicon across the whole document text we have (requirements carry most of it)
  s.reqs.forEach(r=>addLex(r.text));
  // proper-noun phrases within integration requirements
  s.reqs.filter(r=>r.cat==='INT').forEach(r=>{
    (r.text.match(/\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2}\b/g)||[]).forEach(ph=>{
      const p=ph.trim();
      if(p.length<3||p.length>40) return;
      if(/^(The|This|That|System|Platform|API|User|Service|Data|Report|When|If)$/i.test(p)) return;
      if(!found.has(p.toLowerCase())) found.set(p.toLowerCase(), p);
    });
  });
  return [...found.values()].slice(0,20);
}
function tidySystem(d){
  const map={mulesoft:'MuleSoft',salesforce:'Salesforce',servicenow:'ServiceNow',sharepoint:'SharePoint',
    laserfiche:'Laserfiche',workday:'Workday',sso:'SSO',saml:'SAML',oauth:'OAuth','power bi':'Power BI',
    'active directory':'Active Directory','azure ad':'Azure AD'};
  return map[d.toLowerCase()] || d.replace(/\b\w/g,c=>c.toUpperCase());
}

/* Generic, non-specific "actors" that pollute a cross-document brain. */
const ACTOR_DENY=/^(system|platform|service|application|app|api|integration|interface|scheduler|job|user|users|data|record|report|process|various|appropriate|relevant|other)$/i;
function cleanActors(actors){
  return (actors||[]).filter(a=>{
    const w=a.trim();
    return w.length>=3 && w.length<=24 && w.split(/\s+/).length<=2 && !ACTOR_DENY.test(w) && !/\bproject\b|\buse\b|\bapproach\b/i.test(w);
  });
}
/* Only keep metrics whose name is a real label, not a run-on sentence. */
function cleanMetrics(metrics){
  return (metrics||[]).filter(m=>m.name && m.name.length<=60 && m.name.split(/\s+/).length<=8 && !/[.;]/.test(m.name));
}

/* Build the ingest payload from the current STATE. The brain stores a CURATED
   set of entities (clean actors/metrics), not every raw extraction. */
function brainPayload(){
  const s=STATE, el=s.el;
  return {
    doc:{ title:s.meta.title || s.fileName, fileName:s.fileName, type:s.docType.id,
          typeName:s.docType.name, confidence:s.docType.confidence, words:s.words, sections:s.sections.length },
    entities:{
      objectives: el.objectives, stakeholders: el.stakeholders, actors: cleanActors(s.actors),
      systems: extractSystems(s), scopeIn: el.scopeIn, scopeOut: el.scopeOut,
      milestones: el.milestones, risks: el.risks, metrics: cleanMetrics(el.metrics),
      personas: el.personas, features: el.features, stories: el.stories,
      requirements: s.reqs.map(r=>({id:r.id, cat:r.cat, priority:r.priority, text:r.text})),
      questions: el.questions
    }
  };
}

/* Brain lives in the browser (Store) — no server required. */
async function brainIngest(){ return Store.ingest(brainPayload()); }
async function brainIndex(){ return Store.index(); }
async function brainNote(id, type){ return Store.note(id, type); }
