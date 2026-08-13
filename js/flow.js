/* ============================================================
   PERSONA SWIMLANE — one lane per actor, with hand-off arrows.

   Renders the ordered process steps as an SVG swimlane: each actor
   gets a horizontal lane, steps sit in sequence, and the connector
   between two steps crosses lanes (highlighted) whenever the actor
   changes — i.e. a hand-off. Each step shows its traced requirement.
   ============================================================ */
function renderSwimlaneSVG(host, steps){
  if(!steps || !steps.length){ host.innerHTML=''; return; }
  const lanes=[]; steps.forEach(s=>{ if(!lanes.includes(s.lane)) lanes.push(s.lane); });
  const LABEL=136, COLW=180, BOXW=152, BOXH=46, ROWH=96, PADT=20;
  const PADL=LABEL+18;
  const W=PADL + steps.length*COLW + 24;
  const H=PADT + lanes.length*ROWH + 16;
  const laneY=l=>PADT + lanes.indexOf(l)*ROWH + ROWH/2;
  const colLeft=i=>PADL + i*COLW;
  const e=s=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const wrap=(t,n)=>{ t=String(t||''); return t.length>n? t.slice(0,n-1)+'…':t; };

  let svg=`<svg width="${W}" height="${H}" font-family="inherit">
    <defs>
      <marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="#5b8cff"/></marker>
      <marker id="ahd" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="#38425e"/></marker>
    </defs>`;
  // lane bands + labels
  lanes.forEach((l,i)=>{ const y=PADT+i*ROWH;
    svg+=`<rect x="0" y="${y}" width="${W}" height="${ROWH}" fill="${i%2?'#0f1420':'#131826'}"/>`;
    svg+=`<rect x="0" y="${y}" width="${LABEL}" height="${ROWH}" fill="#1b2030"/>`;
    svg+=`<text x="14" y="${y+ROWH/2}" fill="#00d3a7" font-size="12" font-weight="700" dominant-baseline="middle">${e(wrap(l,16))}</text>`;
    svg+=`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#252c3f" stroke-width="1"/>`;
  });
  svg+=`<line x1="${LABEL}" y1="0" x2="${LABEL}" y2="${H}" stroke="#252c3f"/>`;

  // connectors (draw first, under boxes)
  for(let i=0;i<steps.length-1;i++){
    const a=steps[i], b=steps[i+1];
    const x1=colLeft(i)+BOXW, y1=laneY(a.lane), x2=colLeft(i+1), y2=laneY(b.lane);
    const cross = a.lane!==b.lane;
    const col = cross?'#5b8cff':'#38425e', mk = cross?'ah':'ahd';
    if(!cross){ svg+=`<line x1="${x1}" y1="${y1}" x2="${x2-2}" y2="${y2}" stroke="${col}" stroke-width="${cross?2:1.4}" marker-end="url(#${mk})"/>`; }
    else { const mx=(x1+x2)/2; svg+=`<path d="M${x1},${y1} H${mx} V${y2} H${x2-2}" fill="none" stroke="${col}" stroke-width="2" marker-end="url(#${mk})"/>`; }
  }
  // step boxes
  steps.forEach((s,i)=>{ const x=colLeft(i), y=laneY(s.lane)-BOXH/2;
    const stroke = s.decision?'#ffb020':'#2f3a52';
    svg+=`<g>
      <rect x="${x}" y="${y}" rx="8" width="${BOXW}" height="${BOXH}" fill="#1b2030" stroke="${stroke}" stroke-width="1.5"/>
      <text x="${x+10}" y="${y+15}" fill="${s.decision?'#ffb020':'#5b8cff'}" font-size="9" font-weight="700">${s.decision?'◆ DECISION ':''}STEP ${s.n}</text>
      <text x="${x+10}" y="${y+31}" fill="#e6e9f2" font-size="10.5">${e(wrap(s.full,22))}</text>
      ${s.reqId?`<text x="${x+10}" y="${y+42}" fill="#8d97b0" font-size="8.5" font-family="ui-monospace,monospace">${e(s.reqId)}</text>`:''}
    </g>`;
  });
  svg+=`</svg>`;
  host.innerHTML=svg;
}
