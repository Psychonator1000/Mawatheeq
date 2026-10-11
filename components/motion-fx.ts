// Canvas effects: the living backdrop (constellation or fireflies) and dot-web bursts on press.
// Decorative only: canvases ignore the pointer, cap their pixel ratio, sleep when idle or hidden,
// and draw a single still frame when motion is reduced or switched off.

type RGB = [number, number, number];
type Node = { x: number; y: number; vx: number; vy: number; r: number; phase: number; hue: number };
type Spark = { x: number; y: number; ox: number; oy: number; dx: number; dy: number; r: number; delay: number; color: RGB };
type Burst = { x: number; y: number; born: number; sparks: Spark[]; ring: number; color: RGB; strong: boolean };
export type FxState = { mode: string; motion: string; reduced: boolean; pointerX: number; pointerY: number; pointerOn: boolean; scrollV: number };

const hexRgb = (value: string, fallback: RGB): RGB => {
  const v = value.trim();
  const m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const r = v.match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  return r ? [Number(r[1]), Number(r[2]), Number(r[3])] : fallback;
};
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round) as RGB;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function readPalette() {
  const css = getComputedStyle(document.documentElement);
  return { brand: hexRgb(css.getPropertyValue('--brand'), [116, 40, 59]), glow1: hexRgb(css.getPropertyValue('--glow-1'), [201, 138, 154]), glow2: hexRgb(css.getPropertyValue('--glow-2'), [216, 185, 143]) };
}

function sizeCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.min(1.5, window.devicePixelRatio || 1), w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** The ambient backdrop. Call `pulse` to send a shockwave through it from a press point. */
export function createBackdrop(canvas: HTMLCanvasElement, state: () => FxState) {
  let nodes: Node[] = [], frame = 0, last = 0, palette = readPalette(), kind = '';
  const waves: { x: number; y: number; born: number }[] = [];
  const seed = (w: number, h: number) => {
    const fireflies = kind === 'fireflies';
    const count = fireflies ? Math.min(46, Math.round(w * h / 30000)) : Math.min(120, Math.round(w * h / 13000));
    nodes = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * (fireflies ? .12 : .22), vy: fireflies ? -(.08 + Math.random() * .22) : (Math.random() - .5) * .22, r: fireflies ? 1.4 + Math.random() * 2.2 : .9 + Math.random() * 1.6, phase: Math.random() * Math.PI * 2, hue: Math.random() }));
  };
  const draw = (now: number, animate: boolean) => {
    const s = state(), { ctx, w, h } = sizeCanvas(canvas);
    if (!ctx) return;
    if (kind !== s.mode || !nodes.length) { kind = s.mode; seed(w, h); }
    const dt = Math.min(48, last ? now - last : 16) / 16; last = now;
    ctx.clearRect(0, 0, w, h);
    const live = animate && s.motion !== 'off' && !s.reduced, calm = s.motion === 'calm', speed = calm ? .35 : 1;
    const px = s.pointerX, py = s.pointerY, near = s.pointerOn && s.motion === 'full' && live;
    for (let i = waves.length - 1; i >= 0; i--) if (now - waves[i].born > 1100) waves.splice(i, 1);
    for (const n of nodes) {
      if (live) {
        n.phase += .02 * dt * speed;
        if (kind === 'fireflies') { n.x += (n.vx + Math.sin(n.phase) * .18) * dt * speed; n.y += n.vy * dt * speed; }
        else { n.x += n.vx * dt * speed; n.y += n.vy * dt * speed; }
        n.y -= s.scrollV * 1.6 * dt * (.4 + n.r / 3);
        if (near) {
          const dx = n.x - px, dy = n.y - py, d = Math.hypot(dx, dy);
          if (kind === 'fireflies' ? d < 260 && d > 30 : d < 150 && d > .1) {
            const f = kind === 'fireflies' ? -.012 * (1 - d / 260) : 1.6 * (1 - d / 150);
            n.x += (kind === 'fireflies' ? dx * f : dx / d * f) * dt; n.y += (kind === 'fireflies' ? dy * f : dy / d * f) * dt;
          }
        }
        for (const wv of waves) {
          const age = (now - wv.born) / 1100, radius = easeOut(age) * 260, dx = n.x - wv.x, dy = n.y - wv.y, d = Math.hypot(dx, dy) || 1;
          if (Math.abs(d - radius) < 36) { const push = (1 - age) * 2.4 * dt; n.x += dx / d * push; n.y += dy / d * push; }
        }
        if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
      }
    }
    if (kind === 'fireflies') {
      for (const n of nodes) {
        const tw = .45 + .55 * Math.sin(n.phase * 2.3), c = mix(palette.glow1, palette.glow2, n.hue), g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 7);
        g.addColorStop(0, rgba(c, .55 * tw)); g.addColorStop(.3, rgba(c, .2 * tw)); g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba(mix(c, [255, 255, 255], .5), .75 * tw); ctx.beginPath(); ctx.arc(n.x, n.y, n.r * .8, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      const max = 128, max2 = max * max;
      ctx.lineWidth = .8;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < max2) { ctx.strokeStyle = rgba(palette.brand, .16 * (1 - Math.sqrt(d2) / max)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        if (near) { const d = Math.hypot(a.x - px, a.y - py); if (d < 190) { ctx.strokeStyle = rgba(palette.brand, .3 * (1 - d / 190)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(px, py); ctx.stroke(); } }
      }
      for (const n of nodes) { ctx.fillStyle = rgba(mix(palette.brand, palette.glow1, n.hue * .6), .34 + .2 * Math.sin(n.phase)); ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill(); }
      if (near) { ctx.fillStyle = rgba(palette.brand, .5); ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); }
    }
  };
  const loop = (now: number) => { frame = 0; const s = state(); if (document.hidden || s.motion === 'off' || s.reduced) return; draw(now, true); frame = requestAnimationFrame(loop); };
  const sync = () => {
    palette = readPalette(); const s = state();
    if (s.mode !== 'constellation' && s.mode !== 'fireflies') { cancelAnimationFrame(frame); frame = 0; canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); return; }
    if (s.motion === 'off' || s.reduced) { cancelAnimationFrame(frame); frame = 0; draw(performance.now(), false); return; }
    if (!frame && !document.hidden) { last = 0; frame = requestAnimationFrame(loop); }
  };
  const onResize = () => { nodes = []; sync(); };
  addEventListener('resize', onResize, { passive: true }); document.addEventListener('visibilitychange', sync);
  sync();
  return {
    sync,
    pulse(x: number, y: number) { if (waves.length < 6) waves.push({ x, y, born: performance.now() }); },
    stop() { cancelAnimationFrame(frame); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', sync); },
  };
}

/** Dot-web bursts that spread around the press point, linking neighbouring sparks as they fly. */
export function createBursts(canvas: HTMLCanvasElement) {
  const bursts: Burst[] = [];
  let frame = 0;
  const LIFE = 760;
  const draw = (now: number) => {
    frame = 0;
    const { ctx, w, h } = sizeCanvas(canvas);
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    for (let i = bursts.length - 1; i >= 0; i--) if (now - bursts[i].born > LIFE + 200) bursts.splice(i, 1);
    for (const b of bursts) {
      const age = (now - b.born) / LIFE;
      // A dotted ring ripples outward first.
      if (age < 1) {
        const rr = easeOut(Math.min(1, age * 1.3)) * b.ring, dots = Math.max(14, Math.round(rr / 3.2));
        ctx.fillStyle = rgba(b.color, .5 * (1 - age));
        for (let k = 0; k < dots; k++) { const a = k / dots * Math.PI * 2; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, 1.1, 0, Math.PI * 2); ctx.fill(); }
      }
      const pts = b.sparks.map(s => {
        const t = Math.max(0, Math.min(1, (now - b.born - s.delay) / LIFE)), e = easeOut(t);
        s.x = b.x + s.ox + s.dx * e; s.y = b.y + s.oy + s.dy * e + t * t * 8;
        return { s, t, alpha: t <= 0 ? 0 : (1 - t) * (t < .12 ? t / .12 : 1) };
      });
      ctx.lineWidth = .7;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], c = pts[j], d = Math.hypot(a.s.x - c.s.x, a.s.y - c.s.y);
        if (d < 44 && a.alpha > 0 && c.alpha > 0) { ctx.strokeStyle = rgba(b.color, .42 * Math.min(a.alpha, c.alpha) * (1 - d / 44)); ctx.beginPath(); ctx.moveTo(a.s.x, a.s.y); ctx.lineTo(c.s.x, c.s.y); ctx.stroke(); }
      }
      for (const p of pts) if (p.alpha > 0) { ctx.fillStyle = rgba(p.s.color, .85 * p.alpha); ctx.beginPath(); ctx.arc(p.s.x, p.s.y, p.s.r * (1 - p.t * .5), 0, Math.PI * 2); ctx.fill(); }
    }
    if (bursts.length) frame = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, w, h);
  };
  return {
    fire(x: number, y: number, size: number, strong: boolean) {
      if (bursts.length > 8) bursts.shift();
      const p = readPalette(), count = strong ? 22 : 16, reach = Math.max(34, Math.min(90, size * .55));
      const sparks: Spark[] = Array.from({ length: count }, (_, i) => {
        const a = i / count * Math.PI * 2 + (Math.random() - .5) * .5, dist = reach * (.55 + Math.random() * .7), start = 4 + Math.random() * 8;
        return { x, y, ox: Math.cos(a) * start, oy: Math.sin(a) * start, dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, r: .9 + Math.random() * 1.7, delay: Math.random() * 90, color: Math.random() < .55 ? p.brand : mix(p.glow1, p.brand, .3) };
      });
      bursts.push({ x, y, born: performance.now(), sparks, ring: reach * .9, color: p.brand, strong });
      if (!frame) frame = requestAnimationFrame(draw);
    },
    active: () => bursts.length,
    stop() { cancelAnimationFrame(frame); bursts.length = 0; },
  };
}
