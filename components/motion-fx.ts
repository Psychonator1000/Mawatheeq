// Canvas effects: the living backdrop (constellation or fireflies) and dot-web bursts on press.
// Decorative only: canvases ignore the pointer, cap their pixel ratio, sleep when idle or hidden,
// and draw a single still frame when motion is reduced or switched off.

type RGB = [number, number, number];
type Node = { x: number; y: number; vx: number; vy: number; r: number; phase: number; hue: number };
type Spark = { x: number; y: number; ox: number; oy: number; dx: number; dy: number; r: number; delay: number; color: RGB };
type Burst = { x: number; y: number; born: number; sparks: Spark[]; ring: number; color: RGB; strong: boolean; shape: string };
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
/** One cherry-blossom petal pointing up from the origin: rounded, with the notch at its tip. */
function petal(ctx: CanvasRenderingContext2D, len: number, light: string, deep: string) {
  const g = ctx.createLinearGradient(0, 0, 0, -len);
  g.addColorStop(0, deep); g.addColorStop(.7, light); g.addColorStop(1, light);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * .55, -len * .2, len * .6, -len * .85, len * .18, -len);
  ctx.lineTo(0, -len * .82); ctx.lineTo(-len * .18, -len);
  ctx.bezierCurveTo(-len * .6, -len * .85, -len * .55, -len * .2, 0, 0); ctx.fill();
}

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
    if (kind === 'bubbles') { nodes = Array.from({ length: Math.min(34, Math.round(w * h / 45000)) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .15, vy: -(.15 + Math.random() * .35), r: 8 + Math.random() * 34, phase: Math.random() * Math.PI * 2, hue: Math.random() })); return; }
    if (kind === 'sakura') { nodes = Array.from({ length: Math.min(42, Math.round(w * h / 32000)) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: .1 + Math.random() * .35, vy: .35 + Math.random() * .55, r: 6.5 + Math.random() * 7.5, phase: Math.random() * Math.PI * 2, hue: Math.random() })); return; }
    if (kind === 'phantom') { nodes = Array.from({ length: 16 }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: -(.3 + Math.random() * .6), vy: .15 + Math.random() * .35, r: 6 + Math.random() * 16, phase: Math.random() * Math.PI * 2, hue: Math.random() })); return; }
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
        if (kind === 'bubbles') { n.x += (n.vx + Math.sin(n.phase) * .25) * dt * speed; n.y += n.vy * dt * speed; }
        else if (kind === 'phantom') { n.x += n.vx * dt * speed; n.y += n.vy * dt * speed; }
        // Sakura: petals fall and sway, carried by a slow gust that comes and goes.
        else if (kind === 'sakura') { const gust = .55 + Math.sin(now / 5200) * .45; n.x += (n.vx * gust + Math.sin(n.phase * 1.3) * .45) * dt * speed; n.y += (n.vy + Math.cos(n.phase) * .12) * dt * speed; }
        else if (kind === 'fireflies') { n.x += (n.vx + Math.sin(n.phase) * .18) * dt * speed; n.y += n.vy * dt * speed; }
        else { n.x += n.vx * dt * speed; n.y += n.vy * dt * speed; }
        n.y -= s.scrollV * 1.6 * dt * (.4 + n.r / 3);
        if (near) {
          const dx = n.x - px, dy = n.y - py, d = Math.hypot(dx, dy);
          if (kind === 'phantom' ? false : kind === 'fireflies' ? d < 260 && d > 30 : d < 150 && d > .1) {
            const f = kind === 'fireflies' ? -.012 * (1 - d / 260) : 1.6 * (1 - d / 150);
            n.x += (kind === 'fireflies' ? dx * f : dx / d * f) * dt; n.y += (kind === 'fireflies' ? dy * f : dy / d * f) * dt;
          }
        }
        for (const wv of waves) {
          const age = (now - wv.born) / 1100, radius = easeOut(age) * 260, dx = n.x - wv.x, dy = n.y - wv.y, d = Math.hypot(dx, dy) || 1;
          if (Math.abs(d - radius) < 36) { const push = (1 - age) * 2.4 * dt; n.x += dx / d * push; n.y += dy / d * push; }
        }
        const m = n.r + 20;
        if (n.x < -m) n.x = w + m; else if (n.x > w + m) n.x = -m;
        if (n.y < -m) n.y = h + m; else if (n.y > h + m) n.y = -m;
      }
    }
    if (kind === 'bubbles') {
      // Frutiger Aero: glassy bubbles with a rim light and a bright highlight.
      for (const n of nodes) {
        const g = ctx.createRadialGradient(n.x - n.r * .3, n.y - n.r * .35, n.r * .1, n.x, n.y, n.r);
        g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(.55, 'rgba(160,225,255,.08)'); g.addColorStop(.85, 'rgba(120,205,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,.65)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(n.x - n.r * .38, n.y - n.r * .45, n.r * .28, n.r * .14, -.6, 0, Math.PI * 2); ctx.fill();
      }
    } else if (kind === 'sakura') {
      // Sakura: tumbling five-lobed petals in soft pinks; a few whole blossoms drift among them.
      for (const n of nodes) {
        ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(n.phase * .7 + n.hue * 6);
        const flip = Math.cos(n.phase * 1.6), tone = n.hue;
        ctx.globalAlpha = .7 + .3 * Math.abs(flip);
        if (tone > .9) {
          ctx.scale(1, .75 + .25 * Math.abs(flip));
          for (let k = 0; k < 5; k++) { ctx.rotate(Math.PI * 2 / 5); petal(ctx, n.r * .9, '#ffd6e2', '#f49ab9'); }
          ctx.fillStyle = '#e8708f'; ctx.beginPath(); ctx.arc(0, 0, n.r * .22, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.scale(.45 + .55 * Math.abs(flip), 1);
          petal(ctx, n.r * 1.5, tone > .55 ? '#ffe3ea' : '#ffd0de', tone > .3 ? '#f7a1bf' : '#ef86aa');
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'phantom') {
      // Persona: slowly turning red and black rays from the pointer side, with drifting stars.
      const cx = near ? px : w * .78, cy = near ? py : h * .3, turn = now / 9000, rays = 18, len = Math.hypot(w, h);
      for (let i = 0; i < rays; i++) {
        const a = turn + i / rays * Math.PI * 2;
        ctx.fillStyle = i % 2 ? 'rgba(230,0,18,.10)' : 'rgba(0,0,0,.10)';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.lineTo(cx + Math.cos(a + Math.PI / rays) * len, cy + Math.sin(a + Math.PI / rays) * len); ctx.closePath(); ctx.fill();
      }
      for (const n of nodes) {
        ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(n.phase + now / 1600);
        ctx.fillStyle = n.hue > .6 ? 'rgba(230,0,18,.7)' : n.hue > .3 ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.6)';
        ctx.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? n.r * .42 : n.r; ctx.lineTo(Math.cos(k * Math.PI / 5) * rr, Math.sin(k * Math.PI / 5) * rr); } ctx.closePath(); ctx.fill(); ctx.restore();
      }
    } else if (kind === 'fireflies') {
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
    if (!['constellation', 'fireflies', 'bubbles', 'phantom', 'sakura'].includes(s.mode)) { cancelAnimationFrame(frame); frame = 0; canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); return; }
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
      if (b.shape === 'dot') for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], c = pts[j], d = Math.hypot(a.s.x - c.s.x, a.s.y - c.s.y);
        if (d < 44 && a.alpha > 0 && c.alpha > 0) { ctx.strokeStyle = rgba(b.color, .42 * Math.min(a.alpha, c.alpha) * (1 - d / 44)); ctx.beginPath(); ctx.moveTo(a.s.x, a.s.y); ctx.lineTo(c.s.x, c.s.y); ctx.stroke(); }
      }
      for (const p of pts) if (p.alpha > 0) {
        const r = p.s.r * (1 - p.t * .5);
        if (b.shape === 'shard') { ctx.fillStyle = rgba(p.s.color, .95 * p.alpha); ctx.beginPath(); ctx.moveTo(p.s.x + p.s.dx * .06, p.s.y + p.s.dy * .06); ctx.lineTo(p.s.x - p.s.dy * .03, p.s.y + p.s.dx * .03); ctx.lineTo(p.s.x + p.s.dy * .03, p.s.y - p.s.dx * .03); ctx.closePath(); ctx.fill(); }
        else if (b.shape === 'petal') { ctx.save(); ctx.translate(p.s.x, p.s.y); ctx.rotate(Math.atan2(p.s.dy, p.s.dx) + Math.PI / 2 + p.t * 3); ctx.globalAlpha = .9 * p.alpha; petal(ctx, 7 + r * 2.2, '#ffe0ea', '#f07fa6'); ctx.restore(); ctx.globalAlpha = 1; }
        else if (b.shape === 'bubble') { ctx.strokeStyle = rgba(p.s.color, .8 * p.alpha); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.s.x, p.s.y, r * 2.2, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = `rgba(255,255,255,${(.7 * p.alpha).toFixed(3)})`; ctx.beginPath(); ctx.arc(p.s.x - r * .7, p.s.y - r * .7, r * .5, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = rgba(p.s.color, .85 * p.alpha); ctx.beginPath(); ctx.arc(p.s.x, p.s.y, r, 0, Math.PI * 2); ctx.fill(); }
      }
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
      const theme = document.documentElement.dataset.theme, shape = theme?.startsWith('phantom') ? 'shard' : theme === 'sky' ? 'bubble' : theme === 'rose' ? 'petal' : 'dot';
      if (shape === 'shard') for (const sp of sparks) { sp.dx *= 1.5; sp.dy *= 1.5; sp.color = Math.random() < .5 ? [230, 0, 18] : Math.random() < .5 ? [0, 0, 0] : [255, 255, 255]; }
      bursts.push({ x, y, born: performance.now(), sparks, ring: reach * .9, color: p.brand, strong, shape });
      if (!frame) frame = requestAnimationFrame(draw);
    },
    active: () => bursts.length,
    stop() { cancelAnimationFrame(frame); bursts.length = 0; },
  };
}
