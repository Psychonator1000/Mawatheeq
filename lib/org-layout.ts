// «فريق المكتب» as a board: where every box sits. Boxes placed by hand keep their place; every other box arranges itself
// under its head, following the way the head's branch grows (down, the default, or to the left or right). A box that
// arranges itself under a head moved by hand moves with him. People with nobody under them sit together in one block
// (a grid) under their head. Coordinates are board pixels; a box's position is its top left corner.

export type Flow = 'down' | 'left' | 'right';
export type Point = { x: number; y: number };
export type Group = { parent: string; keys: string[]; x: number; y: number; w: number; h: number };
export type Board = { at: Map<string, Point>; groups: Group[]; flow: (key: string) => Flow };

export const BOX_W = 176, BOX_H = 92, GRID = 20;
const GAP_X = 28, GAP_Y = 56, LEAF_GAP = 12, PAD = 10, ROOT_GAP = 72;
export const snap = (v: number) => Math.round(v / GRID) * GRID;

/**
 * `kids`: each node's children in their order ('' for the top); `isLeaf`: a person with nobody under him (sections are
 * never leaves); `placed`: boxes put by hand; `flows`: the heads whose branch grows sideways.
 */
export function layoutBoard({ kids, isLeaf, placed, flows }: {
  kids: Map<string, string[]>; isLeaf: (key: string) => boolean; placed: Record<string, [number, number]>; flows: Record<string, Flow>;
}): Board {
  const flow = (k: string): Flow => flows[k] || 'down';
  const free = (k: string) => !placed[k];
  type Size = { w: number; h: number };
  const sizes = new Map<string, Size>(), blocks = new Map<string, { cols: number; rows: number; w: number; h: number; keys: string[] }>();
  // The children laid out with their head: heads (and sections) one by one, the rest in one block.
  const parts = (k: string) => {
    const all = (kids.get(k) || []).filter(free), leaves = all.filter(isLeaf), heads = all.filter(c => !isLeaf(c));
    return { heads, leaves };
  };
  const measure = (k: string): Size => {
    const { heads, leaves } = parts(k), dir = flow(k), list: Size[] = heads.map(measure);
    if (leaves.length) {
      const cols = Math.min(leaves.length, dir === 'down' ? 4 : 2), rows = Math.ceil(leaves.length / cols);
      const b = { cols, rows, w: cols * BOX_W + (cols - 1) * LEAF_GAP + 2 * PAD, h: rows * BOX_H + (rows - 1) * LEAF_GAP + 2 * PAD, keys: leaves };
      blocks.set(k, b); list.push(b);
    }
    let s: Size;
    if (!list.length) s = { w: BOX_W, h: BOX_H };
    else if (dir === 'down') { const cw = list.reduce((t, p) => t + p.w, 0) + GAP_X * (list.length - 1); s = { w: Math.max(BOX_W, cw), h: BOX_H + GAP_Y + Math.max(...list.map(p => p.h)) }; }
    else { const ch = list.reduce((t, p) => t + p.h, 0) + GAP_X * (list.length - 1); s = { w: BOX_W + GAP_Y + Math.max(...list.map(p => p.w)), h: Math.max(BOX_H, ch) }; }
    sizes.set(k, s);
    return s;
  };
  const auto = new Map<string, Point>(), groups: Group[] = [];
  // The order reads right to left: the first child is the rightmost (down) or the topmost (sideways).
  const place = (k: string, x: number, y: number) => {
    const s = sizes.get(k)!, dir = flow(k), { heads } = parts(k), block = blocks.get(k);
    const items: { key?: string; size: Size }[] = [...heads.map(h => ({ key: h, size: sizes.get(h)! })), ...(block ? [{ size: block }] : [])];
    const put = (it: { key?: string; size: Size }, px: number, py: number) => {
      if (it.key) { place(it.key, px, py); return; }
      const b = block!;
      groups.push({ parent: k, keys: b.keys, x: px, y: py, w: b.w, h: b.h });
      b.keys.forEach((c, i) => { const col = i % b.cols, row = Math.floor(i / b.cols);
        auto.set(c, { x: px + b.w - PAD - BOX_W - col * (BOX_W + LEAF_GAP), y: py + PAD + row * (BOX_H + LEAF_GAP) }); });
    };
    if (dir === 'down') {
      auto.set(k, { x: x + s.w / 2 - BOX_W / 2, y });
      const cw = items.reduce((t, p) => t + p.size.w, 0) + GAP_X * Math.max(0, items.length - 1);
      let right = x + (s.w + cw) / 2;
      for (const it of items) { right -= it.size.w; put(it, right, y + BOX_H + GAP_Y); right -= GAP_X; }
    } else {
      const ch = items.reduce((t, p) => t + p.size.h, 0) + GAP_X * Math.max(0, items.length - 1);
      auto.set(k, { x: dir === 'right' ? x : x + s.w - BOX_W, y: y + s.h / 2 - BOX_H / 2 });
      let top = y + (s.h - ch) / 2;
      for (const it of items) { put(it, dir === 'right' ? x + BOX_W + GAP_Y : x + s.w - BOX_W - GAP_Y - it.size.w, top); top += it.size.h + GAP_X; }
    }
  };
  // The top: every head of a tree side by side, right to left; heads put by hand are placed on their own.
  const roots = kids.get('') || [];
  let right = 0;
  for (const r of roots) { const s = measure(r); if (!free(r)) continue; right -= s.w; place(r, right, 0); right -= ROOT_GAP; }
  // Every box put by hand (at the top or anywhere below) lays out its own team around itself.
  const known = new Set([...kids.keys(), ...[...kids.values()].flat()]);
  for (const k of Object.keys(placed)) if (known.has(k) && !auto.has(k)) { measure(k); place(k, 0, 0); }
  // Boxes put by hand, and whatever arranges itself under them, keep the offset they have from their head.
  const parent = new Map<string, string>();
  for (const [p, list] of kids) for (const c of list) if (p) parent.set(c, p);
  const at = new Map<string, Point>();
  const resolve = (k: string): Point => {
    const done = at.get(k); if (done) return done;
    let p: Point;
    if (placed[k]) p = { x: placed[k][0], y: placed[k][1] };
    else {
      const up = parent.get(k), mine = auto.get(k) || { x: 0, y: 0 };
      if (!up) p = mine;
      else { const a = auto.get(up) || { x: 0, y: 0 }, r = resolve(up); p = { x: r.x + mine.x - a.x, y: r.y + mine.y - a.y }; }
    }
    at.set(k, p);
    return p;
  };
  for (const k of auto.keys()) resolve(k);
  for (const k of Object.keys(placed)) if (parent.has(k) || roots.includes(k)) resolve(k);
  for (const g of groups) { const a = auto.get(g.parent), r = at.get(g.parent); if (a && r) { g.x += r.x - a.x; g.y += r.y - a.y; } }
  return { at, groups, flow };
}
