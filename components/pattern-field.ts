/**
 * One patterned sheet lies under the whole screen, and every accent surface (the menu, side panels, featured figures,
 * primary buttons) is a window cut into it: each shows the part of the pattern at its place on the screen, so the lines
 * run on from one window to the next. While the mouse is over a window, or a ripple is still spreading, the sheet is
 * drawn here as real lines in every window on screen: they lean away from the pointer, and a press anywhere sends one
 * slow ripple through them like water. When all is quiet the canvases hide and the still CSS pattern shows.
 */
export type PatternKind = 'pinstripe' | 'grid' | 'columns' | 'stars';
type Group = { alpha: number; width: number; lines: number[][] };
type Ripple = { x: number; y: number; at: number };

const STEP = 8;
// Pointer: how far the lines feel it and how far they lean away.
const REACH = 110, LEAN = 6;
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

/** Elements that are windows onto the sheet: large panels, and small keys whose ::before is taken by their sheen. */
export const PATTERN_PANELS = '.sec-agenda.panel,[data-sidebar=sidebar],.stat.featured,.ledger-balance,.payroll-totals>div';
export const PATTERN_KEYS = '.btn.primary,.case-category.active';
export const PATTERNED = PATTERN_PANELS + ',' + PATTERN_KEYS;
// How far the still pattern shifts toward the mouse (compact.css uses the same number).
const DRIFT = 16;

/** The lines of the sheet that cross the screen box [X0,X1]×[Y0,Y1]; the tiles start at the screen's corner. */
export function build(kind: PatternKind, X0: number, Y0: number, X1: number, Y1: number): Group[] {
  const m = 30, x0 = X0 - m, y0 = Y0 - m, x1 = X1 + m, y1 = Y1 + m;
  const fx = (size: number) => Math.floor(x0 / size) * size, fy = (size: number) => Math.floor(y0 / size) * size;
  if (kind === 'pinstripe') {
    const fine: number[][] = [], bold: number[][] = [];
    // Lines x − y = c every 8px; every fifth one (c a multiple of 40) is brighter.
    for (let c = Math.floor((x0 - y1) / 8) * 8; c <= x1 - y0; c += 8) {
      const ya = Math.max(y0, x0 - c), yb = Math.min(y1, x1 - c);
      if (yb <= ya) continue;
      ((c % 40 + 40) % 40 === 0 ? bold : fine).push(seg(ya + c, ya, yb + c, yb));
    }
    return [{ alpha: .45, width: .7, lines: fine }, { alpha: 1, width: 1.1, lines: bold }];
  }
  if (kind === 'grid') {
    const lines: number[][] = [], marks: number[][] = [];
    for (let x = fx(32) + .5; x <= x1; x += 32) lines.push(seg(x, y0, x, y1));
    for (let y = fy(32) + .5; y <= y1; y += 32) lines.push(seg(x0, y, x1, y));
    for (let a = fx(128); a <= x1 + 128; a += 128) for (let b = fy(128); b <= y1 + 128; b += 128)
      for (const [cx, cy] of [[a, b], [a + 64.5, b + 64.5]]) { marks.push(seg(cx - 6.5, cy, cx + 6.5, cy)); marks.push(seg(cx, cy - 6.5, cx, cy + 6.5)); }
    return [{ alpha: .55, width: .8, lines }, { alpha: 1, width: 1.4, lines: marks }];
  }
  if (kind === 'columns') {
    const shafts: number[][] = [], rules: number[][] = [], caps: number[][] = [];
    for (let a = fx(70); a <= x1; a += 70) for (let b = fy(200); b <= y1; b += 200) {
      for (const x of [10.5, 15.5, 20.5, 25.5]) shafts.push(seg(a + x, b + 18, a + x, b + 182));
      for (const y of [8.5, 191.5]) rules.push(seg(a, b + y, a + 70, b + y));
      for (const y of [13.5, 186.5]) caps.push(seg(a + 4, b + y, a + 31, b + y));
    }
    return [{ alpha: 1, width: .8, lines: shafts }, { alpha: .8, width: .8, lines: rules }, { alpha: .6, width: .8, lines: caps }];
  }
  const R = 23, r = R * Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8), stars: number[][] = [], rings: number[][] = [];
  for (let a = fx(64); a <= x1 + 64; a += 64) for (let b = fy(64); b <= y1 + 64; b += 64)
    for (const [cx, cy] of [[a, b], [a + 32, b + 32]]) {
      stars.push(ring(Array.from({ length: 16 }, (_, k) => { const t = Math.PI / 8 * k - Math.PI / 2, d = k % 2 ? r : R; return [cx + d * Math.cos(t), cy + d * Math.sin(t)] as [number, number]; })));
      rings.push(ring(Array.from({ length: 8 }, (_, k) => { const t = Math.PI / 4 * k + Math.PI / 8; return [cx + 8 * Math.cos(t), cy + 8 * Math.sin(t)] as [number, number]; })));
    }
  return [{ alpha: 1, width: 1.1, lines: stars }, { alpha: .75, width: .8, lines: rings }];
}

type Window = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; groups: Group[]; built: string; box: DOMRect | null };

export function createPatternSheet() {
  const root = document.documentElement, windows = new Map<HTMLElement, Window>(), placed = new WeakMap<HTMLElement, string>();
  const ripples: Ripple[] = [];
  let frame = 0, placeFrame = 0, hovering = false, strength = 0, mx = -999, my = -999;
  const kind = () => (root.dataset.pattern || 'pinstripe') as PatternKind | 'none';
  // Each window's place on the screen, which the still pattern is shifted by (--vx/--vy) so the windows line up.
  const place = () => {
    placeFrame = 0;
    for (const el of document.querySelectorAll<HTMLElement>(PATTERNED)) {
      const r = el.getBoundingClientRect(), v = `${r.left.toFixed(1)},${r.top.toFixed(1)}`;
      if (placed.get(el) === v) continue;
      placed.set(el, v); el.style.setProperty('--vx', r.left.toFixed(1) + 'px'); el.style.setProperty('--vy', r.top.toFixed(1) + 'px');
    }
  };
  const replace = () => { if (!placeFrame) placeFrame = requestAnimationFrame(place); };
  const watcher = new MutationObserver(replace);
  watcher.observe(document.body, { childList: true, subtree: true });
  // Panels also slide a little while the page scrolls and as sections animate in; measure again once they settle.
  let settle = 0;
  const later = () => { replace(); clearTimeout(settle); settle = window.setTimeout(replace, 450); };
  const events = ['scroll', 'resize', 'animationend', 'transitionend'] as const;
  for (const e of events) addEventListener(e, later, { capture: true, passive: true });
  replace();
  // The still pattern's shift toward the mouse, as the stylesheet computes it.
  const shift = () => {
    if (!root.hasAttribute('data-pointer') || root.dataset.motion === 'off') return [0, 0];
    const v = (n: string) => (parseFloat(root.style.getPropertyValue(n)) || .5) - .5;
    return [v('--ax') * -DRIFT, v('--ay') * -DRIFT];
  };
  const windowOf = (el: HTMLElement) => {
    let w = windows.get(el);
    if (!w) {
      const canvas = document.createElement('canvas');
      canvas.className = 'pattern-field'; canvas.setAttribute('aria-hidden', 'true'); el.append(canvas);
      w = { canvas, ctx: canvas.getContext('2d')!, groups: [], built: '', box: null }; windows.set(el, w);
    }
    return w;
  };
  const sleep = (el: HTMLElement, w: Window) => { el.removeAttribute('data-pattern-live'); w.ctx.setTransform(1, 0, 0, 1, 0, 0); w.ctx.clearRect(0, 0, w.canvas.width, w.canvas.height); };
  const draw = (now: number) => {
    frame = 0;
    for (const [el, w] of windows) if (!el.isConnected) { w.canvas.remove(); windows.delete(el); }
    const k = kind(), t = now / 1000;
    for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].at > LIFE) ripples.splice(i, 1);
    strength += ((hovering ? 1 : 0) - strength) * .12;
    const active = k !== 'none' && (hovering || strength > .01 || ripples.length > 0);
    if (!active) { strength = 0; for (const [el, w] of windows) sleep(el, w); return; }
    const [ox, oy] = shift(), dpr = Math.min(2, devicePixelRatio || 1), lean = LEAN * strength;
    // The still pattern shows at .34 (.48 under the pointer) of its .3 strength; match it.
    const base = .102 + .042 * strength;
    const seen = new Set<HTMLElement>();
    for (const el of document.querySelectorAll<HTMLElement>(PATTERNED)) {
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) continue;
      const w = windowOf(el), ctx = w.ctx; seen.add(el);
      const size = `${Math.round(box.width * dpr)}x${Math.round(box.height * dpr)}`;
      if (w.canvas.dataset.size !== size) { w.canvas.dataset.size = size; w.canvas.width = Math.round(box.width * dpr); w.canvas.height = Math.round(box.height * dpr); }
      const key = `${k}:${box.left.toFixed(1)}:${box.top.toFixed(1)}:${size}`;
      if (key !== w.built) { w.built = key; w.groups = build(k, box.left, box.top, box.right, box.bottom); }
      // Drawn in screen coordinates, so every window shows its own part of the one sheet.
      ctx.setTransform(dpr, 0, 0, dpr, -box.left * dpr, -box.top * dpr);
      ctx.clearRect(box.left, box.top, box.width, box.height);
      const glow = ctx.createRadialGradient(mx, my, 0, mx, my, REACH * 1.6);
      glow.addColorStop(0, `rgba(255,255,255,${base + .06 * strength})`); glow.addColorStop(1, `rgba(255,255,255,${base})`);
      ctx.strokeStyle = strength > .01 ? glow : `rgba(255,255,255,${base})`; ctx.lineJoin = 'round';
      for (const g of w.groups) {
        ctx.globalAlpha = g.alpha; ctx.lineWidth = g.width; ctx.beginPath();
        for (const line of g.lines) for (let i = 0; i < line.length; i += 2) {
          let x = line[i] + ox, y = line[i + 1] + oy;
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
      el.setAttribute('data-pattern-live', '');
    }
    for (const [el, w] of windows) if (!seen.has(el)) sleep(el, w);
    frame = requestAnimationFrame(draw);
  };
  const wake = () => { if (!frame && kind() !== 'none') frame = requestAnimationFrame(draw); };
  return {
    move(x: number, y: number) { mx = x; my = y; },
    hover(on: boolean) { if (on !== hovering) { hovering = on; if (on) wake(); } },
    /** A press anywhere: the ripple runs under the whole screen and shows through every window it reaches. */
    press(x: number, y: number) { ripples.push({ x, y, at: performance.now() / 1000 }); if (ripples.length > 4) ripples.shift(); wake(); },
    destroy() {
      cancelAnimationFrame(frame); cancelAnimationFrame(placeFrame); clearTimeout(settle); watcher.disconnect();
      for (const e of events) removeEventListener(e, later, { capture: true });
      for (const [el, w] of windows) { el.removeAttribute('data-pattern-live'); w.canvas.remove(); }
      windows.clear();
    },
  };
}
