/**
 * The live pattern of an accent panel. While the mouse is over the panel, or a ripple is still spreading, the panel's
 * pattern is drawn here as real lines: they lean away from the pointer, and a press sends a slow ripple through them
 * like water. When the panel is quiet again the canvas fades out and the still CSS pattern (with its breathing) shows.
 */
export type PatternKind = 'pinstripe' | 'grid' | 'columns' | 'stars';
type Group = { alpha: number; width: number; lines: number[][] };
type Ripple = { x: number; y: number; at: number };

const STEP = 8;
// Pointer: how far the lines feel it and how far they lean away.
const REACH = 130, LEAN = 15;
// Ripple: speed (px/s), wavelength, packet width, how long it lasts, how far lines move at first.
const SPEED = 150, WAVE = 44, PACKET = 70, LIFE = 3.2, LIFT = 9;

/** A segment cut into points every few pixels, so the line can bend. */
function seg(x1: number, y1: number, x2: number, y2: number, out: number[] = []) {
  const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / STEP));
  for (let i = out.length ? 1 : 0; i <= n; i++) out.push(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n);
  return out;
}
function ring(points: [number, number][]) {
  const out: number[] = [];
  points.forEach((p, i) => { const q = points[(i + 1) % points.length]; seg(p[0], p[1], q[0], q[1], out); });
  return out;
}

/** The lines of a pattern over a box of w×h, its tiles starting at (o,o) as the stylesheet's do. */
function build(kind: PatternKind, w: number, h: number, o: number): Group[] {
  const m = 30, x0 = -m, y0 = -m, x1 = w + m, y1 = h + m;
  const from = (size: number) => o - Math.ceil((o + m) / size) * size;
  if (kind === 'pinstripe') {
    const fine: number[][] = [], bold: number[][] = [];
    // Lines x − y = c every 8px; every fifth one (c a multiple of 40, wherever the tiles start) is brighter.
    for (let c = Math.floor((x0 - y1) / 8) * 8; c <= x1 - y0; c += 8) {
      const ya = Math.max(y0, x0 - c), yb = Math.min(y1, x1 - c);
      if (yb <= ya) continue;
      ((c % 40 + 40) % 40 === 0 ? bold : fine).push(seg(ya + c, ya, yb + c, yb));
    }
    return [{ alpha: .45, width: .7, lines: fine }, { alpha: 1, width: 1.1, lines: bold }];
  }
  if (kind === 'grid') {
    const lines: number[][] = [], marks: number[][] = [];
    for (let x = from(32) + .5; x <= x1; x += 32) lines.push(seg(x, y0, x, y1));
    for (let y = from(32) + .5; y <= y1; y += 32) lines.push(seg(x0, y, x1, y));
    for (let a = from(128); a <= x1 + 128; a += 128) for (let b = from(128); b <= y1 + 128; b += 128)
      for (const [cx, cy] of [[a, b], [a + 64.5, b + 64.5]]) { marks.push(seg(cx - 6.5, cy, cx + 6.5, cy)); marks.push(seg(cx, cy - 6.5, cx, cy + 6.5)); }
    return [{ alpha: .55, width: .8, lines }, { alpha: 1, width: 1.4, lines: marks }];
  }
  if (kind === 'columns') {
    const shafts: number[][] = [], rules: number[][] = [], caps: number[][] = [];
    for (let a = from(70); a <= x1; a += 70) for (let b = from(200); b <= y1; b += 200) {
      for (const x of [10.5, 15.5, 20.5, 25.5]) shafts.push(seg(a + x, b + 18, a + x, b + 182));
      for (const y of [8.5, 191.5]) rules.push(seg(a, b + y, a + 70, b + y));
      for (const y of [13.5, 186.5]) caps.push(seg(a + 4, b + y, a + 31, b + y));
    }
    return [{ alpha: 1, width: .8, lines: shafts }, { alpha: .8, width: .8, lines: rules }, { alpha: .6, width: .8, lines: caps }];
  }
  const R = 23, r = R * Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8), stars: number[][] = [], rings: number[][] = [];
  for (let a = from(64); a <= x1 + 64; a += 64) for (let b = from(64); b <= y1 + 64; b += 64)
    for (const [cx, cy] of [[a, b], [a + 32, b + 32]]) {
      stars.push(ring(Array.from({ length: 16 }, (_, k) => { const t = Math.PI / 8 * k - Math.PI / 2, d = k % 2 ? r : R; return [cx + d * Math.cos(t), cy + d * Math.sin(t)] as [number, number]; })));
      rings.push(ring(Array.from({ length: 8 }, (_, k) => { const t = Math.PI / 4 * k + Math.PI / 8; return [cx + 8 * Math.cos(t), cy + 8 * Math.sin(t)] as [number, number]; })));
    }
  return [{ alpha: 1, width: 1.1, lines: stars }, { alpha: .75, width: .8, lines: rings }];
}

export function createPatternField(host: HTMLElement, origin: number) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pattern-field'; canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let groups: Group[] = [], built = '', w = 0, h = 0, frame = 0, hovering = false, strength = 0, mx = -999, my = -999, sleepTimer = 0;
  const ripples: Ripple[] = [];
  const kind = () => (document.documentElement.dataset.pattern || 'pinstripe') as PatternKind | 'none';
  const fit = () => {
    const box = host.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), k = kind();
    if (k === 'none') return false;
    w = box.width; h = box.height;
    const key = `${k}:${Math.round(w)}:${Math.round(h)}:${dpr}`;
    if (key !== built) { built = key; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); groups = build(k, w, h, origin); }
    return true;
  };
  const wake = () => {
    clearTimeout(sleepTimer);
    if (!host.isConnected || !fit()) return;
    host.setAttribute('data-pattern-live', '');
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const draw = (now: number) => {
    frame = 0;
    if (!host.isConnected) return;
    strength += ((hovering ? 1 : 0) - strength) * .12;
    const t = now / 1000;
    for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].at > LIFE) ripples.splice(i, 1);
    ctx.clearRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, REACH * 1.6);
    glow.addColorStop(0, `rgba(255,246,232,${.16 + .2 * strength})`); glow.addColorStop(1, 'rgba(255,246,232,.16)');
    ctx.strokeStyle = strength > .01 ? glow : 'rgba(255,246,232,.16)'; ctx.lineJoin = 'round';
    const lean = LEAN * strength;
    for (const g of groups) {
      ctx.globalAlpha = g.alpha; ctx.lineWidth = g.width; ctx.beginPath();
      for (const line of g.lines) for (let i = 0; i < line.length; i += 2) {
        let x = line[i], y = line[i + 1];
        const px = x, py = y;
        if (lean > .05) { const vx = px - mx, vy = py - my, d = Math.hypot(vx, vy); if (d < REACH && d > .01) { const f = lean * (1 - d / REACH) ** 2 / d; x += vx * f; y += vy * f; } }
        for (const rp of ripples) {
          const age = t - rp.at, vx = px - rp.x, vy = py - rp.y, d = Math.hypot(vx, vy) || .01, phase = d - SPEED * age;
          if (Math.abs(phase) > PACKET * 2.5) continue;
          const a = LIFT * Math.exp(-(phase * phase) / (2 * PACKET * PACKET)) * Math.exp(-age / 1.3) * Math.min(1, age * 5) * Math.sin(phase * 2 * Math.PI / WAVE);
          x += vx / d * a; y += vy / d * a;
        }
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (hovering || strength > .01 || ripples.length) frame = requestAnimationFrame(draw);
    else { host.removeAttribute('data-pattern-live'); sleepTimer = window.setTimeout(() => ctx.clearRect(0, 0, w, h), 400); }
  };
  const local = (x: number, y: number) => { const box = host.getBoundingClientRect(); return [x - box.left, y - box.top] as const; };
  return {
    host,
    enter() { hovering = true; wake(); },
    move(x: number, y: number) { [mx, my] = local(x, y); if (hovering && !frame) wake(); },
    leave() { hovering = false; },
    press(x: number, y: number) { const [px, py] = local(x, y); ripples.push({ x: px, y: py, at: performance.now() / 1000 }); if (ripples.length > 4) ripples.shift(); wake(); },
    destroy() { cancelAnimationFrame(frame); clearTimeout(sleepTimer); host.removeAttribute('data-pattern-live'); canvas.remove(); },
  };
}
