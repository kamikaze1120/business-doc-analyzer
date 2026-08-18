/* ============================================================
   AUTONOMOUS BUSINESS ANALYST WORKFLOW (Phase 11).

   Orchestrates the specialized agents over the Truth Model in the order
   a good BA would work: Discovery → Initialize → Knowledge Analysis →
   Clarification → Requirement Discovery → Test Design → Validation →
   Document Generation → Review. It does NOT jump straight to writing a
   BRD, and it never auto-approves: every proposal stays 'ai_proposed'
   for a human to Accept/Edit/Reject. DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  const STEPS=['Discovery','Initialize','Knowledge analysis','Clarification','Requirement discovery',
    'Test design','Validation','Document generation','Review'];
  function M(){ return root.Model; }

  // Step 1-2: create a project from a problem statement and run discovery.
  async function startProject(problemStatement, name){
    if(!root.Model||!root.Agents) throw new Error('model/agents not loaded');
    const p=M().createProject({ name:name||(String(problemStatement||'New project').slice(0,60)),
      meta:{project:name||String(problemStatement||'').slice(0,60), createdFrom:'workflow'} });
    const disc=await root.Agents.discovery(p.id, problemStatement);
    return { projectId:p.id, discovered:disc.created, source:disc.source };
  }

  // Step 3: what do we know vs. still need to find out?
  function knowledgeAnalysis(projectId){
    const c = M().counts(projectId);
    const known={ objectives:c.business_objective||0, stakeholders:c.stakeholder||0, systems:c.system||0,
      requirements:(c.functional_requirement||0)+(c.non_functional_requirement||0)+(c.integration_requirement||0)+(c.business_requirement||0),
      risks:c.risk||0, processes:c.process||0 };
    const unknown=[];
    if(!known.objectives) unknown.push('No business objective captured');
    if(!known.stakeholders) unknown.push('No stakeholders identified');
    if(!known.requirements) unknown.push('No requirements yet');
    if(!known.processes) unknown.push('No process modelled');
    return { known, unknown };
  }

  // Steps 4-9: run the agent pipeline (proposals only) and return a review.
  async function run(projectId, opts){
    opts=opts||{}; const A=root.Agents; const out={ steps:{} };
    out.steps.requirementDiscovery = await A.requirements(projectId);
    out.steps.testDesign = await A.testDesigner(projectId);
    out.steps.conflicts = A.conflictAnalyst(projectId);
    const q=A.qualityReviewer(projectId); out.steps.quality = q ? {avgQuality:q.aggregate.avgQuality, untestable:q.aggregate.untestable} : null;
    if(A.qualityRewrites) out.steps.rewrites = await A.qualityRewrites(projectId);
    if(opts.generateDocuments) out.steps.documents = (A.documentGenerator(projectId, opts.documentTypes)||[]).map(d=>d.title);
    out.review = review(projectId);
    out.proposed = M().listObjects(projectId).filter(o=>o.status==='ai_proposed').length;
    out.aiUsed = (typeof AI!=='undefined' && AI.available) || false;
    return out;
  }

  function review(projectId){
    const h = root.Health ? root.Health.score(projectId) : null;
    return h ? { readiness:h.readiness, primaryIssues:h.primaryIssues, metrics:h.metrics } : null;
  }

  // Accept / reject a proposal (bulk-friendly).
  function accept(projectId, id, by){ return M().setStatus(projectId, id, 'under_review', by); }
  function reject(projectId, id, by){ return M().setStatus(projectId, id, 'rejected', by); }
  function acceptAll(projectId, by){ let n=0;
    M().listObjects(projectId).filter(o=>o.status==='ai_proposed').forEach(o=>{ M().setStatus(projectId,o.id,'under_review',by); n++; }); return n; }

  const Workflow = { STEPS, startProject, knowledgeAnalysis, run, review, accept, reject, acceptAll };
  root.Workflow = Workflow;
  if(typeof module!=='undefined' && module.exports) module.exports = Workflow;
})(typeof globalThis!=='undefined' ? globalThis : this);
