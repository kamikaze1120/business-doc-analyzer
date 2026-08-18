/* ============================================================
   REQUIREMENT INTELLIGENCE ENGINE (Phase 4).

   Evaluates each requirement for clarity, completeness, testability,
   atomicity, ambiguity, and measurability. It does NOT merely flag
   vague keywords — for each weak term it explains WHAT information is
   missing and WHICH clarifying questions would close the gap. Runs over
   Project Truth Model objects. Deterministic and DOM-free; the AI layer
   (when present) can extend this, but the core reasoning stands alone.
   ============================================================ */
;(function(root){
  'use strict';

  // Vague terms → the specific dimensions they leave undefined, and the
  // question that would pin them down. This is the "explain, don't just flag".
  const VAGUE = [
    {re:/\bsecure(?:ly)?\b|\bsecurity\b/i, dims:['authentication','authorization / roles','encryption','audit logging','session management','compliance'], q:'Which authentication, authorization, encryption, audit-logging and compliance requirements define "secure" here?'},
    {re:/\bfast\b|\bquick(?:ly)?\b|\bresponsive\b|\bperformant\b|\bhigh[- ]performance\b/i, dims:['response-time threshold','load / concurrency','measurement method'], q:'What is the maximum acceptable response time, and at what concurrency/load?'},
    {re:/\buser[- ]friendly\b|\beasy\b|\bintuitive\b|\bsimple\b|\bseamless\b/i, dims:['measurable usability target','task success / time','accessibility standard'], q:'How will usability be measured (task time, success rate, WCAG level)?'},
    {re:/\brobust\b|\breliable\b|\bstable\b|\bhighly available\b/i, dims:['availability / uptime target','failure handling','recovery time'], q:'What uptime target and failure/recovery behaviour is required?'},
    {re:/\bscalab(?:le|ility)\b/i, dims:['target scale','growth horizon','degradation limits'], q:'To what scale must it grow, by when, and within what performance limits?'},
    {re:/\befficient(?:ly)?\b/i, dims:['resource limit','throughput target'], q:'What throughput or resource limit defines "efficient"?'},
    {re:/\bappropriate(?:ly)?\b|\badequate\b|\bsufficient\b|\breasonable\b|\bacceptable\b|\bproper(?:ly)?\b/i, dims:['explicit measurable criterion'], q:'What is the explicit, measurable criterion (rather than "appropriate")?'},
    {re:/\bas needed\b|\bwhen necessary\b|\bwhere applicable\b|\bas appropriate\b|\bas required\b|\betc\.?\b/i, dims:['enumerated conditions'], q:'Which specific cases/conditions are included? Enumerate them explicitly.'},
    {re:/\bflexible\b|\bconfigurable\b|\bcustomizable\b/i, dims:['what is configurable','by which role','limits'], q:'What exactly is configurable, by whom, and within what limits?'},
    {re:/\breal[- ]?time\b/i, dims:['latency budget'], q:'What is the maximum acceptable latency for "real time"?'},
    {re:/\b(?:many|several|various|multiple|some|a few|numerous)\b/i, dims:['exact count or range'], q:'Exactly how many? Give a number or range instead of "several/multiple".'},
    {re:/\bmodern\b|\bstate[- ]of[- ]the[- ]art\b|\bbest[- ]practice\b|\bindustry[- ]standard\b/i, dims:['concrete standard / version'], q:'Which concrete standard, version, or benchmark is meant?'}
  ];

  const MODAL = /\b(shall|must|should|will|is required to|are required to|needs? to|has to|may)\b/i;
  const ACTION = /\b(allow|enable|provide|support|display|generate|validate|calculate|send|store|route|approve|reject|notify|export|import|log|prevent|restrict|require|create|update|delete|submit|assign|verify|authenticate|authorize|encrypt|record|track|integrate|synchron|retrieve|search|filter|schedule|trigger|escalate|archive|render|process)\w*/i;
  const QUANTITY = /\b\d+(?:\.\d+)?\s*(%|percent|seconds?|minutes?|hours?|days?|ms|mb|gb|kb|tb|users?|records?|concurrent|requests?|transactions?)\b|\b(within|under|less than|no more than|at least|at most|exceeds?|greater than|up to)\s+\d/i;
  const CONDITION = /\b(if|when|unless|where|whenever|provided that|in case|once|after|before|only if)\b/i;

  function txt(o){ return (o && (o.description||o.title)) || String(o||''); }
  function isNFR(o){ return (o && o.type)==='non_functional_requirement' || /nfr/i.test((o&&o.attrs&&o.attrs.category)||''); }

  function findVague(text){
    const out=[];
    VAGUE.forEach(v=>{ if(v.re.test(text)) out.push({term:(text.match(v.re)||[''])[0], reason:'Leaves undefined: '+v.dims.join(', ')+'.', dims:v.dims, question:v.q}); });
    return out;
  }
  function atomicityIssues(text){
    const clauses = (text.match(/\b(shall|must|should|will)\b/gi)||[]).length;
    const conj = (text.match(/\b(?:and|as well as|;|,\s*and)\b/gi)||[]).length;
    const lists = /(?:^|\s)(?:\d+\)|[-•])\s/.test(text);
    const multi = clauses>1 || conj>=2 || lists;
    return { multi, clauses, conj, lists };
  }

  function assess(objOrText){
    const o = (objOrText && typeof objOrText==='object' && ('description' in objOrText||'title' in objOrText)) ? objOrText : {description:String(objOrText)};
    const text = txt(o).trim();
    const nfr = isNFR(o);
    const vague = findVague(text);
    const hasModal = MODAL.test(text);
    const hasAction = ACTION.test(text);
    const hasQuantity = QUANTITY.test(text);
    const hasCondition = CONDITION.test(text);
    const atom = atomicityIssues(text);
    const words = text.split(/\s+/).filter(Boolean).length;

    // component completeness
    const components = { modal:hasModal, action:hasAction, object: /\b(the|a|an)\s+\w+/i.test(text)||words>=6, measure: hasQuantity };
    const missing=[];
    if(!hasAction) missing.push('a concrete action verb (what the system does)');
    if(!hasModal) missing.push('an obligation word (shall/must)');
    if(nfr && !hasQuantity) missing.push('a measurable threshold (NFRs must be quantified)');

    // sub-scores 0..100
    let ambiguity = Math.max(0, 100 - vague.length*28);
    let measurability = hasQuantity ? 100 : (nfr ? 30 : 70);
    let testability = 100;
    if(!hasAction) testability -= 45; if(!hasModal) testability -= 15;
    if(vague.length) testability -= Math.min(40, vague.length*15);
    if(nfr && !hasQuantity) testability -= 25;
    testability = Math.max(0, testability);
    let atomicity = atom.multi ? Math.max(30, 100 - (atom.clauses>1?30:0) - (atom.conj>=2?20:0) - (atom.lists?20:0)) : 100;
    let completeness = 100;
    if(!hasAction) completeness -= 30; if(!components.object) completeness -= 15;
    if(nfr && !hasQuantity) completeness -= 25; if(vague.length) completeness -= Math.min(25, vague.length*12);
    completeness = Math.max(0, completeness);
    let clarity = Math.round(ambiguity*0.5 + atomicity*0.3 + (words>45?60:100)*0.2);
    const overall = Math.round((clarity + completeness + testability + atomicity + ambiguity + (nfr?measurability:100))/6);

    const remediation=[];
    vague.forEach(v=>remediation.push(v.question));
    if(nfr && !hasQuantity) remediation.push('Add a measurable threshold (e.g. "within 2 seconds for 500 concurrent users").');
    if(atom.multi) remediation.push('Split into separate atomic requirements — each stating one testable behaviour.');
    if(!hasAction) remediation.push('Restate as "<actor> shall <verb> <object> [when <condition>] [within <measure>]".');

    return {
      scores:{ clarity, completeness, testability, atomicity, ambiguity, measurability, overall },
      testable: testability>=60 && hasAction,
      vague: vague.length>0,
      findings: vague,
      missing,
      remediation: [...new Set(remediation)],
      components
    };
  }

  const REQUIREMENTY = ['functional_requirement','non_functional_requirement','integration_requirement',
    'business_requirement','data_requirement','reporting_requirement','business_rule'];

  function assessProject(projectId, opts){
    opts=opts||{}; const M=root.Model; if(!M) return {items:[], aggregate:{count:0}};
    const items=[]; let sum=0, untestable=0, ambiguous=0;
    M.listObjects(projectId).filter(o=>REQUIREMENTY.includes(o.type)).forEach(o=>{
      const a=assess(o); sum+=a.scores.overall; if(!a.testable) untestable++; if(a.vague) ambiguous++;
      if(opts.writeBack){ o.attrs=o.attrs||{}; o.attrs.analysis={scores:a.scores, testable:a.testable, vague:a.vague, updatedAt:new Date().toISOString()}; }
      items.push({ id:o.id, displayId:o.displayId, type:o.type, title:o.title, scores:a.scores,
        testable:a.testable, vague:a.vague, findings:a.findings, missing:a.missing, remediation:a.remediation });
    });
    if(opts.writeBack){ const p=M.getProject(projectId); if(p) M.saveProject(p); }
    return { items, aggregate:{ count:items.length, avgQuality: items.length?Math.round(sum/items.length):0,
      untestable, ambiguous } };
  }

  const Intelligence = { assess, assessProject, findVague, REQUIREMENTY, VAGUE };
  root.Intelligence = Intelligence;
  if(typeof module!=='undefined' && module.exports) module.exports = Intelligence;
})(typeof globalThis!=='undefined' ? globalThis : this);
