/* ============================================================
   BRAIN GRAPH — an Obsidian-style node network of the vault.

   Documents and entities are nodes; mentions and co-occurrences are
   links. A tiny self-contained force simulation lays it out (no
   libraries). Drag nodes, hover to highlight connections, scroll to
   zoom, click to open a note. Pure rendering over Store.index().
   ============================================================ */

const GRAPH_COLORS = {
  document:'#5b8cff', stakeholder:'#00d3a7', actor:'#ffb020', system:'#b478ff', metric:'#3ddc97', term:'#ff8fb0', _default:'#8d97b0'
};
const GRAPH_ICON = {document:'📄', stakeholder:'👤', actor:'🎭', system:'🔌', metric:'📈', term:'📖'};

function buildGraphModel(ix){
  const nodes=[], byId={};
  const add=(id, kind, title, ntype)=>{ if(byId[id]) return byId[id];
    const n={id, kind, ntype:ntype||kind, title, deg:0, x:0,y:0,vx:0,vy:0,fx:null,fy:null}; byId[id]=n; nodes.push(n); return n; };
  Object.values(ix.docs||{}).forEach(d=>add(d.id,'document', d.title,'document'));
  Object.values(ix.nodes||{}).forEach(n=>add(n.id, n.type, n.title, n.type));
  // Use only document→entity links for the layout — a clean bipartite/Obsidian
  // structure where shared entities bridge documents. (Entity↔entity co-occurrence
  // edges just make a hairball, so we leave them out of the drawing.)
  const links=[];
  (ix.edges||[]).forEach(e=>{ if(e.type!=='mentions') return; const a=byId[e.from], b=byId[e.to]; if(!a||!b) return;
    links.push({source:a, target:b, type:e.type}); a.deg++; b.deg++; });
  return {nodes, links, byId};
}

/* Controls (type filters + focus-on-document) wrap the force layout. */
function renderGraphInto(host, ix){
  const full = buildGraphModel(ix);
  if(!full.nodes.length){ host.innerHTML = '<div class="empty">Add documents to the brain to see the graph.</div>'; return; }
  const presentTypes = [...new Set(full.nodes.map(n=>n.ntype))];
  const docList = full.nodes.filter(n=>n.kind==='document');
  const state = { types:new Set(presentTypes), focus:'__all' };

  host.innerHTML = `
    <div class="graph-controls">
      <span class="dim" style="font-size:11px">Show:</span>
      ${presentTypes.map(t=>`<button class="gfilter on" data-t="${t}"><i style="background:${GRAPH_COLORS[t]||GRAPH_COLORS._default}"></i>${t}</button>`).join('')}
      <span style="margin-left:auto"></span>
      <span class="dim" style="font-size:11px">Focus:</span>
      <select id="gfocus"><option value="__all">All documents</option>${docList.map(d=>`<option value="${d.id}">${(d.title||'').replace(/</g,'&lt;').slice(0,40)}</option>`).join('')}</select>
    </div>
    <div id="graph-canvas" style="position:relative"></div>`;

  function filtered(){
    let nodes = full.nodes.filter(n=>state.types.has(n.ntype));
    if(state.focus!=='__all'){
      const keep=new Set([state.focus]);
      full.links.forEach(l=>{ if(l.source.id===state.focus) keep.add(l.target.id); if(l.target.id===state.focus) keep.add(l.source.id); });
      // pull in other documents that share those entities
      full.links.forEach(l=>{ if(keep.has(l.source.id)) keep.add(l.target.id); if(keep.has(l.target.id)) keep.add(l.source.id); });
      nodes = nodes.filter(n=>keep.has(n.id));
    }
    const nset=new Set(nodes.map(n=>n.id));
    const links = full.links.filter(l=>nset.has(l.source.id) && nset.has(l.target.id));
    // reset dynamic state so the sim re-lays-out cleanly
    nodes.forEach(n=>{ n.vx=0; n.vy=0; n.fx=null; n.fy=null; n.deg=0; });
    links.forEach(l=>{ l.source.deg++; l.target.deg++; });
    return {nodes, links};
  }
  function apply(){ try{ layoutGraph(E('graph-canvas'), filtered()); }catch(e){ console.error('graph layout failed',e); } }

  host.querySelectorAll('.gfilter').forEach(b=>b.onclick=()=>{ const t=b.dataset.t;
    if(state.types.has(t)) state.types.delete(t); else state.types.add(t);
    b.classList.toggle('on'); apply(); });
  E('gfocus').onchange=e=>{ state.focus=e.target.value; apply(); };
  apply();
}

function layoutGraph(host, model){
  const {nodes, links} = model;
  if(!nodes.length){ host.innerHTML = '<div class="empty">Nothing to show with these filters.</div>'; return; }

  const W = host.clientWidth || 900, H = Math.max(460, Math.min(680, window.innerHeight-320));
  host.innerHTML =
    `<div class="graph-wrap" style="position:relative;height:${H}px">
       <svg id="gsvg" width="100%" height="100%" style="display:block;cursor:grab"></svg>
       <div class="graph-legend">${Object.keys(GRAPH_COLORS).filter(k=>k[0]!=='_').map(k=>
         `<span><i style="background:${GRAPH_COLORS[k]}"></i>${k}</span>`).join('')}</div>
       <div class="graph-hint dim">drag nodes · scroll to zoom · click to open</div>
     </div>`;
  const svg = host.querySelector('#gsvg');
  const NS='http://www.w3.org/2000/svg';
  const gRoot = document.createElementNS(NS,'g'); svg.appendChild(gRoot);
  const gLinks = document.createElementNS(NS,'g'); gRoot.appendChild(gLinks);
  const gNodes = document.createElementNS(NS,'g'); gRoot.appendChild(gNodes);

  // initial positions: circle-ish spread
  nodes.forEach((n,i)=>{ const a=i/nodes.length*Math.PI*2; n.x=W/2+Math.cos(a)*Math.min(W,H)*0.3; n.y=H/2+Math.sin(a)*Math.min(W,H)*0.3; });

  // build DOM
  const linkEls = links.map(l=>{ const el=document.createElementNS(NS,'line');
    el.setAttribute('stroke', l.type==='co-occurs' ? '#2a3350' : '#39435f');
    el.setAttribute('stroke-width', l.type==='co-occurs' ? 0.6 : 1); gLinks.appendChild(el); return el; });
  const nodeEls = nodes.map(n=>{
    const g=document.createElementNS(NS,'g'); g.style.cursor='pointer';
    const r = n.kind==='document' ? 9+Math.min(6,n.deg) : 5+Math.min(7,n.deg);
    n.r=r;
    const c=document.createElementNS(NS,'circle');
    c.setAttribute('r', r); c.setAttribute('fill', GRAPH_COLORS[n.ntype]||GRAPH_COLORS._default);
    c.setAttribute('stroke','#0b0d12'); c.setAttribute('stroke-width','1.5');
    if(n.kind==='document') c.setAttribute('stroke','#e6e9f2');
    const t=document.createElementNS(NS,'text');
    t.textContent = n.title.length>26?n.title.slice(0,25)+'…':n.title;
    t.setAttribute('font-size','10.5'); t.setAttribute('fill','#c7cee0');
    t.setAttribute('text-anchor','middle'); t.setAttribute('dy', -(r+4)); t.style.pointerEvents='none';
    t.setAttribute('opacity', n.kind==='document'||n.deg>1 ? '0.95':'0');   // labels for docs/hubs; others on hover
    g.appendChild(c); g.appendChild(t); gNodes.appendChild(g);
    n._c=c; n._t=t; n._g=g;
    return g;
  });

  // neighbor map for hover highlight
  const nbr=new Map(); nodes.forEach(n=>nbr.set(n,new Set([n])));
  links.forEach(l=>{ nbr.get(l.source).add(l.target); nbr.get(l.target).add(l.source); });

  // ---- force simulation ----
  let alpha=1;
  const K_REP=3600, K_SPRING=0.035, REST=90, CENTER=0.014, DAMP=0.88;
  function tick(){
    // repulsion (O(n^2) — fine for modest graphs)
    for(let i=0;i<nodes.length;i++){ const a=nodes[i];
      for(let j=i+1;j<nodes.length;j++){ const b=nodes[j];
        let dx=a.x-b.x, dy=a.y-b.y, d2=dx*dx+dy*dy||0.01; const d=Math.sqrt(d2);
        const f=K_REP/d2; const fx=dx/d*f, fy=dy/d*f;
        a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
      }
    }
    // springs
    links.forEach(l=>{ const a=l.source,b=l.target; let dx=b.x-a.x, dy=b.y-a.y; const d=Math.sqrt(dx*dx+dy*dy)||0.01;
      const f=K_SPRING*(d-REST); const fx=dx/d*f, fy=dy/d*f; a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy; });
    // centering + integrate
    nodes.forEach(n=>{ n.vx+=(W/2-n.x)*CENTER; n.vy+=(H/2-n.y)*CENTER;
      if(n.fx!=null){ n.x=n.fx; n.y=n.fy; n.vx=0; n.vy=0; }
      else { n.vx*=DAMP; n.vy*=DAMP; n.x+=n.vx*alpha; n.y+=n.vy*alpha;
        n.x=Math.max(20,Math.min(W-20,n.x)); n.y=Math.max(20,Math.min(H-20,n.y)); } });
    draw();
    alpha*=0.985; if(alpha>0.02) raf=requestAnimationFrame(tick);
  }
  function draw(){
    links.forEach((l,i)=>{ const el=linkEls[i]; el.setAttribute('x1',l.source.x); el.setAttribute('y1',l.source.y);
      el.setAttribute('x2',l.target.x); el.setAttribute('y2',l.target.y); });
    nodes.forEach(n=>{ n._g.setAttribute('transform',`translate(${n.x},${n.y})`); });
  }
  let raf=requestAnimationFrame(tick);
  function reheat(){ alpha=Math.max(alpha,0.6); cancelAnimationFrame(raf); raf=requestAnimationFrame(tick); }

  // ---- zoom / pan ----
  let scale=1, tx=0, ty=0;
  const applyView=()=>gRoot.setAttribute('transform',`translate(${tx},${ty}) scale(${scale})`);
  svg.addEventListener('wheel', e=>{ e.preventDefault(); const f=e.deltaY<0?1.1:0.9;
    const rect=svg.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    tx=mx-(mx-tx)*f; ty=my-(my-ty)*f; scale*=f; applyView(); }, {passive:false});
  let panning=false, px=0,py=0;
  svg.addEventListener('mousedown', e=>{ if(e.target===svg){ panning=true; px=e.clientX-tx; py=e.clientY-ty; svg.style.cursor='grabbing'; } });
  window.addEventListener('mousemove', e=>{ if(panning){ tx=e.clientX-px; ty=e.clientY-py; applyView(); } });
  window.addEventListener('mouseup', ()=>{ panning=false; svg.style.cursor='grab'; });

  // ---- node drag + hover + click ----
  nodes.forEach(n=>{
    let dragging=false, moved=false;
    n._g.addEventListener('mousedown', e=>{ e.stopPropagation(); dragging=true; moved=false; reheat(); });
    window.addEventListener('mousemove', e=>{ if(!dragging) return; moved=true;
      const rect=svg.getBoundingClientRect(); n.fx=(e.clientX-rect.left-tx)/scale; n.fy=(e.clientY-rect.top-ty)/scale; });
    window.addEventListener('mouseup', ()=>{ if(dragging){ dragging=false; n.fx=null; n.fy=null; } });
    n._g.addEventListener('click', e=>{ e.stopPropagation(); if(moved) return;
      openNote(n.id, n.kind==='document'?'document':n.ntype); });
    n._g.addEventListener('mouseenter', ()=>{ const set=nbr.get(n);
      nodes.forEach(m=>{ const on=set.has(m); m._g.style.opacity=on?'1':'0.12'; if(on&&m!==n) m._t.setAttribute('opacity','0.95'); });
      linkEls.forEach((el,i)=>{ const l=links[i]; el.style.opacity=(l.source===n||l.target===n)?'1':'0.05'; });
    });
    n._g.addEventListener('mouseleave', ()=>{ nodes.forEach(m=>{ m._g.style.opacity='1'; if(!(m.kind==='document'||m.deg>1)) m._t.setAttribute('opacity','0'); });
      linkEls.forEach(el=>el.style.opacity='1'); });
  });
}
