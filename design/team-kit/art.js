/* The mass at the end of each link follows one RK4 solution.
   Coordinates use metres, positive y downward, and equal unit masses. */
(() => {
  'use strict';

  const gravity = 9.81;
  const secondLength = 0.93;
  const sampleRate = 120;
  const tau = 2 * Math.PI;
  const cache = new Map();
  const styles = {
    instrument: { base: [2.6, -.65, 0, 0], time: 3.29, span: .45, history: 2.15, ink: '#242923', paper: '#eeefea', accent: '#ec5025' },
    night: { base: [2.8, 2.1, 0, 0], time: 8.06, span: .62, history: 7.2, ink: '#d9fff2', paper: '#0b1616', accent: '#a8ffda' },
    folio: { base: [2.35, 1.2, 0, 0], time: 2.76, span: .43, history: 1.77, ink: '#244b86', paper: '#f6f0df', accent: '#244b86' },
    impact: { base: [-2.2, -1.1, 0, 0], time: 1.03, span: .34, history: .75, ink: '#19241c', paper: '#dafa42', accent: '#19241c' }
  };

  function derivative([a, b, u, v]) {
    const s = Math.sin(a - b), c = Math.cos(a - b), det = 2 - c * c;
    return [u, v,
      (-secondLength * v * v * s - u * u * s * c - 2 * gravity * Math.sin(a) + gravity * Math.sin(b) * c) / det,
      (2 * u * u * s + secondLength * v * v * s * c + 2 * gravity * (Math.sin(a) * c - Math.sin(b))) / (secondLength * det)
    ];
  }

  const advance = (state, velocity, dt) => state.map((v, i) => v + velocity[i] * dt);
  function simulate(initial, seconds) {
    const dt = 1 / (2 * sampleRate);
    let state = initial.slice();
    const result = [];
    for (let i = 0; i <= Math.ceil(seconds / dt) + 2; i++) {
      if (i % 2 === 0) {
        const [a, b] = state, x = Math.sin(a), y = Math.cos(a);
        result.push({ x, y, X: x + secondLength * Math.sin(b), Y: y + secondLength * Math.cos(b), a, b });
      }
      const k1 = derivative(state);
      const k2 = derivative(advance(state, k1, dt / 2));
      const k3 = derivative(advance(state, k2, dt / 2));
      const k4 = derivative(advance(state, k3, dt));
      state = state.map((v, n) => v + dt / 6 * (k1[n] + 2 * k2[n] + 2 * k3[n] + k4[n]));
    }
    return result;
  }

  function study(theme) {
    if (cache.has(theme)) return cache.get(theme);
    const cfg = styles[theme], stop = cfg.time + cfg.span / 2 + .05;
    const paths = [simulate(cfg.base, stop)];
    if (theme === 'night') {
      // A bundle of solutions from a narrow sweep of release angles.
      for (let n = -5; n <= 5; n++) {
        if (n === 0) continue;
        const release = cfg.base.slice();
        release[0] += n * .0014;
        paths.push(simulate(release, stop));
      }
    }
    const bounds = [0, 0, 0, 0];
    const begin = Math.max(0, Math.floor((cfg.time - cfg.span / 2 - cfg.history) * sampleRate));
    for (const path of paths) {
      for (let i = begin; i < path.length; i += 3) {
        const p = path[i];
        bounds[0] = Math.min(bounds[0], p.X, p.x);
        bounds[1] = Math.min(bounds[1], p.Y, p.y);
        bounds[2] = Math.max(bounds[2], p.X, p.x);
        bounds[3] = Math.max(bounds[3], p.Y, p.y);
      }
    }
    const asset = { cfg, paths, bounds };
    cache.set(theme, asset);
    return asset;
  }

  function circle(c, x, y, radius, fill, stroke, width = 1) {
    c.beginPath(); c.arc(x, y, radius, 0, tau);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.lineWidth = width; c.strokeStyle = stroke; c.stroke(); }
  }
  function line(c, x, y, X, Y, color, width = 1) {
    c.beginPath(); c.moveTo(x, y); c.lineTo(X, Y);
    c.lineWidth = width; c.strokeStyle = color; c.stroke();
  }
  function trail(c, path, start, end, z, color, width, joint = false) {
    const first = Math.max(0, Math.floor(start));
    const last = Math.min(path.length - 1, Math.floor(end));
    if (first >= last) return;
    c.beginPath();
    for (let i = first; i <= last; i++) {
      const p = path[i], x = (joint ? p.x : p.X) * z, y = (joint ? p.y : p.Y) * z;
      if (i === first) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.lineWidth = width; c.strokeStyle = color; c.stroke();
  }
  function links(c, p, z, color, weight) {
    c.beginPath(); c.moveTo(0, 0); c.lineTo(p.x * z, p.y * z); c.lineTo(p.X * z, p.Y * z);
    c.lineWidth = weight; c.strokeStyle = color; c.stroke();
  }
  function joint(c, x, y, size, cfg, inner = cfg.paper) {
    circle(c, x, y, size, cfg.ink);
    circle(c, x, y, size * .60, inner);
    circle(c, x, y, size * .22, cfg.ink);
  }
  function annotation(c, text, x, y, color, size, font = 'monospace', align = 'left') {
    c.fillStyle = color; c.font = size + 'px ' + font; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(text, x, y);
  }

  function instrument(c, {cfg, paths}, index, z, w, h) {
    const path = paths[0], p = path[index];
    const measure = Math.min(w, h), u = Math.max(.67, Math.min(1.25, measure / 510));
    const t0 = index - Math.round(cfg.history * sampleRate);
    c.save();
    c.lineCap = 'butt';
    // Angular reticle shares the actual fulcrum and first link length.
    const r = z;
    c.beginPath(); c.arc(0, 0, r, .03 * Math.PI, .94 * Math.PI); c.strokeStyle = 'rgba(36,41,35,.16)'; c.lineWidth = .8; c.stroke();
    for (let n = 0; n <= 32; ++n) {
      const angle = Math.PI * (.03 + .91 * n / 32), len = (n % 4 ? 3 : 7) * u;
      line(c, (r + 3 * u) * Math.cos(angle), (r + 3 * u) * Math.sin(angle), (r + (3 * u) + len) * Math.cos(angle), (r + (3 * u) + len) * Math.sin(angle), 'rgba(36,41,35,.40)', .7);
    }
    c.setLineDash([3 * u, 5 * u]); line(c, 0, -z * .58, 0, z * 1.62, 'rgba(36,41,35,.23)', .8); c.setLineDash([]);
    trail(c, path, t0, index, z, cfg.accent, 1.65 * u);
    for (let j = 0; j < 21; j++) {
      const i = Math.round(t0 + (index - t0) * j / 21), q = path[Math.max(0, i)];
      c.globalAlpha = .10 + .32 * j / 21;
      links(c, q, z, cfg.ink, j % 3 === 0 ? 1.35 * u : .65 * u);
      if (j % 3 === 0) circle(c, q.X * z, q.Y * z, 2.5 * u, cfg.paper, cfg.ink, .85);
    }
    c.globalAlpha = 1;
    c.lineCap = 'round'; c.lineJoin = 'round';
    links(c, p, z, cfg.ink, 11 * u);
    links(c, p, z, '#777a72', 2.1 * u);
    line(c,-15*u,0,15*u,0,cfg.ink,1.1*u);
    line(c,0,-15*u,0,15*u,cfg.ink,1.1*u);
    joint(c, 0, 0, 10 * u, cfg);
    annotation(c,'O', -18*u,-15*u, cfg.ink, Math.max(10,11*u), 'monospace','center');
    joint(c, p.x*z, p.y*z, 12 * u, cfg);
    const x = p.X * z, y = p.Y * z;
    circle(c, x, y, 14*u, cfg.accent, cfg.ink, 1.5*u);
    circle(c, x, y, 5*u, cfg.ink);
    circle(c, x, y, 1.9*u, cfg.paper);
    const dx=p.X>0 ? -1 : 1;
    line(c,x+dx*12*u,y-10*u,x+dx*25*u,y-23*u,cfg.ink,.75*u);
    line(c,x+dx*25*u,y-23*u,x+dx*44*u,y-23*u,cfg.ink,.75*u);
    annotation(c,'m₂',x+dx*33*u,y-30*u,cfg.ink,Math.max(11,12*u),'monospace','center');
    c.restore();
  }

  function night(c, {cfg, paths}, index, z, w, h) {
    const path = paths[0], p = path[index], history = cfg.history * sampleRate;
    const u = Math.max(.7, Math.min(1.3, Math.min(w,h)/490));
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 1; i < paths.length; i++) {
      trail(c, paths[i], index - history, index, z, 'rgba(79,191,162,.21)', .65*u);
    }
    // Broad bloom is restricted to the same path that emits the bright line.
    trail(c, path, index - history, index, z, 'rgba(70,205,148,.036)', 9*u);
    trail(c, path, index - history, index, z, 'rgba(96,233,177,.09)', 4*u);
    trail(c, path, index - history, index, z, 'rgba(129,245,198,.6)', 1.35*u);
    trail(c, path, index - 66, index, z, '#c6ffe4', 1.5*u);
    c.restore();
    links(c, p, z, cfg.paper, 6*u);
    links(c, p, z, '#cdf9e5', 2.6*u);
    for (const [x,y,r] of [[0,0,7],[p.x*z,p.y*z,8],[p.X*z,p.Y*z,10]]) {
      c.save(); c.shadowColor = '#8bfbd3'; c.shadowBlur = 12*u;
      circle(c, x, y, r*u, cfg.paper, cfg.accent, 1.5*u); c.restore();
      circle(c, x, y, r*.35*u, '#ddfff0');
    }
  }

  function folio(c, {cfg, paths}, index, z, w, h) {
    const path = paths[0], p = path[index], u = Math.max(.68, Math.min(1.25, Math.min(w,h)/500));
    const ink = cfg.ink, t0 = index - Math.round(cfg.history * sampleRate);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    // The fine construction lines show the hanging reference and radius.
    c.setLineDash([6*u, 5*u]);
    line(c, 0, -26*u, 0, z*1.7, 'rgba(36,75,134,.55)', .85*u);
    c.setLineDash([]);
    for (let j = 0; j < 5; j++) {
      const q = path[Math.max(0, Math.round(t0 + (index-t0)*j/5))];
      c.globalAlpha = .18+j*.042;
      links(c,q,z,ink,1.2*u); circle(c,q.X*z,q.Y*z,4*u,cfg.paper,ink,1*u);
    }
    c.globalAlpha = 1;
    c.setLineDash([1.1*u,3.5*u]); trail(c, path, t0,index,z,ink,1.25*u); c.setLineDash([]);
    // Fixed support, sectioned in the convention of a mechanics engraving.
    line(c,-22*u,-6*u,22*u,-6*u,ink,1.7*u);
    for(let j=-3;j<4;j++) line(c,(j*6-2)*u,-7*u,(j*6+3)*u,-15*u,ink,.9*u);
    line(c,0,-6*u,0,0,ink,2*u);
    for (const [x,y,X,Y] of [[0,0,p.x*z,p.y*z],[p.x*z,p.y*z,p.X*z,p.Y*z]]) {
      line(c,x,y,X,Y,ink,5.3*u);
      line(c,x,y,X,Y,cfg.paper,2.7*u);
    }
    [[0,0,5],[p.x*z,p.y*z,8.5],[p.X*z,p.Y*z,11.5]].forEach(([x,y,r])=>{
      circle(c,x,y,r*u,cfg.paper,ink,1.7*u);
      c.save(); c.beginPath(); c.arc(x,y,r*u-1,0,tau);c.clip();
      for (let j=-r*2;j<r*2;j+=3.3) line(c,x+(j-r)*u,y+r*u,x+(j+r)*u,y-r*u,ink,.7*u);
      c.restore();
      circle(c,x,y,r*u*.27,cfg.paper,ink,1*u);
    });
    const angle = Math.atan2(p.x,p.y), rad=z*.34;
    c.beginPath(); c.arc(0,0,rad, Math.PI/2,Math.PI/2-angle,angle>0); c.lineWidth=1.05*u;c.strokeStyle=ink;c.stroke();
    const thetaR=rad+12*u;
    c.save(); c.font='italic '+Math.max(13,16*u)+'px Georgia, serif'; c.fillStyle=ink;
    c.fillText('θ₁',Math.sin(angle/2)*thetaR-6*u,Math.cos(angle/2)*thetaR+4*u);
    const x=p.X*z,y=p.Y*z, side=p.X>=0 ? -1:1;
    c.textAlign=side===1?'left':'right';
    c.fillText('m₂',x+side*14*u,y-12*u);
    c.textAlign='left'; c.fillText('O',8*u,-12*u);
    c.fillText('ℓ₁',p.x*z*.50 + 10*u, p.y*z*.50 - 1*u);
    c.fillText('ℓ₂',(p.x+p.X)*z*.50 - 2*u,(p.y+p.Y)*z*.50+17*u);
    c.restore();c.restore();
  }

  function impact(c, {cfg, paths}, index,z,w,h) {
    const path=paths[0], p=path[index], u=Math.max(.68, Math.min(1.4,Math.min(w,h)/480));
    const history=Math.round(cfg.history*sampleRate);
    c.save(); c.lineCap='round';c.lineJoin='round';
    trail(c,path,index-history,index,z,cfg.ink,1.8*u);
    for(let j=0;j<7;j++) {
      const q=path[Math.max(0,Math.round(index-history+history*j/7))];
      // Each outlined silhouette is a prior exposure at equal time intervals.
      c.globalAlpha=.10+.56*(j/7);
      links(c,q,z,cfg.ink,2.3*u);
      circle(c,q.X*z,q.Y*z,(16+j*.8)*u,undefined,cfg.ink,2*u);
      circle(c,q.x*z,q.y*z,6*u,undefined,cfg.ink,1.5*u);
    }
    c.globalAlpha=1;
    links(c,p,z,cfg.ink,20*u);
    circle(c,0,0,15*u,cfg.ink);
    circle(c,0,0,4.4*u,cfg.paper);
    circle(c,p.x*z,p.y*z,22*u,cfg.ink);
    circle(c,p.x*z,p.y*z,7*u,cfg.paper);
    circle(c,p.X*z,p.Y*z,30*u,cfg.ink);
    circle(c,p.X*z,p.Y*z,8.4*u,cfg.paper);
    c.restore();
  }

  window.drawPendulumArt = (canvas, theme = 'instrument', progress = .5) => {
    if (!canvas || !styles[theme]) return;
    const c=canvas.getContext('2d');
    if (!c) return;
    const w=canvas.clientWidth, h=canvas.clientHeight;
    if (!w || !h) return;
    const dpr=Math.min(window.devicePixelRatio || 1,2);
    if (canvas.width!==Math.round(w*dpr) || canvas.height!==Math.round(h*dpr)) {
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    }
    c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,w,h);
    const asset=study(theme), {bounds,cfg}=asset;
    const compact=Math.min(w,h)<370, pad=(compact?.075:.07)*Math.min(w,h)+5;
    const margin=theme==='impact'?1.11:1.045;
    const z=Math.min((w-2*pad)/((bounds[2]-bounds[0])*margin),(h-2*pad)/((bounds[3]-bounds[1])*margin));
    const time=cfg.time+(Math.min(1,Math.max(0,progress))-.5)*cfg.span;
    const index=Math.round(time*sampleRate);
    c.save();
    c.translate((w-z*(bounds[0]+bounds[2]))/2,(h-z*(bounds[1]+bounds[3]))/2);
    ({instrument,night,folio,impact})[theme](c,asset,index,z,w,h);
    c.restore();
  };
})();
