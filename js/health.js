/* ============================================================
   PROJECT HEALTH (Phase 17) — one explainable readiness score.

   Pulls from every engine (gaps, conflicts, questions, intelligence,
   document freshness) to produce requirement / traceability /
   documentation / risk metrics and a single readiness score that is
   NEVER a black box: each deduction is itemised with its reason, and
   the top issues are surfaced verbatim. Deterministic and DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  const REQ=['functional_requirement','non_functional_requirement','integration_requirement',
    'business_requirement','data_requirement','reporting_requirement'];
  function M(){ return root.Model; }
  function pct(n,d){ return d? Math.round(n/d*100):0; }

  function score(projectId){
    const model=M(); if(!model||!model.getProject(projectId)) return null;
    const objs=model.listObjects(projectId);
    const reqs=objs.filter(o=>REQ.includes(o.type));
    const gaps = root.Gaps ? root.Gaps.detectGaps(projectId) : {all:[],summary:{}};
    const conflicts = root.Conflicts ? root.Conflicts.detectConflicts(projectId) : {items:[]};
    const questions = root.Questions ? root.Questions.generateQuestions(projectId) : [];
    const intel = root.Intelligence ? root.Intelligence.assessProject(projectId) : {aggregate:{untestable:0,ambiguous:0}};
    const fresh = root.Impact ? root.Impact.documentFreshness(projectId) : {byStatus:{},needsReview:[],total:0};

    const hasTest = o => model.relationshipsOf(projectId,o.id).downstream.some(e=>e.type==='tested_by');
    const noTest = reqs.filter(o=>!hasTest(o));
    const withSource = reqs.filter(o=>(o.evidence||[]).length>0);
    const orphans = gaps.all.filter(g=>g.type==='orphan_requirement').length;
    const conflictObjIds = new Set(); conflicts.items.forEach(c=>c.sources.forEach(id=>conflictObjIds.add(id)));
    const hiQ = questions.filter(q=>q.priority>=70).length;
    const needsReview = (fresh.needsReview||[]).length;
    const openQ = objs.filter(o=>o.type==='open_question').length;
    const unapprovedAssumptions = objs.filter(o=>o.type==='assumption' && o.status!=='approved').length;

    const objectives = objs.filter(o=>o.type==='business_objective');
    const objectivesWithReqs = objectives.filter(ob=>model.relationshipsOf(projectId,ob.id).downstream.some(e=>{ const to=model.getObject(projectId,e.to); return to&&REQ.includes(to.type); })).length;

    const metrics = {
      requirements: { total:reqs.length,
        draft:reqs.filter(o=>o.status==='draft').length,
        approved:reqs.filter(o=>o.status==='approved').length,
        untestable:intel.aggregate.untestable||0,
        ambiguous:intel.aggregate.ambiguous||0,
        conflicting:reqs.filter(o=>conflictObjIds.has(o.id)).length,
        orphaned:orphans },
      traceability: {
        reqsWithTests:reqs.length-noTest.length, reqsWithTestsPct:pct(reqs.length-noTest.length,reqs.length),
        reqsWithSource:withSource.length, reqsWithSourcePct:pct(withSource.length,reqs.length),
        objectivesWithReqs, objectivesTotal:objectives.length, objectivesPct:pct(objectivesWithReqs,objectives.length) },
      documentation: { total:fresh.total, byStatus:fresh.byStatus||{}, needsReview,
        missing: root.Factory ? root.Factory.availableTypes().filter(t=>!model.listObjects(projectId,'generated_document').some(d=>d.attrs&&d.attrs.docType===t.id)).map(t=>t.label) : [] },
      risks: { openRisks:objs.filter(o=>o.type==='risk').length, unresolvedConflicts:conflicts.items.length,
        unapprovedAssumptions, openQuestions:openQ, highPriorityQuestions:hiQ }
    };

    // explainable deductions
    const ded=[]; const cut=(pts,reason)=>{ if(pts>0) ded.push({points:pts, reason}); };
    cut(Math.min(20,(intel.aggregate.untestable||0)*4), `${intel.aggregate.untestable||0} requirement(s) are not testable`);
    cut(Math.min(20,noTest.length*3), `${noTest.length} requirement(s) have no test coverage`);
    cut(Math.min(20,conflicts.items.length*7), `${conflicts.items.length} unresolved conflict(s)`);
    cut(Math.min(15,hiQ*3), `${hiQ} high-priority open question(s)`);
    cut(Math.min(10,needsReview*5), `${needsReview} document(s) need review (sources changed)`);
    cut(Math.min(10,orphans*3), `${orphans} orphaned requirement(s)`);
    const readiness=Math.max(0, 100 - ded.reduce((a,d)=>a+d.points,0));
    const primaryIssues = ded.slice().sort((a,b)=>b.points-a.points).map(d=>d.reason);

    return { readiness, dimensions:{
        requirementsQuality: intel.aggregate.avgQuality!=null?intel.aggregate.avgQuality:100,
        testCoverage: metrics.traceability.reqsWithTestsPct,
        traceability: metrics.traceability.objectivesPct,
        documentFreshness: fresh.total? pct(fresh.total-needsReview, fresh.total):100,
        conflictFree: reqs.length? pct(reqs.length-metrics.requirements.conflicting, reqs.length):100
      }, metrics, primaryIssues, deductions:ded,
      counts:{ objects:objs.length, requirements:reqs.length, gaps:gaps.all.length, conflicts:conflicts.items.length, questions:questions.length } };
  }

  const Health = { score };
  root.Health = Health;
  if(typeof module!=='undefined' && module.exports) module.exports = Health;
})(typeof globalThis!=='undefined' ? globalThis : this);
