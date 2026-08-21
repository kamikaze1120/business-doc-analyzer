/* ============================================================
   INTELLIGENT CLARIFICATION ENGINE (Phase 8).

   Turns detected gaps and conflicts into a PRIORITIZED question queue.
   Priority is impact-driven, not generic: severity + how many downstream
   artifacts the target affects + conflict weight + risk. Questions are
   typed (yes/no, choice, numeric, approval, select-stakeholder, resolve-
   conflict, …). Answering a question writes back into the Truth Model as
   provenance-tagged evidence and returns the set of impacted objects so
   the change-impact engine (Milestone 5) can flag stale downstream work.
   Deterministic and DOM-free.
   ============================================================ */
;(function(root){
  'use strict';
  function M(){ return root.Model; }
  // Prefer the mutation facade (cascades impact + freshness); fall back to Model.
  function up(projectId, id, patch, opts){ return root.Mutate ? root.Mutate.updateObject(projectId,id,patch,opts) : M().updateObject(projectId,id,patch,opts); }

  const GAP_QUESTION = {
    no_test_coverage:   d=>({type:'open', text:`What observable outcome verifies ${d} — i.e. what should a test check?`}),
    missing_priority:   d=>({type:'multiple_choice', text:`What priority is ${d}?`, choices:['High','Medium','Low']}),
    no_source:          d=>({type:'open', text:`Where does ${d} come from (which document, meeting, or stakeholder)?`}),
    orphan_requirement: d=>({type:'open', text:`Which business objective does ${d} support?`}),
    objective_without_requirement: d=>({type:'open', text:`Which requirements deliver the objective "${d}"?`}),
    requirement_without_acceptance:d=>({type:'open', text:`What are the acceptance criteria for ${d}?`}),
    system_without_integration:    d=>({type:'open', text:`How does the system "${d}" integrate (interface, API, failure handling)?`}),
    step_without_actor:            d=>({type:'select_stakeholder', text:`Who is responsible for the step "${d}"?`}),
    not_testable:       (d,g)=>({type:'open', text:`${d} is not testable as written. ${g.recommendation||'Restate it as a concrete, observable action.'}`}),
    ambiguous:          (d,g)=>({type:'open', text:`${d} uses vague language. ${g.recommendation||'Replace vague terms with measurable criteria.'}`}),
    ac_without_test:    d=>({type:'open', text:`What test verifies acceptance criterion ${d}?`}),
    test_without_requirement: d=>({type:'select', text:`Which requirement does ${d} verify?`}),
    low_quality:        d=>({type:'open', text:`How can ${d} be made clearer and more complete?`})
  };
  const SEV_BASE = {high:70, medium:45, low:20};

  function impact(projectId, objectId){
    if(!objectId) return {down:0, up:0, downstream:[]};
    const r=M().relationshipsOf(projectId, objectId);
    return { down:r.downstream.length, up:r.upstream.length, downstream:r.downstream.map(e=>e.to) };
  }
  function priorityOf(projectId, gap, isConflict){
    let score = SEV_BASE[gap.severity]||20;
    const im = impact(projectId, gap.objectId);
    score += Math.min(30, (im.down+im.up)*6);
    if(isConflict) score += 30;
    const o = gap.objectId && M().getObject(projectId, gap.objectId);
    if(o && (o.type==='risk' || o.priority==='High')) score += 10;
    return Math.min(100, score);
  }
  function reasonFor(projectId, gap){
    const im=impact(projectId, gap.objectId);
    const bits=[];
    if(im.down) bits.push(`${im.down} downstream artifact${im.down>1?'s':''}`);
    if(im.up) bits.push(`${im.up} upstream link${im.up>1?'s':''}`);
    bits.push(gap.recommendation||gap.message);
    return 'Affects: '+(bits.join(' · '));
  }

  function generateQuestions(projectId){ const m=M(); return (m&&m.memo)? m.memo(projectId,'questions',()=>_generateQuestions(projectId)) : _generateQuestions(projectId); }
  function _generateQuestions(projectId){
    const model=M(); if(!model||!model.getProject(projectId)) return [];
    const out=[]; const seen=new Set(); let seq=0;
    // from gaps
    if(root.Gaps){ root.Gaps.detectGaps(projectId).all.forEach(g=>{
      const maker=GAP_QUESTION[g.type]; if(!maker) return;
      const key=g.type+':'+(g.objectId||g.message); if(seen.has(key)) return; seen.add(key);
      const o=g.objectId&&model.getObject(projectId,g.objectId);
      const label=o?o.displayId:g.message; const q=maker(label,g);
      out.push(Object.assign({ id:'q'+(++seq), source:'gap', gapType:g.type, targetObjectId:g.objectId||null,
        priority:priorityOf(projectId,g,false), reason:reasonFor(projectId,g), answered:false }, q));
    }); }
    // from conflicts (highest value — always resolve_conflict typed)
    if(root.Conflicts){ root.Conflicts.detectConflicts(projectId).items.forEach(c=>{
      const key='conflict:'+c.sources.slice().sort().join('|'); if(seen.has(key)) return; seen.add(key);
      out.push({ id:'q'+(++seq), source:'conflict', type:'resolve_conflict',
        text:`Resolve ${c.kind} on ${c.topic}: ${c.statements.join('  ⇄  ')}`,
        choices:c.sourceDisplay.concat(['Neither — provide the correct rule']),
        targetObjectId:c.sources[0]||null, conflictSources:c.sources,
        priority: Math.min(100,(SEV_BASE[c.severity]||45)+30), reason:c.recommendation, answered:false });
    }); }
    return out.sort((a,b)=>b.priority-a.priority);
  }

  // Apply an answer: write back into the model as provenance-tagged evidence,
  // perform the concrete update the question implies, and return impacted ids.
  function answerQuestion(projectId, question, answer, by){
    const model=M(); const impacted=new Set(); const tid=question.targetObjectId;
    const ev={ sourceType:'clarification', documentName:'Clarification', extractionMethod:'stakeholder',
      originalText:String(answer), speaker:by||'stakeholder' };
    function markImpacted(id){ if(!id) return; impacted.add(id);
      model.relationshipsOf(projectId,id).downstream.forEach(e=>impacted.add(e.to)); }

    if(question.gapType==='missing_priority' && tid){ up(projectId,tid,{priority:answer},{changeReason:'clarified priority'}); model.addEvidence(projectId,tid,ev); markImpacted(tid); }
    else if(question.gapType==='step_without_actor' && tid){ const o=model.getObject(projectId,tid); o.attrs=o.attrs||{}; o.attrs.actor=answer; up(projectId,tid,{attrs:o.attrs},{force:true,changeReason:'assigned actor'}); model.addEvidence(projectId,tid,ev); markImpacted(tid); }
    else if(question.source==='conflict'){ // record a resolution proposal; never auto-resolve
      const conf=model.listObjects(projectId,'conflict').find(o=>o.attrs&&o.attrs.sources&&question.conflictSources&&o.attrs.sources.slice().sort().join('|')===question.conflictSources.slice().sort().join('|'));
      if(conf && root.Conflicts){ const attrs=Object.assign({}, conf.attrs, {proposedResolution:String(answer)});
        model.updateObject(projectId, conf.id, {attrs}, {force:true, changeReason:'resolution proposed'});
        root.Conflicts.setConflictStatus(projectId,conf.id,'resolution_proposed',by); markImpacted(conf.id); }
      (question.conflictSources||[]).forEach(id=>{ model.addEvidence(projectId,id,ev); markImpacted(id); });
    }
    else if(tid){ // generic: the answer becomes a stakeholder statement on the target
      model.addEvidence(projectId,tid,ev);
      const o=model.getObject(projectId,tid); if(o){ o.attrs=o.attrs||{}; o.attrs.clarifications=(o.attrs.clarifications||[]).concat([{q:question.text,a:String(answer),at:new Date().toISOString()}]);
        up(projectId,tid,{attrs:o.attrs},{force:true,changeReason:'clarification recorded'}); }
      markImpacted(tid);
    }
    return { impacted:[...impacted] };
  }

  const Questions = { generateQuestions, answerQuestion, priorityOf };
  root.Questions = Questions;
  if(typeof module!=='undefined' && module.exports) module.exports = Questions;
})(typeof globalThis!=='undefined' ? globalThis : this);
