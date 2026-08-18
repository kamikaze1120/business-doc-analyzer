/* ============================================================
   UID — immutable internal identifiers.

   Every object in the Project Truth Model is keyed by an opaque,
   immutable UUID that NEVER changes and is NEVER derived from a
   title, slug, array position, or display id. Display ids (FR-001…)
   are generated separately and may change freely without breaking
   any relationship, because relationships point at the UUID.

   Works in the browser (classic <script>) and in Node (require).
   ============================================================ */
;(function(root){
  'use strict';

  function uuid(){
    // Prefer the platform CSPRNG UUID; fall back to a v4 built from
    // getRandomValues; finally a Math.random v4 (test/legacy only).
    try{
      if(typeof crypto!=='undefined' && crypto.randomUUID) return crypto.randomUUID();
      if(typeof crypto!=='undefined' && crypto.getRandomValues){
        const b=new Uint8Array(16); crypto.getRandomValues(b);
        b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80;
        const h=[...b].map(x=>x.toString(16).padStart(2,'0'));
        return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
      }
    }catch(e){}
    let s=''; for(let i=0;i<16;i++) s+=Math.floor(Math.random()*256).toString(16).padStart(2,'0');
    return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`;
  }

  // A short, prefixed id for a namespace (e.g. "proj", "ev"). The UUID
  // stays the true key; the prefix is only a human hint in logs.
  function nsid(prefix){ return (prefix?prefix+'_':'')+uuid(); }

  const api = { uuid, nsid };
  root.UID = api;
  if(typeof module!=='undefined' && module.exports) module.exports = api;
})(typeof globalThis!=='undefined' ? globalThis : this);
