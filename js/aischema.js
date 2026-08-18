/* ============================================================
   AI OUTPUT SCHEMAS (audit Phases 7-8) — validate before mutate.

   Free-form AI text must never directly mutate the Project Truth Model.
   This module defines typed proposal schemas and validates/normalizes AI
   output against them: required fields, enum values, numeric ranges
   (e.g. confidence in [0,1]), and string bounds. Invalid items are
   dropped with captured diagnostics (field-level errors + a truncated
   copy of the offending value — never prompts, keys, or secrets), and
   malformed output (non-object / non-array) yields an empty result so
   callers can fall back to the deterministic path. DOM-free.
   ============================================================ */
;(function(root){
  'use strict';

  const SCHEMAS = {
    DiscoveryItem:              { text:{type:'string', required:true, minLen:2, maxLen:200}, confidence:{type:'number', min:0, max:1} },
    RequirementProposal:        { text:{type:'string', required:true, minLen:5, maxLen:500}, type:{type:'string', enum:['FR','NFR','INT','BR'], upper:true, default:'FR'}, confidence:{type:'number', min:0, max:1} },
    AcceptanceCriteriaProposal: { text:{type:'string', required:true, minLen:5, maxLen:500}, confidence:{type:'number', min:0, max:1} },
    TestCaseProposal:           { title:{type:'string', required:true, minLen:3, maxLen:120}, type:{type:'string', enum:['Positive','Negative','Boundary','Alternate','Security','Integration','NFR'], default:'Positive'}, expected:{type:'string', maxLen:400}, confidence:{type:'number', min:0, max:1} },
    RewriteProposal:            { rewrite:{type:'string', required:true, minLen:5, maxLen:500}, confidence:{type:'number', min:0, max:1} }
  };

  function vfield(spec, raw){
    let v=raw;
    if(v===undefined || v===null || v===''){
      if('default' in spec) return {ok:true, value:spec.default};
      if(spec.required) return {ok:false, error:'required field is missing'};
      return {ok:true, value:undefined};
    }
    if(spec.type==='string'){
      if(typeof v!=='string') v=String(v);
      v=v.trim();
      if(spec.minLen && v.length<spec.minLen) return {ok:false, error:'shorter than '+spec.minLen+' chars'};
      if(spec.maxLen && v.length>spec.maxLen) v=v.slice(0,spec.maxLen);
      if(spec.enum){
        let cand=v; if(spec.upper) cand=v.toUpperCase();
        const match=spec.enum.find(e=> e===cand || e.toLowerCase()===String(v).toLowerCase());
        if(!match) return {ok:false, error:'"'+v+'" not in ['+spec.enum.join(',')+']'};
        v=match;
      }
      return {ok:true, value:v};
    }
    if(spec.type==='number'){
      v=Number(v); if(!isFinite(v)) return {ok:false, error:'not a number'};
      if(spec.min!=null && v<spec.min) v=spec.min;
      if(spec.max!=null && v>spec.max) v=spec.max;
      return {ok:true, value:v};
    }
    return {ok:true, value:v};
  }

  function truncate(x){ try{ return JSON.stringify(x).slice(0,120); }catch(e){ return String(x).slice(0,120); } }

  function validate(schemaName, obj){
    const schema=SCHEMAS[schemaName];
    if(!schema) return {ok:false, errors:['unknown schema: '+schemaName]};
    if(!obj || typeof obj!=='object' || Array.isArray(obj)) return {ok:false, errors:['not an object'], sample:truncate(obj)};
    const value={}, errors=[];
    Object.keys(schema).forEach(f=>{ const r=vfield(schema[f], obj[f]);
      if(!r.ok) errors.push(f+': '+r.error); else if(r.value!==undefined) value[f]=r.value; });
    return errors.length ? {ok:false, errors, sample:truncate(obj)} : {ok:true, value};
  }

  function validateList(schemaName, arr){
    if(!Array.isArray(arr)) return {valid:[], rejected:[], diagnostics:{validated:0, rejected:0, note:'input was not a list'}};
    const valid=[], rejected=[];
    arr.forEach((item,i)=>{ const r=validate(schemaName, item);
      if(r.ok) valid.push(r.value); else rejected.push({index:i, errors:r.errors, sample:r.sample}); });
    return { valid, rejected, diagnostics:{ validated:valid.length, rejected:rejected.length,
      errors: rejected.slice(0,5).map(x=>({index:x.index, errors:x.errors})) } };
  }

  const AISchema = { SCHEMAS, validate, validateList };
  root.AISchema = AISchema;
  if(typeof module!=='undefined' && module.exports) module.exports = AISchema;
})(typeof globalThis!=='undefined' ? globalThis : this);
