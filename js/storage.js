/* ============================================================
   STORAGE ABSTRACTION — decouple business logic from localStorage.

   Business logic talks to AppStorage, never to localStorage directly.
   This lets the same code run against:
     • LocalProvider      — browser localStorage (default)
     • MemoryProvider     — in-memory (Node tests, private-mode fallback)
     • IndexedDBProvider  — larger, async store (opt-in; future default)
     • (future) RemoteProvider — enterprise sync, behind a gateway

   The synchronous facade (get/set/getJSON/setJSON) uses whichever
   SYNC provider is active (Local or Memory). IndexedDB is exposed
   through the async surface for the milestones that need bulk data.
   Named "AppStorage" so it never shadows the DOM's built-in Storage.
   ============================================================ */
;(function(root){
  'use strict';

  /* ---- sync providers ---- */
  function LocalProvider(){
    return {
      name:'local',
      available(){ try{ const k='bda:__t'; root.localStorage.setItem(k,'1'); root.localStorage.removeItem(k); return true; }catch(e){ return false; } },
      get(key){ return root.localStorage.getItem(key); },
      set(key,val){ root.localStorage.setItem(key,val); return true; },
      remove(key){ root.localStorage.removeItem(key); },
      keys(prefix){ const out=[]; for(let i=0;i<root.localStorage.length;i++){ const k=root.localStorage.key(i); if(!prefix||k.indexOf(prefix)===0) out.push(k); } return out; }
    };
  }
  function MemoryProvider(){
    const m=new Map();
    return {
      name:'memory',
      available(){ return true; },
      get(key){ return m.has(key)?m.get(key):null; },
      set(key,val){ m.set(key,String(val)); return true; },
      remove(key){ m.delete(key); },
      keys(prefix){ return [...m.keys()].filter(k=>!prefix||k.indexOf(prefix)===0); }
    };
  }

  /* ---- async provider (IndexedDB) — opt-in, for bulk/large data ---- */
  function IndexedDBProvider(dbName, storeName){
    dbName=dbName||'bda'; storeName=storeName||'kv';
    function open(){ return new Promise((res,rej)=>{
      if(typeof root.indexedDB==='undefined') return rej(new Error('IndexedDB unavailable'));
      const rq=root.indexedDB.open(dbName,1);
      rq.onupgradeneeded=()=>{ const db=rq.result; if(!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName); };
      rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error);
    }); }
    function tx(mode,fn){ return open().then(db=>new Promise((res,rej)=>{
      const t=db.transaction(storeName,mode), s=t.objectStore(storeName); let out;
      Promise.resolve(fn(s)).then(v=>out=v);
      t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error);
    })); }
    return {
      name:'indexeddb', async:true,
      available(){ return typeof root.indexedDB!=='undefined'; },
      getAsync(key){ return tx('readonly',s=>new Promise((res,rej)=>{ const r=s.get(key); r.onsuccess=()=>res(r.result==null?null:r.result); r.onerror=()=>rej(r.error); })); },
      setAsync(key,val){ return tx('readwrite',s=>{ s.put(String(val),key); return true; }); },
      removeAsync(key){ return tx('readwrite',s=>{ s.delete(key); return true; }); },
      keysAsync(prefix){ return tx('readonly',s=>new Promise((res,rej)=>{ const out=[]; const r=s.openKeyCursor(); r.onsuccess=()=>{ const c=r.result; if(c){ if(!prefix||String(c.key).indexOf(prefix)===0) out.push(c.key); c.continue(); } else res(out); }; r.onerror=()=>rej(r.error); })); }
    };
  }

  /* ---- facade ---- */
  const providers = { local:LocalProvider(), memory:MemoryProvider() };
  // Default to localStorage when usable, otherwise fall back to memory so
  // the app still runs (private mode, blocked storage, Node tests).
  let active = providers.local.available() ? providers.local : providers.memory;

  const api = {
    LocalProvider, MemoryProvider, IndexedDBProvider,
    providers,
    provider(){ return active; },
    providerName(){ return active.name; },
    use(nameOrProvider){
      active = (typeof nameOrProvider==='string') ? (providers[nameOrProvider]||active) : (nameOrProvider||active);
      return active;
    },
    persistent(){ return active.name!=='memory'; },
    get(key){ return active.get(key); },
    set(key,val){ try{ return active.set(key,val); }catch(e){ if(active.name==='local'){ api.use('memory'); return active.set(key,val); } throw e; } },
    remove(key){ return active.remove(key); },
    keys(prefix){ return active.keys(prefix); },
    getJSON(key,dflt){ try{ const v=active.get(key); return v==null?(dflt===undefined?null:dflt):JSON.parse(v); }catch(e){ return dflt===undefined?null:dflt; } },
    setJSON(key,obj){ return api.set(key, JSON.stringify(obj)); }
  };

  root.AppStorage = api;
  if(typeof module!=='undefined' && module.exports) module.exports = api;
})(typeof globalThis!=='undefined' ? globalThis : this);
