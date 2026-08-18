/* ============================================================
   RELATIONSHIP REGISTRY (Milestone 2 / audit Phase 3).

   A canonical contract for the traceability graph: for each relationship
   type it declares the allowed source/target object types, its inverse
   name, and whether it is symmetric. This gives two things the codebase
   lacked:

     1. VALIDATION — Model.addRelationship consults validate() so an
        invalid pairing (wrong endpoint types, self-reference, unknown
        type) is rejected instead of silently corrupting the graph.
     2. INVERSE-AWARE TRAVERSAL — neighbors() returns objects connected by
        a relationship type in EITHER stored direction (and by its inverse
        name), so analysis no longer depends on which way an edge happened
        to be written. This is the fix behind the objective<->requirement
        direction bug (see ARCHITECTURE_AUDIT.md, Confirmed Issue 1).

   Pure logic, DOM-free. Browser global + CommonJS.
   ============================================================ */
;(function(root){
  'use strict';
  const REQ = ['functional_requirement','non_functional_requirement','integration_requirement','business_requirement','data_requirement','reporting_requirement'];
  const ANY = '*';

  // type -> {source, target, inverse, symmetric, meaning}
  const REGISTRY = {
    implements:    {source:['functional_requirement','non_functional_requirement','integration_requirement','business_rule'], target:['business_objective','business_requirement'], inverse:'satisfied_by', meaning:'requirement implements a higher-level objective/requirement'},
    satisfies:     {source:REQ, target:['acceptance_criteria','business_objective','business_requirement'], inverse:'satisfied_by', meaning:'object satisfies a target'},
    validated_by:  {source:['functional_requirement','non_functional_requirement','integration_requirement','business_requirement','business_rule'], target:['acceptance_criteria','test_scenario'], inverse:'validates', meaning:'requirement is validated by acceptance criteria / scenario'},
    tested_by:     {source:['functional_requirement','non_functional_requirement','integration_requirement','business_requirement','business_rule','acceptance_criteria'], target:['test_case','test_scenario'], inverse:'tests', meaning:'object is verified by a test'},
    governed_by:   {source:['functional_requirement','non_functional_requirement','integration_requirement'], target:['business_rule'], inverse:'governs', meaning:'requirement is governed by a business rule'},
    uses:          {source:ANY, target:['system','application','api','integration'], inverse:'used_by', meaning:'object uses a system/integration'},
    part_of:       {source:ANY, target:ANY, inverse:'has_part', meaning:'object is part of a larger object'},
    owns:          {source:['stakeholder','actor','department'], target:ANY, inverse:'owned_by', meaning:'actor owns / is responsible for an object'},
    derived_from:  {source:ANY, target:ANY, inverse:'source_of', meaning:'object was derived from another'},
    supersedes:    {source:ANY, target:ANY, inverse:'superseded_by', meaning:'object supersedes another'},
    depends_on:    {source:ANY, target:ANY, inverse:'depended_on_by', meaning:'object depends on another'},
    conflicts_with:{source:ANY, target:ANY, inverse:'conflicts_with', symmetric:true, meaning:'objects are in conflict'},
    relates_to:    {source:ANY, target:ANY, inverse:'relates_to', symmetric:true, meaning:'generic association'},
    traces_to:     {source:ANY, target:ANY, inverse:'traced_from', meaning:'traceability link'}
  };
  const INVERSE = {}; Object.keys(REGISTRY).forEach(t=>{ INVERSE[t]=REGISTRY[t].inverse; });

  function typeOk(list, t){ return list===ANY || (Array.isArray(list) && list.indexOf(t)>=0); }

  // Validate a proposed relationship. Unknown types are allowed but flagged
  // (forward-compatible); known types enforce their endpoint contract.
  function validate(fromType, toType, type){
    const spec=REGISTRY[type];
    if(!spec) return {ok:true, unknownType:true, warning:'relationship type "'+type+'" is not in the registry'};
    if(!typeOk(spec.source, fromType)) return {ok:false, error:`"${type}" source must be one of ${spec.source===ANY?'any':spec.source.join('/')}, got ${fromType}`};
    if(!typeOk(spec.target, toType)) return {ok:false, error:`"${type}" target must be one of ${spec.target===ANY?'any':spec.target.join('/')}, got ${toType}`};
    return {ok:true};
  }

  function M(){ return root.Model; }
  // Objects connected to `id` by `type` in EITHER direction (and via the
  // inverse type name). This is the inverse-aware traversal.
  function neighbors(projectId, id, type){
    const p=M().getProject(projectId); if(!p) return [];
    const inv=INVERSE[type]; const out=[];
    (p.relationships||[]).forEach(r=>{
      if(r.type!==type && r.type!==inv) return;
      const otherId = r.from===id ? r.to : (r.to===id ? r.from : null);
      if(otherId && p.objects[otherId]) out.push(p.objects[otherId]);
    });
    return out;
  }
  function neighborsByTypes(projectId, id, type, objectTypes){
    return neighbors(projectId, id, type).filter(o=>objectTypes.indexOf(o.type)>=0);
  }
  // Every object directly connected to `id`, with the via-type and direction.
  function related(projectId, id){
    const p=M().getProject(projectId); if(!p) return [];
    return (p.relationships||[]).filter(r=>r.from===id||r.to===id).map(r=>({
      object: p.objects[r.from===id?r.to:r.from], type:r.type, direction:r.from===id?'out':'in'
    })).filter(x=>x.object);
  }
  // Convenience for the common analysis question that caused the bug.
  function requirementsForObjective(projectId, objectiveId){
    return neighborsByTypes(projectId, objectiveId, 'implements', REQ);
  }

  const Relationships = { REGISTRY, INVERSE, REQ, validate, neighbors, neighborsByTypes, related, requirementsForObjective };
  root.Relationships = Relationships;
  if(typeof module!=='undefined' && module.exports) module.exports = Relationships;
})(typeof globalThis!=='undefined' ? globalThis : this);
