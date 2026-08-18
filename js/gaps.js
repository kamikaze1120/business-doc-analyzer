/* ============================================================
   GAP DETECTION ENGINE (audit Phase 6/11) — a RULE REGISTRY over the
   Truth Model.

   Each rule is a declarative record: id, name, appliesTo (object types),
   layer, severity, an optional `scope` aspect, a detect() predicate, a
   message, and a recommendedAction. detectGaps() walks the registry so
   rules are inspectable and extensible instead of hardcoded inline.

   SCOPE AWARENESS: a project may declare aspects out of scope
   (project.meta.scope = {testing:false, ...}); rules tagged with that
   aspect are then suppressed, so a project that explicitly excludes test
   documentation is not penalized for missing test cases.

   Deterministic, DOM-free. Gap `type` strings are preserved exactly so the
   clarification engine and UI keep working.
   ============================================================ */
;(function(root){
  'use strict';
  const REQ = ['functional_requirement','non_functional_requirement','integration_requirement',
    'business_requirement','data_requirement','reporting_requirement'];
  const QUAL = REQ.concat(['business_rule']);   // types the intelligence engine scores

  function M(){ return root.Model; }

  // Which analysis aspects are in scope for a project (default: everything).
  function scopeFlags(project){
    const s=(project && project.meta && project.meta.scope) || {};
    return { testing:s.testing!==false, acceptance_criteria:s.acceptance_criteria!==false,
      integration:s.integration!==false, process:s.process!==false, documentation:s.documentation!==false };
  }

  function reqsForObjective(ctx, objId){
    if(root.Relationships) return root.Relationships.requirementsForObjective(ctx.projectId, objId);
    const p=ctx.model.getProject(ctx.projectId); const out=[];
    (p&&p.relationships||[]).forEach(r=>{ if(r.type!=='implements') return;
      const other=r.from===objId?r.to:(r.to===objId?r.from:null);
      if(other){ const o=p.objects[other]; if(o && REQ.indexOf(o.type)>=0) out.push(o); } });
    return out;
  }
  function trim(s){ s=String(s||''); return s.length>50?s.slice(0,47)+'…':s; }

  /* ---- the rule registry ---- */
  const RULES = [
    { id:'duplicate_display_id', name:'Duplicate display id', appliesTo:null, layer:'structural', severity:'high',
      detect:(o,ctx)=> o.displayId && ctx.displayDup.has(o.displayId),
      message:o=>`Duplicate display id ${o.displayId}`, recommendation:'Regenerate display ids so each is unique.' },
    { id:'orphan_requirement', name:'Orphaned requirement', appliesTo:REQ, layer:'structural', severity:'medium',
      detect:(o,ctx)=>{ const r=ctx.rels(o.id); return r.upstream.length===0 && r.downstream.length===0; },
      message:o=>`${o.displayId} is orphaned — not linked to any objective, rule, or test`, recommendation:'Link it to a business objective and add test coverage.' },
    { id:'no_test_coverage', name:'Requirement without test coverage', appliesTo:REQ, layer:'structural', severity:'high', scope:'testing',
      detect:(o,ctx)=> !ctx.hasEdge(o.id,'tested_by','down'),
      message:o=>`${o.displayId} has no test coverage`, recommendation:'Generate at least one test case that verifies it.' },
    { id:'missing_priority', name:'Requirement without priority', appliesTo:REQ, layer:'structural', severity:'low',
      detect:(o)=> !o.priority, message:o=>`${o.displayId} has no priority`, recommendation:'Assign a priority (High/Medium/Low).' },
    { id:'no_source', name:'Requirement without source', appliesTo:REQ, layer:'structural', severity:'medium',
      detect:(o)=> (o.evidence||[]).length===0, message:o=>`${o.displayId} has no recorded source`, recommendation:'Attach evidence (which document/statement it came from).' },
    { id:'test_without_requirement', name:'Test without requirement', appliesTo:['test_case'], layer:'structural', severity:'medium', scope:'testing',
      detect:(o,ctx)=> !ctx.rels(o.id).upstream.some(e=>e.type==='tested_by'),
      message:o=>`${o.displayId} is not linked to any requirement`, recommendation:'Link the test to the requirement it verifies, or remove it.' },
    { id:'ac_without_test', name:'Acceptance criterion without test', appliesTo:['acceptance_criteria'], layer:'structural', severity:'medium', scope:'testing',
      detect:(o,ctx)=> !ctx.hasEdge(o.id,'tested_by','down'), message:o=>`${o.displayId} has no test`, recommendation:'Add a test case for this acceptance criterion.' },
    { id:'objective_without_requirement', name:'Objective without supporting requirement', appliesTo:['business_objective'], layer:'cross-artifact', severity:'high',
      detect:(o,ctx)=> reqsForObjective(ctx,o.id).length===0,
      message:o=>`Objective "${trim(o.title)}" has no supporting requirements`, recommendation:'Add or link the requirements that deliver this objective.' },
    { id:'requirement_without_acceptance', name:'Requirement without acceptance criteria', appliesTo:REQ, layer:'cross-artifact', severity:'low', scope:'acceptance_criteria',
      detect:(o,ctx)=> !ctx.hasEdge(o.id,'validated_by','down') && !ctx.hasEdge(o.id,'satisfies','up'),
      message:o=>`${o.displayId} has no acceptance criteria / validating scenario`, recommendation:'Define acceptance criteria so it can be objectively accepted.' },
    { id:'system_without_integration', name:'System without integration', appliesTo:['system'], layer:'cross-artifact', severity:'low', scope:'integration',
      detect:(o,ctx)=>{ const r=ctx.rels(o.id); return !r.upstream.concat(r.downstream).some(e=>{ const other=ctx.model.getObject(ctx.projectId,e.from===o.id?e.to:e.from); return other && (other.type==='integration'||other.type==='integration_requirement'||other.type==='api'); }); },
      message:o=>`System "${trim(o.title)}" is referenced but has no integration definition`, recommendation:'Define how this system integrates (interface/API/failure handling).' },
    { id:'step_without_actor', name:'Process step without actor', appliesTo:['process_step'], layer:'cross-artifact', severity:'medium', scope:'process',
      detect:(o,ctx)=> !(o.attrs&&o.attrs.actor) && !ctx.hasEdge(o.id,'owns','up'),
      message:o=>`Process step "${trim(o.title)}" has no responsible actor`, recommendation:'Assign the actor/role that performs this step.' },
    { id:'not_testable', name:'Requirement not testable', appliesTo:QUAL, layer:'semantic', severity:'high',
      detect:(o,ctx)=>{ const q=ctx.quality[o.id]; return q && !q.testable; },
      message:(o,ctx)=>`${o.displayId} is not testable as written`, recommendation:(o,ctx)=>{ const q=ctx.quality[o.id]; return (q&&q.remediation&&q.remediation[0])||'Restate with a concrete, observable action.'; } },
    { id:'ambiguous', name:'Requirement is ambiguous', appliesTo:QUAL, layer:'semantic', severity:'medium',
      detect:(o,ctx)=>{ const q=ctx.quality[o.id]; return q && q.testable && q.vague; },
      message:o=>`${o.displayId} contains vague language`, recommendation:(o,ctx)=>{ const q=ctx.quality[o.id]; return (q&&q.remediation&&q.remediation[0])||'Replace vague terms with measurable criteria.'; } },
    { id:'low_quality', name:'Requirement scores low on quality', appliesTo:QUAL, layer:'semantic', severity:'low',
      detect:(o,ctx)=>{ const q=ctx.quality[o.id]; return q && q.testable && !q.vague && q.scores.overall<60; },
      message:(o,ctx)=>`${o.displayId} scores low on quality (${ctx.quality[o.id].scores.overall})`, recommendation:'Tighten clarity, completeness, and measurability.' }
  ];

  function detectGaps(projectId){
    const model=M(); const project=model && model.getProject(projectId);
    if(!project) return {structural:[],semantic:[],crossArtifact:[],all:[],summary:{total:0}};
    const objs=model.listObjects(projectId);
    const scope=scopeFlags(project);
    // shared context
    const displayCount={}; objs.forEach(o=>{ if(o.displayId) displayCount[o.displayId]=(displayCount[o.displayId]||0)+1; });
    const displayDup=new Set(Object.keys(displayCount).filter(k=>displayCount[k]>1));
    const quality={};
    if(root.Intelligence){ root.Intelligence.assessProject(projectId).items.forEach(it=>{ quality[it.id]=it; }); }
    const ctx={ projectId, model, objs, scope, displayDup, quality,
      rels:id=>model.relationshipsOf(projectId,id),
      hasEdge:(id,type,dir)=>{ const r=model.relationshipsOf(projectId,id); const set=dir==='up'?r.upstream:dir==='down'?r.downstream:r.upstream.concat(r.downstream); return set.some(e=>e.type===type); } };

    const structural=[], semantic=[], crossArtifact=[]; let seq=0;
    const bucketFor=layer=> layer==='structural'?structural : layer==='semantic'?semantic : crossArtifact;
    const val=(x,o)=> typeof x==='function'?x(o,ctx):x;

    RULES.forEach(rule=>{
      if(rule.scope && !scope[rule.scope]) return;   // out of scope → suppressed
      const targets = rule.appliesTo===null ? objs : objs.filter(o=>rule.appliesTo.indexOf(o.type)>=0);
      targets.forEach(o=>{
        let hit=false; try{ hit=rule.detect(o,ctx); }catch(e){ hit=false; }
        if(!hit) return;
        bucketFor(rule.layer).push({ id:'gap'+(++seq), rule:rule.id, layer:rule.layer, severity:rule.severity,
          type:rule.id, message:val(rule.message,o), objectId:o.id||null, recommendation:val(rule.recommendation,o) });
      });
    });

    const all=structural.concat(semantic,crossArtifact);
    const bySev={high:0,medium:0,low:0}; all.forEach(x=>bySev[x.severity]=(bySev[x.severity]||0)+1);
    return { structural, semantic, crossArtifact, all,
      summary:{ total:all.length, structural:structural.length, semantic:semantic.length, crossArtifact:crossArtifact.length, bySeverity:bySev, scope } };
  }

  const Gaps = { detectGaps, RULES, scopeFlags };
  root.Gaps = Gaps;
  if(typeof module!=='undefined' && module.exports) module.exports = Gaps;
})(typeof globalThis!=='undefined' ? globalThis : this);
