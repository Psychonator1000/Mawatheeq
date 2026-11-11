// Draws a Word file (.docx) in the page the way Word lays it out: pages of the file's size and margins, paragraphs with
// their right-to-left direction, indents, spacing, tabs and fonts, tables with their borders, and the boxes and lines
// Word places on the page (text boxes, the side column's line, the shaded date box) where Word places them: measured
// from the paragraph they are attached to. Built for the office's own templates; anything they do not use is skipped.
//
// Every piece of text from the document itself (each <w:t>) becomes <span data-t="n">, n being its place among the
// document's <w:t> elements, so edits made on the page can be written back into the same file (see word-preview.ts).
import type PizZipType from 'pizzip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PAGE_GAP = 16;
const tw = (v: number) => v / 15; // twentieths of a point → px
const emu = (v: number) => v / 9525; // EMU → px
const num = (v: string | null | undefined, d = 0) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : d; };

const kids = (el: Element | null | undefined, name?: string) => el ? Array.from(el.children).filter(c => !name || c.localName === name) : [];
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0] as Element | undefined;
const deep = (el: Element | null | undefined, name: string) => el ? Array.from(el.getElementsByTagName('*')).find(c => c.localName === name) : undefined;
const wv = (el: Element | null | undefined, attr = 'val') => el ? el.getAttributeNS(W, attr) ?? el.getAttribute('w:' + attr) : null;
const on = (el: Element | undefined) => !!el && !['0', 'false', 'off', 'none'].includes(wv(el) ?? 'true');

type Border = { style: string; width: number; color: string; space: number };
type PPr = {
  bidi?: boolean; jc?: string; before?: number; after?: number; line?: number; lineRule?: string; start?: number; end?: number;
  first?: number; hanging?: number; tabs?: { pos: number; val: string }[]; pageBreak?: boolean; shd?: string; borders?: Record<string, Border>;
};
type RPr = {
  ascii?: string; cs?: string; asciiTheme?: string; csTheme?: string; b?: boolean; bCs?: boolean; i?: boolean; iCs?: boolean; u?: string; sz?: number; szCs?: number;
  color?: string; highlight?: string; shd?: string; vanish?: boolean; rtl?: boolean; csFlag?: boolean; caps?: boolean; strike?: boolean; vert?: string;
};
type Style = { type: string; basedOn?: string; pPr?: Element; rPr?: Element; tblPr?: Element };
type Anchor = { el: HTMLElement; para: HTMLElement | null; page?: number; h: { rel: string; off?: number; align?: string }; v: { rel: string; off?: number; align?: string }; w: number; h2: number; behind: boolean };
type Ctx = {
  styles: Map<string, Style>; defaultPara?: string; pDefault?: Element; rDefault?: Element; theme: Record<string, string>;
  index: Map<Element, number> | null; anchors: Anchor[]; page?: number; zip: PizZipType; rels: Map<string, string>; dir: string; tblStyle?: string;
};

const HIGHLIGHT: Record<string, string> = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff' };
const color = (v: string | null | undefined) => !v || v === 'auto' ? undefined : /^[0-9a-f]{6}$/i.test(v) ? '#' + v : v;

function parseBorder(el: Element | undefined): Border | undefined {
  if (!el) return undefined;
  const v = wv(el) || 'none';
  if (v === 'nil' || v === 'none') return { style: 'none', width: 0, color: '', space: 0 };
  return { style: v, width: num(wv(el, 'sz'), 4) / 8 * 4 / 3, color: color(wv(el, 'color')) || '#000', space: num(wv(el, 'space')) * 4 / 3 };
}
function css(b: Border | undefined) {
  if (!b || b.style === 'none') return 'none';
  const kind = /double|Gap|triple/i.test(b.style) ? 'double' : /dot/i.test(b.style) ? 'dotted' : /dash/i.test(b.style) ? 'dashed' : 'solid';
  return `${kind === 'double' ? Math.max(3, b.width) : Math.max(1, b.width)}px ${kind} ${b.color}`;
}

function readPPr(el: Element | undefined, p: PPr) {
  if (!el) return p;
  for (const c of kids(el)) {
    switch (c.localName) {
      case 'bidi': p.bidi = on(c); break;
      case 'jc': p.jc = wv(c) || undefined; break;
      case 'spacing':
        if (wv(c, 'before') != null) p.before = num(wv(c, 'before'));
        if (wv(c, 'after') != null) p.after = num(wv(c, 'after'));
        if (wv(c, 'line') != null) { p.line = num(wv(c, 'line')); p.lineRule = wv(c, 'lineRule') || 'auto'; }
        break;
      case 'ind': {
        const s = wv(c, 'start') ?? wv(c, 'left'), e = wv(c, 'end') ?? wv(c, 'right');
        if (s != null) p.start = num(s); if (e != null) p.end = num(e);
        if (wv(c, 'firstLine') != null) { p.first = num(wv(c, 'firstLine')); p.hanging = 0; }
        if (wv(c, 'hanging') != null) { p.hanging = num(wv(c, 'hanging')); if (!num(wv(c, 'firstLine'))) p.first = 0; }
        break;
      }
      case 'tabs': {
        const list = [...(p.tabs || [])];
        for (const t of kids(c, 'tab')) {
          const pos = num(wv(t, 'pos')), val = wv(t) || 'left', at = list.findIndex(x => x.pos === pos);
          if (at >= 0) list.splice(at, 1);
          if (val !== 'clear') list.push({ pos, val });
        }
        p.tabs = list.sort((a, b) => a.pos - b.pos);
        break;
      }
      case 'pageBreakBefore': p.pageBreak = on(c); break;
      case 'shd': p.shd = color(wv(c, 'fill')); break;
      case 'pBdr': p.borders = { ...(p.borders || {}) }; for (const b of kids(c)) p.borders[b.localName] = parseBorder(b)!; break;
    }
  }
  return p;
}
function readRPr(el: Element | undefined, r: RPr) {
  if (!el) return r;
  for (const c of kids(el)) {
    switch (c.localName) {
      case 'rFonts':
        if (wv(c, 'ascii')) { r.ascii = wv(c, 'ascii')!; r.asciiTheme = undefined; } else if (wv(c, 'asciiTheme')) r.asciiTheme = wv(c, 'asciiTheme')!;
        if (wv(c, 'cs')) { r.cs = wv(c, 'cs')!; r.csTheme = undefined; } else if (wv(c, 'cstheme')) r.csTheme = wv(c, 'cstheme')!;
        break;
      case 'b': r.b = on(c); break; case 'bCs': r.bCs = on(c); break;
      case 'i': r.i = on(c); break; case 'iCs': r.iCs = on(c); break;
      case 'u': r.u = wv(c) || 'single'; break;
      case 'sz': r.sz = num(wv(c), 22); break; case 'szCs': r.szCs = num(wv(c), 22); break;
      case 'color': r.color = color(wv(c)); break;
      case 'highlight': r.highlight = HIGHLIGHT[wv(c) || ''] ; break;
      case 'shd': r.shd = color(wv(c, 'fill')); break;
      case 'vanish': r.vanish = on(c); break;
      case 'rtl': r.rtl = on(c); break; case 'cs': r.csFlag = on(c); break;
      case 'caps': r.caps = on(c); break; case 'strike': r.strike = on(c); break;
      case 'vertAlign': r.vert = wv(c) || undefined; break;
    }
  }
  return r;
}
function chain(ctx: Ctx, id: string | undefined): Style[] {
  const out: Style[] = []; const seen = new Set<string>();
  for (let s = id ? ctx.styles.get(id) : undefined; s && out.length < 20; s = s.basedOn ? ctx.styles.get(s.basedOn) : undefined) {
    out.unshift(s); if (s.basedOn) { if (seen.has(s.basedOn)) break; seen.add(s.basedOn); }
  }
  return out;
}
function paraProps(ctx: Ctx, p: Element) {
  const pPr = kid(p, 'pPr'), own = wv(kid(pPr, 'pStyle')), sid = own || ctx.defaultPara;
  const pp: PPr = {}, rp: RPr = {};
  readPPr(ctx.pDefault, pp); readRPr(ctx.rDefault, rp);
  // Inside a table, its style's paragraph settings (such as no space after) come over the default paragraph style.
  const table = chain(ctx, ctx.tblStyle), para = chain(ctx, sid);
  for (const s of own ? [...table, ...para] : [...para, ...table]) { readPPr(s.pPr, pp); readRPr(s.rPr, rp); }
  readPPr(pPr, pp);
  return { pp, rp, mark: readRPr(kid(pPr, 'rPr'), { ...rp }) };
}
function runProps(ctx: Ctx, r: Element, base: RPr) {
  const rPr = kid(r, 'rPr'), rp = { ...base };
  for (const s of chain(ctx, wv(kid(rPr, 'rStyle')) || undefined)) readRPr(s.rPr, rp);
  return readRPr(rPr, rp);
}

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
function font(ctx: Ctx, rp: RPr, text: string) {
  const complex = rp.rtl || rp.csFlag || ARABIC.test(text);
  const name = complex ? rp.cs || ctx.theme[rp.csTheme || 'minorBidi'] : rp.ascii || ctx.theme[rp.asciiTheme || 'minorHAnsi'];
  const size = (complex ? rp.szCs ?? rp.sz : rp.sz) ?? 22;
  return { family: `${name ? `"${name}", ` : ''}"Simplified Arabic", "Traditional Arabic", Arial, sans-serif`, px: size / 2 * 4 / 3, bold: complex ? rp.bCs ?? rp.b : rp.b, italic: complex ? rp.iCs ?? rp.i : rp.i };
}
function styleRun(el: HTMLElement, ctx: Ctx, rp: RPr, text: string) {
  const f = font(ctx, rp, text), s = el.style;
  s.fontFamily = f.family; s.fontSize = f.px + 'px';
  if (f.bold) s.fontWeight = '700';
  if (f.italic) s.fontStyle = 'italic';
  const deco = [rp.u && rp.u !== 'none' ? 'underline' : '', rp.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  if (deco) { s.textDecorationLine = deco; if (rp.u === 'double') s.textDecorationStyle = 'double'; }
  if (rp.color) s.color = rp.color;
  if (rp.highlight || rp.shd) s.backgroundColor = (rp.highlight || rp.shd)!;
  if (rp.caps) s.textTransform = 'uppercase';
  if (rp.vert === 'superscript' || rp.vert === 'subscript') { s.verticalAlign = rp.vert === 'superscript' ? 'super' : 'sub'; s.fontSize = f.px * 0.66 + 'px'; }
  return f;
}

// How tall a line of a font is in Word's «single» spacing: the font's own line height, as the browser measures it.
const lineCache = new Map<string, number>();
function normalLine(host: HTMLElement, family: string, px: number) {
  const key = family + '|' + px; const hit = lineCache.get(key); if (hit) return hit;
  const probe = document.createElement('span');
  Object.assign(probe.style, { fontFamily: family, fontSize: px + 'px', lineHeight: 'normal', position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap' });
  probe.textContent = 'يأgÉ'; host.append(probe);
  const h = probe.offsetHeight || px * 1.2; probe.remove(); lineCache.set(key, h); return h;
}
function lineHeight(host: HTMLElement, pp: PPr, f: { family: string; px: number }) {
  const single = normalLine(host, f.family, f.px);
  if (pp.lineRule === 'exact') return tw(pp.line || 240);
  if (pp.lineRule === 'atLeast') return Math.max(single, tw(pp.line || 0));
  return single * (pp.line ?? 240) / 240;
}

type FieldState = { depth: number; instr: string; showing: boolean };
function paragraph(ctx: Ctx, p: Element, host: HTMLElement, editable: boolean): HTMLElement {
  const { pp, rp, mark } = paraProps(ctx, p);
  const el = document.createElement('p'); el.className = 'wd-p'; const s = el.style;
  s.direction = pp.bidi ? 'rtl' : 'ltr';
  const jc = pp.jc || 'start';
  s.textAlign = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'end' : jc === 'left' || jc === 'start' ? 'start' : 'justify';
  if (s.textAlign === 'justify') s.textAlignLast = 'start';
  s.paddingTop = tw(pp.before || 0) + 'px'; s.paddingBottom = tw(pp.after || 0) + 'px';
  s.marginInlineStart = tw(pp.start || 0) + 'px'; s.marginInlineEnd = tw(pp.end || 0) + 'px';
  s.textIndent = tw((pp.first || 0) - (pp.hanging || 0)) + 'px';
  if (pp.shd) s.backgroundColor = pp.shd;
  for (const [side, b] of Object.entries(pp.borders || {})) {
    const prop = side === 'top' ? 'borderTop' : side === 'bottom' ? 'borderBottom' : side === 'left' || side === 'start' ? 'borderInlineStart' : side === 'right' || side === 'end' ? 'borderInlineEnd' : '';
    if (prop) { (s as unknown as Record<string, string>)[prop] = css(b); if (side === 'top') s.paddingTop = (tw(pp.before || 0) + b.space) + 'px'; }
  }
  if (pp.pageBreak) el.dataset.break = '1';
  const f = styleRun(el, ctx, mark, '');
  const lh = lineHeight(host, pp, f);
  // The paragraph mark's own look (colour, underline…) is not its text's: only its size and font set the line.
  s.lineHeight = lh + 'px'; s.fontWeight = ''; s.fontStyle = ''; s.color = ''; s.textDecorationLine = ''; s.textDecorationStyle = ''; s.textTransform = ''; s.backgroundColor = pp.shd || '';
  const field: FieldState = { depth: 0, instr: '', showing: false };
  const runs = (parent: Element) => {
    for (const c of kids(parent)) {
      if (c.localName === 'r') run(ctx, c, rp, pp, el, host, field);
      else if (['hyperlink', 'smartTag', 'ins', 'customXml', 'fldSimple', 'bdo', 'dir'].includes(c.localName)) runs(c);
      else if (c.localName === 'sdt') runs(kid(c, 'sdtContent')!);
    }
  };
  runs(p);
  if (!el.textContent) { const z = document.createElement('span'); z.dataset.fixed = ''; z.textContent = '​'; el.append(z); }
  if (editable && el.querySelector('[data-t]')) { el.contentEditable = 'true'; el.spellcheck = false; el.classList.add('word-edit'); }
  (el as HTMLElement & { _pp?: PPr })._pp = pp;
  return el;
}

function run(ctx: Ctx, r: Element, base: RPr, pp: PPr, out: HTMLElement, host: HTMLElement, field: FieldState) {
  const rp = runProps(ctx, r, base);
  if (rp.vanish) return;
  for (const c of kids(r)) {
    const name = c.localName;
    if (name === 'fldChar') {
      const t = wv(c, 'fldCharType');
      if (t === 'begin') { field.depth++; field.instr = ''; field.showing = false; }
      else if (t === 'separate') field.showing = true;
      else if (t === 'end') { field.depth = Math.max(0, field.depth - 1); field.showing = false; field.instr = ''; }
      continue;
    }
    if (name === 'instrText') { field.instr += c.textContent || ''; continue; }
    if (field.depth && !field.showing) continue;
    if (name === 't') {
      const text = c.textContent || '';
      const span = document.createElement('span');
      const page = field.depth && /\bPAGE\b/.test(field.instr) && ctx.page != null;
      span.textContent = page ? String(ctx.page! + 1) : text;
      const f = styleRun(span, ctx, rp, text);
      span.style.lineHeight = lineHeight(host, pp, f) + 'px';
      const at = ctx.index?.get(c);
      if (at != null && !field.depth) span.dataset.t = String(at); else span.dataset.fixed = '';
      out.append(span);
    } else if (name === 'tab' || name === 'ptab') {
      const span = document.createElement('span'); span.className = 'wd-tab'; span.dataset.fixed = ''; span.textContent = ' ';
      styleRun(span, ctx, rp, ''); span.style.textDecorationLine = ''; out.append(span);
    } else if (name === 'br' || name === 'cr') {
      if (wv(c, 'type') === 'page') out.dataset.breakAfter = '1'; else out.append(document.createElement('br'));
    } else if (name === 'noBreakHyphen') {
      const span = document.createElement('span'); span.dataset.fixed = ''; span.textContent = '‑'; styleRun(span, ctx, rp, ''); out.append(span);
    } else if (name === 'drawing') drawing(ctx, c, out, host);
    else if (name === 'AlternateContent') {
      const choice = kid(c, 'Choice'), d = deep(choice, 'drawing');
      if (d) drawing(ctx, d, out, host);
    }
  }
}

function fill(ctx: Ctx, el: Element | undefined): string | undefined {
  if (!el) return undefined;
  if (kid(el, 'noFill')) return 'transparent';
  const sf = kid(el, 'solidFill'); if (!sf) return undefined;
  return clr(ctx, sf);
}
function clr(ctx: Ctx, holder: Element): string | undefined {
  const c = kids(holder)[0]; if (!c) return undefined;
  let hex: string | undefined;
  if (c.localName === 'srgbClr') hex = c.getAttribute('val') || undefined;
  else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') || (c.getAttribute('val') === 'window' ? 'FFFFFF' : '000000');
  else if (c.localName === 'schemeClr') { const v = c.getAttribute('val') || ''; hex = /^(bg1|lt1)$/.test(v) ? 'FFFFFF' : /^(tx1|dk1)$/.test(v) ? '000000' : ctx.theme['clr:' + v]; }
  else if (c.localName === 'prstClr') return c.getAttribute('val') || undefined;
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return undefined;
  // Shades Word writes as a change of lightness (lumMod, lumOff), such as the date box's grey: white at 85%.
  const mod = kid(c, 'lumMod'), off = kid(c, 'lumOff');
  if (!mod && !off) return '#' + hex;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex!.slice(i, i + 2), 16) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  l = Math.min(1, Math.max(0, l * num(mod?.getAttribute('val'), 100000) / 100000 + num(off?.getAttribute('val')) / 100000));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const ch = (t: number) => { t = (t + 1) % 1; const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; return Math.round(v * 255).toString(16).padStart(2, '0'); };
  return '#' + (s === 0 ? Math.round(l * 255).toString(16).padStart(2, '0').repeat(3) : ch(h + 1 / 3) + ch(h) + ch(h - 1 / 3));
}

function drawing(ctx: Ctx, d: Element, para: HTMLElement, host: HTMLElement) {
  const frame = kids(d).find(c => c.localName === 'anchor' || c.localName === 'inline'); if (!frame) return;
  const ext = kid(frame, 'extent'), w = emu(num(ext?.getAttribute('cx'))), h = emu(num(ext?.getAttribute('cy')));
  const graphicData = deep(frame, 'graphicData'); const shape = graphicData ? kids(graphicData)[0] : undefined;
  let el: HTMLElement | null = null;
  if (shape?.localName === 'wsp') el = shapeEl(ctx, shape, w, h, host);
  else if (shape?.localName === 'pic') el = picture(ctx, shape, w, h);
  if (!el) return;
  if (frame.localName === 'inline') { el.style.display = 'inline-block'; el.style.position = 'relative'; el.style.verticalAlign = 'bottom'; para.append(el); return; }
  const pos = (n: string) => { const p = kid(frame, n), o = kid(p, 'posOffset'), a = kid(p, 'align'); return { rel: p?.getAttribute('relativeFrom') || 'column', off: o ? emu(num(o.textContent)) : undefined, align: a?.textContent || undefined }; };
  ctx.anchors.push({ el, para, page: ctx.page, h: pos('positionH'), v: pos('positionV'), w, h2: h, behind: frame.getAttribute('behindDoc') === '1' });
}

function shapeEl(ctx: Ctx, wsp: Element, w: number, h: number, host: HTMLElement): HTMLElement {
  const spPr = kid(wsp, 'spPr'), geom = kid(spPr, 'prstGeom')?.getAttribute('prst') || 'rect', xfrm = kid(spPr, 'xfrm');
  const ln = kid(spPr, 'ln'), lnColor = ln ? (kid(ln, 'noFill') ? 'transparent' : fill(ctx, ln) || '#000') : 'transparent';
  const lnW = ln ? Math.max(0.75, emu(num(ln.getAttribute('w'), 9525))) : 0;
  const box = document.createElement('div'); box.className = 'wd-shape'; box.style.width = w + 'px'; box.style.height = h + 'px';
  if (geom === 'line' || geom.startsWith('straightConnector')) {
    const fh = xfrm?.getAttribute('flipH') === '1', fv = xfrm?.getAttribute('flipV') === '1';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(Math.max(w, 1))); svg.setAttribute('height', String(Math.max(h, 1))); svg.style.overflow = 'visible';
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(fh ? w : 0)); line.setAttribute('y1', String(fv ? h : 0)); line.setAttribute('x2', String(fh ? 0 : w)); line.setAttribute('y2', String(fv ? 0 : h));
    line.setAttribute('stroke', lnColor === 'transparent' ? '#000' : lnColor); line.setAttribute('stroke-width', String(lnW || 1));
    svg.append(line); box.append(svg); box.classList.add('wd-line'); return box;
  }
  const bg = fill(ctx, spPr);
  if (bg) box.style.background = bg;
  if (lnW && lnColor !== 'transparent') box.style.outline = `${lnW}px solid ${lnColor}`;
  if (geom === 'ellipse') box.style.borderRadius = '50%'; else if (geom === 'roundRect') box.style.borderRadius = '10px';
  const txbx = kid(wsp, 'txbx'), content = kid(txbx, 'txbxContent');
  if (content) {
    const body = kid(wsp, 'bodyPr'), ins = (a: string, d: number) => emu(num(body?.getAttribute(a), d));
    const inner = document.createElement('div'); inner.className = 'wd-box';
    Object.assign(inner.style, { padding: `${ins('tIns', 45720)}px ${ins('rIns', 91440)}px ${ins('bIns', 45720)}px ${ins('lIns', 91440)}px`, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: body?.getAttribute('anchor') === 'ctr' ? 'center' : body?.getAttribute('anchor') === 'b' ? 'flex-end' : 'flex-start' });
    blocks(ctx, content, inner, host, ctx.index != null);
    box.append(inner);
  }
  return box;
}

function picture(ctx: Ctx, pic: Element, w: number, h: number): HTMLElement | null {
  const blip = deep(pic, 'blip'), id = blip?.getAttributeNS(R, 'embed') || blip?.getAttribute('r:embed');
  const target = id ? ctx.rels.get(id) : undefined; if (!target) return null;
  const file = ctx.zip.file(target); if (!file) return null;
  const ext = target.split('.').pop()!.toLowerCase(), type = ext === 'jpg' ? 'jpeg' : ext;
  const bytes = file.asUint8Array(); let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const img = document.createElement('img'); img.src = `data:image/${type};base64,${btoa(bin)}`; img.alt = '';
  Object.assign(img.style, { width: w + 'px', height: h + 'px' });
  const box = document.createElement('div'); box.className = 'wd-shape'; box.append(img); return box;
}

function table(ctx: Ctx, t: Element, host: HTMLElement, editable: boolean): HTMLElement {
  const tblPr = kid(t, 'tblPr'), style = ctx.styles.get(wv(kid(tblPr, 'tblStyle')) || '');
  const prop = (n: string) => kid(tblPr, n) || kid(style?.tblPr, n);
  const grid = kids(kid(t, 'tblGrid'), 'gridCol').map(g => tw(num(wv(g, 'w'))));
  const el = document.createElement('table'); el.className = 'wd-table';
  const bidi = !!prop('bidiVisual');
  el.style.direction = bidi ? 'rtl' : 'ltr';
  el.style.width = grid.reduce((a, b) => a + b, 0) + 'px';
  const jc = wv(prop('jc'));
  // A right-to-left table starts at the right edge; Word measures its indent there to the text of its first cell, so its
  // border sits that cell's margin further in (as Word lines up the bundle's box with the table under it).
  const mar0 = prop('tblCellMar');
  const ind = tw(num(wv(prop('tblInd'), 'w')) + (bidi ? num(wv(kid(mar0, 'start') || kid(mar0, 'left'), 'w'), 108) : 0));
  if (jc === 'center') { el.style.marginLeft = 'auto'; el.style.marginRight = 'auto'; }
  else if (bidi) { el.style.marginLeft = 'auto'; el.style.marginRight = ind + 'px'; }
  else el.style.marginLeft = ind + 'px';
  const tb = prop('tblBorders'), border = (n: string) => parseBorder(kid(tb, n) || (n === 'start' ? kid(tb, 'left') : n === 'end' ? kid(tb, 'right') : undefined));
  const mar = prop('tblCellMar'), cellMar = (n: string, d: number) => tw(num(wv(kid(mar, n) || kid(mar, n === 'start' ? 'left' : n === 'end' ? 'right' : n), 'w'), d));
  const cg = document.createElement('colgroup'); for (const g of grid) { const c = document.createElement('col'); c.style.width = g + 'px'; cg.append(c); } el.append(cg);
  const rows = kids(t, 'tr'), body = document.createElement('tbody'); el.append(body);
  const spans: { cell: HTMLTableCellElement; col: number }[] = [];
  rows.forEach((tr, ri) => {
    const row = document.createElement('tr'); body.append(row);
    const trH = kid(kid(tr, 'trPr'), 'trHeight'); if (trH) row.style.height = tw(num(wv(trH))) + 'px';
    let col = num(wv(kid(kid(tr, 'trPr'), 'gridBefore')));
    for (const tc of kids(tr, 'tc')) {
      const tcPr = kid(tc, 'tcPr'), span = num(wv(kid(tcPr, 'gridSpan')), 1), vm = kid(tcPr, 'vMerge');
      if (vm && wv(vm) !== 'restart') { const above = spans.find(s => s.col === col); if (above) above.cell.rowSpan++; col += span; continue; }
      const cell = document.createElement('td'); cell.colSpan = span; row.append(cell);
      if (vm) spans.push({ cell, col }); else for (let i = spans.length - 1; i >= 0; i--) if (spans[i].col === col) spans.splice(i, 1);
      const tcB = kid(tcPr, 'tcBorders'), side = (n: string, alt: string, outer: boolean) => parseBorder(kid(tcB, n) || kid(tcB, alt)) || border(outer ? n : (n === 'top' || n === 'bottom' ? 'insideH' : 'insideV'));
      const first = col === 0, last = col + span >= grid.length;
      Object.assign(cell.style, {
        borderTop: css(side('top', 'top', ri === 0)), borderBottom: css(side('bottom', 'bottom', ri === rows.length - 1)),
        borderInlineStart: css(side('start', 'left', first)), borderInlineEnd: css(side('end', 'right', last)),
        paddingInline: `${cellMar('start', 108)}px ${cellMar('end', 108)}px`, paddingBlock: `${cellMar('top', 0)}px ${cellMar('bottom', 0)}px`,
        verticalAlign: wv(kid(tcPr, 'vAlign')) === 'center' ? 'middle' : wv(kid(tcPr, 'vAlign')) === 'bottom' ? 'bottom' : 'top',
      });
      const shd = color(wv(kid(tcPr, 'shd'), 'fill')); if (shd) cell.style.background = shd;
      blocks({ ...ctx, tblStyle: wv(kid(tblPr, 'tblStyle')) || undefined }, tc, cell, host, editable);
      col += span;
    }
  });
  return el;
}

function blocks(ctx: Ctx, parent: Element, out: HTMLElement, host: HTMLElement, editable: boolean) {
  for (const c of kids(parent)) {
    if (c.localName === 'p') out.append(paragraph(ctx, c, host, editable));
    else if (c.localName === 'tbl') out.append(table(ctx, c, host, editable));
    else if (c.localName === 'sdt') blocks(ctx, kid(c, 'sdtContent')!, out, host, editable);
    else if (c.localName === 'customXml') blocks(ctx, c, out, host, editable);
  }
}

// Tabs: each tab reaches the next stop, measured from the paragraph's starting edge (the right, in Arabic). An «end»
// stop ends the text after it at the stop; a «center» stop centres it there.
function layoutTabs(root: HTMLElement, scale: number) {
  for (const p of Array.from(root.querySelectorAll<HTMLElement>('p.wd-p'))) {
    const tabs = Array.from(p.querySelectorAll<HTMLElement>(':scope > .wd-tab')); if (!tabs.length) continue;
    const pp = (p as HTMLElement & { _pp?: PPr })._pp || {}, rtl = pp.bidi, r = p.getBoundingClientRect();
    const start = tw(pp.start || 0), origin = rtl ? r.right / scale + start : r.left / scale - start;
    const stops = (pp.tabs || []).map(t => ({ px: tw(t.pos), val: t.val }));
    for (const [i, tab] of tabs.entries()) {
      tab.style.width = '0px';
      const tr = tab.getBoundingClientRect(), at = rtl ? origin - tr.right / scale : tr.left / scale - origin;
      let stop = stops.find(s => s.px > at + 0.5);
      if (!stop) stop = { px: Math.ceil((at + 0.5) / 48) * 48, val: 'start' };
      let width = stop.px - at;
      if (/^(end|right|center|decimal)$/.test(stop.val)) {
        const range = document.createRange(); range.setStartAfter(tab);
        if (tabs[i + 1]) range.setEndBefore(tabs[i + 1]); else range.setEnd(p, p.childNodes.length);
        const follow = range.getBoundingClientRect().width / scale;
        width -= stop.val === 'center' ? follow / 2 : follow;
      }
      // A little room to spare, so the text after the tab is not pushed to the next line by rounding.
      tab.style.width = Math.max(0, width - (/^(end|right|center|decimal)$/.test(stop.val) ? 3 : 0)) + 'px';
    }
  }
}

export type Layout = { pages: number; width: number; height: number };

/** Draws the document into `host`. */
export function renderDocument(zip: PizZipType, dom: Document, texts: Element[], host: HTMLElement): Layout {
  const read = (path: string) => { const f = zip.file(path); return f ? new DOMParser().parseFromString(f.asText(), 'application/xml') : null; };
  const relsOf = (part: string) => {
    const m = new Map<string, string>(), x = read(part.replace(/([^/]+)$/, '_rels/$1.rels'));
    for (const rel of Array.from(x?.getElementsByTagName('Relationship') || [])) { const t = rel.getAttribute('Target') || ''; m.set(rel.getAttribute('Id') || '', t.startsWith('/') ? t.slice(1) : 'word/' + t.replace(/^\.\//, '')); }
    return m;
  };
  const styles = new Map<string, Style>(); let defaultPara: string | undefined;
  const st = read('word/styles.xml')?.documentElement;
  for (const s of kids(st, 'style')) {
    const id = wv(s, 'styleId') || ''; styles.set(id, { type: wv(s, 'type') || '', basedOn: wv(kid(s, 'basedOn')) || undefined, pPr: kid(s, 'pPr'), rPr: kid(s, 'rPr'), tblPr: kid(s, 'tblPr') });
    if (wv(s, 'default') === '1' && wv(s, 'type') === 'paragraph') defaultPara = id;
  }
  const defs = kid(st, 'docDefaults');
  const theme: Record<string, string> = {};
  const th = read('word/theme/theme1.xml');
  if (th) for (const [k, n] of [['major', 'majorFont'], ['minor', 'minorFont']] as const) {
    const f = Array.from(th.getElementsByTagNameNS(A, n))[0]; if (!f) continue;
    theme[k + 'HAnsi'] = kid(f, 'latin')?.getAttribute('typeface') || '';
    theme[k + 'Bidi'] = kid(f, 'cs')?.getAttribute('typeface') || kids(f, 'font').find(x => x.getAttribute('script') === 'Arab')?.getAttribute('typeface') || '';
  }
  const rels = relsOf('word/document.xml');
  const index = new Map(texts.map((t, i) => [t, i]));
  const body = kid(dom.documentElement, 'body')!, sect = kid(body, 'sectPr') || deep(body, 'sectPr');
  const pg = kid(sect, 'pgSz'), mg = kid(sect, 'pgMar');
  const W_ = tw(num(wv(pg, 'w'), 11906)), H = tw(num(wv(pg, 'h'), 16838));
  const m = { top: tw(num(wv(mg, 'top'), 1440)), bottom: tw(num(wv(mg, 'bottom'), 1440)), left: tw(num(wv(mg, 'left'), 1440)), right: tw(num(wv(mg, 'right'), 1440)), header: tw(num(wv(mg, 'header'), 720)), footer: tw(num(wv(mg, 'footer'), 720)) };
  const ctx: Ctx = { styles, defaultPara, pDefault: kid(kid(defs, 'pPrDefault'), 'pPr'), rDefault: kid(kid(defs, 'rPrDefault'), 'rPr'), theme, index, anchors: [], zip, rels, dir: 'rtl' };

  host.replaceChildren();
  const sheet = document.createElement('div'); sheet.className = 'wd-sheet'; sheet.style.width = W_ + 'px'; host.append(sheet);
  const pagesLayer = document.createElement('div'); pagesLayer.className = 'wd-pages';
  const flow = document.createElement('div'); flow.className = 'wd-flow';
  Object.assign(flow.style, { paddingTop: m.top + 'px', paddingRight: m.right + 'px', paddingLeft: m.left + 'px' });
  const layer = document.createElement('div'); layer.className = 'wd-layer';
  sheet.append(pagesLayer, flow, layer);
  blocks(ctx, body, flow, sheet, true);

  const scale = () => sheet.getBoundingClientRect().width / W_ || 1;
  const top = (el: Element, k = scale()) => (el.getBoundingClientRect().top - sheet.getBoundingClientRect().top) / k;
  const pageStart = (n: number) => n * (H + PAGE_GAP);
  layoutTabs(flow, scale());

  // Pages: a block that would run past the bottom margin (or asks for a new page) starts the next page; a table that
  // runs past it is split between its rows.
  let page = 0; const k = scale();
  const list = Array.from(flow.children) as HTMLElement[];
  for (let i = 0; i < list.length; i++) {
    const b = list[i]; let y = top(b, k), bottom = y + b.getBoundingClientRect().height / k;
    while (y >= pageStart(page + 1)) page++;
    const contentTop = pageStart(page) + m.top, contentBottom = pageStart(page) + H - m.bottom;
    const forced = b.dataset.break === '1' && y > contentTop + 1;
    if (!forced && !(bottom > contentBottom + 0.5 && y > contentTop + 1)) {
      if (b.tagName === 'TABLE' && bottom > contentBottom + 0.5) {
        const rows = Array.from((b as HTMLTableElement).rows), cut = rows.findIndex(row => top(row, k) + row.getBoundingClientRect().height / k > contentBottom + 0.5);
        if (cut > 0) { const rest = b.cloneNode(false) as HTMLTableElement; rest.append(b.querySelector('colgroup')!.cloneNode(true)); const tb = document.createElement('tbody'); rest.append(tb); for (const row of rows.slice(cut)) tb.append(row); b.after(rest); list.splice(i + 1, 0, rest); }
      }
      continue;
    }
    if (b.tagName === 'TABLE' && !forced) {
      const rows = Array.from((b as HTMLTableElement).rows), cut = rows.findIndex(row => top(row, k) + row.getBoundingClientRect().height / k > contentBottom + 0.5);
      if (cut > 0) { const rest = b.cloneNode(false) as HTMLTableElement; rest.append(b.querySelector('colgroup')!.cloneNode(true)); const tb = document.createElement('tbody'); rest.append(tb); for (const row of rows.slice(cut)) tb.append(row); b.after(rest); list.splice(i + 1, 0, rest); continue; }
    }
    const gap = document.createElement('div'); gap.className = 'wd-gap'; gap.style.height = (pageStart(page + 1) + m.top - y) + 'px';
    b.before(gap); page++; y = top(b, k); bottom = y + b.getBoundingClientRect().height / k;
  }
  const flowEnd = top(flow, k) + flow.getBoundingClientRect().height / k;
  const pages = Math.max(1, Math.ceil((flowEnd - m.bottom + 1) / (H + PAGE_GAP)));
  const height = pages * H + (pages - 1) * PAGE_GAP;
  sheet.style.height = height + 'px';
  for (let n = 0; n < pages; n++) { const pageEl = document.createElement('div'); pageEl.className = 'wd-page'; Object.assign(pageEl.style, { top: pageStart(n) + 'px', height: H + 'px' }); pagesLayer.append(pageEl); }

  // Headers and footers, on every page (not editable here).
  const partOf = (kind: 'header' | 'footer') => { const ref = kids(sect, kind + 'Reference').find(r => wv(r, 'type') === 'default'); const id = ref?.getAttributeNS(R, 'id') || ref?.getAttribute('r:id'); return id ? rels.get(id) : undefined; };
  for (const kind of ['header', 'footer'] as const) {
    const path = partOf(kind), part = path ? read(path) : null; if (!part) continue;
    const pctx: Ctx = { ...ctx, index: null, rels: relsOf(path!) };
    for (let n = 0; n < pages; n++) {
      pctx.page = n; pctx.anchors = ctx.anchors;
      const box = document.createElement('div'); box.className = 'wd-hf';
      Object.assign(box.style, { left: m.left + 'px', right: m.right + 'px' });
      blocks(pctx, part.documentElement, box, sheet, false);
      layer.append(box);
      if (kind === 'header') box.style.top = pageStart(n) + m.header + 'px';
      else box.style.top = pageStart(n) + H - m.footer - box.getBoundingClientRect().height / k + 'px';
      layoutTabs(box, k);
    }
  }

  // Boxes and lines Word places on the page, measured from what they are attached to.
  for (const a of ctx.anchors) {
    const py = a.para ? top(a.para, k) : 0, pageNo = a.page ?? Math.max(0, Math.floor(py / (H + PAGE_GAP))), p0 = pageStart(pageNo);
    const hx = a.h.rel === 'page' ? [0, W_] : a.h.rel === 'leftMargin' ? [0, m.left] : a.h.rel === 'rightMargin' ? [W_ - m.right, m.right] : [m.left, W_ - m.left - m.right];
    const vy = a.v.rel === 'page' ? [p0, H] : a.v.rel === 'margin' ? [p0 + m.top, H - m.top - m.bottom] : a.v.rel === 'topMargin' ? [p0, m.top] : a.v.rel === 'bottomMargin' ? [p0 + H - m.bottom, m.bottom] : [py, 0];
    const place = (o: { off?: number; align?: string }, [from, size]: number[], len: number) => o.off != null ? from + o.off : o.align === 'center' ? from + (size - len) / 2 : o.align === 'right' || o.align === 'bottom' || o.align === 'outside' ? from + size - len : from;
    const y = place(a.v, vy, a.h2), below = y + a.h2 - (p0 + H);
    Object.assign(a.el.style, { position: 'absolute', left: place(a.h, hx, a.w) + 'px', top: y + 'px', zIndex: a.behind ? '1' : '3' });
    // Nothing shows past the edge of its page (Word cuts it off there too).
    if (below > 0) a.el.style.clipPath = `inset(0 0 ${below}px 0)`;
    layer.append(a.el);
  }
  for (const box of Array.from(layer.querySelectorAll<HTMLElement>('.wd-box'))) layoutTabs(box, k);
  return { pages, width: W_, height };
}
