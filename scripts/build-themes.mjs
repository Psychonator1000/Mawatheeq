// Generates components/themes.generated.css: black-and-gold ("noir") and white-and-gold ("ivory")
// versions of every hard-coded colour in the app's stylesheets, so each page follows those themes.
// Run `node scripts/build-themes.mjs` after editing styles; `--check` fails when the file is stale (CI).
import fs from 'node:fs';

const SOURCES = ['app/globals.css', 'pages/pages.css', 'components/office.css', 'components/workspaces.css', 'components/motion.css'];
const OUT = 'components/themes.generated.css';
const COLOR_PROPS = /^(--[\w-]+|background(-color|-image)?|color|border(-[a-z-]+)?|outline(-color)?|fill|stroke|caret-color|text-decoration-color|column-rule-color)$/;
const SKIP_VARS = /^--(brand|glow|sidebar|chart|dept|k|kb|s|ax|ay|cx|cy|gx|gy|mag|tilt|glare|scroll)/;

const hexToHsl = hex => {
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h].map(c => c + c).join('');
  const n = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255), a = h.length === 8 ? h.slice(6) : '';
  const max = Math.max(...n), min = Math.min(...n), l = (max + min) / 2, d = max - min;
  let s = 0, hue = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    hue = max === n[0] ? ((n[1] - n[2]) / d) % 6 : max === n[1] ? (n[2] - n[0]) / d + 2 : (n[0] - n[1]) / d + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { h: hue, s, l, a };
};
const hslToHex = ({ h, s, l, a }) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0')).join('') + a;
};
const clamp = v => Math.min(1, Math.max(0, v));
const chroma = c => c.s * (1 - Math.abs(2 * c.l - 1));
const THEMES = {
  // Black and gold: light surfaces become near-blacks, dark text becomes soft parchment; coloured tags keep their hue.
  noir: c => c.l >= .5
    ? { ...c, l: clamp(.06 + (1 - c.l) * .7), s: chroma(c) > .12 ? c.s * .5 : .1, h: chroma(c) > .12 ? c.h : 40 }
    : { ...c, l: clamp(.92 - c.l * .45), s: chroma(c) > .12 ? c.s * .6 : .18, h: chroma(c) > .12 ? c.h : 40 },
  // Persona: ink blacks and paper whites with no warmth; red and other coloured accents keep their hue.
  phantom: c => c.l >= .5
    ? { ...c, l: clamp(.05 + (1 - c.l) * .55), s: chroma(c) > .12 ? c.s * .6 : 0, h: chroma(c) > .12 ? c.h : 0 }
    : { ...c, l: clamp(.96 - c.l * .35), s: chroma(c) > .12 ? c.s * .5 : 0, h: c.h },
  // White and gold: warm creams become clean whites, borders turn neutral grey; text and accents stay.
  ivory: c => c.l >= .9 ? { ...c, l: clamp(c.l + (1 - c.l) * .6), s: c.s * .15 } : c.l >= .72 ? { ...c, s: c.s * .3 } : c,
};

function parse(css) {
  const out = []; let i = 0;
  css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@(import|charset)[^;]*;/g, '');
  const block = () => { // returns index after matching brace, starting after '{'
    let depth = 1, j = i;
    while (depth && j < css.length) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    return j;
  };
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim().replace(/^[;}\s]+/, '');
    i = open + 1;
    const end = block(), body = css.slice(i, end - 1);
    if (head.startsWith('@media') || head.startsWith('@supports')) out.push({ at: head, rules: parse(body) });
    else if (!head.startsWith('@')) out.push({ selector: head, body });
    i = end;
  }
  return out;
}
const splitTop = (text, sep) => { const parts = []; let depth = 0, cur = ''; for (const ch of text) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === sep && !depth) { parts.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) parts.push(cur); return parts; };
const scope = (selector, theme) => splitTop(selector, ',').map(s => {
  s = s.trim();
  if (s.startsWith(':root')) return `:root[data-theme=${theme}]` + s.slice(5);
  if (/^html\b/.test(s)) return `:root[data-theme=${theme}]` + s.slice(4);
  return `:root[data-theme=${theme}] ${s}`;
}).join(',');

function themed(rules, theme, fn) {
  let css = '';
  for (const r of rules) {
    if (r.at) { const inner = themed(r.rules, theme, fn); if (inner) css += `${r.at}{${inner}}\n`; continue; }
    if (r.selector.includes('[data-theme') || r.selector.includes('::view-transition')) continue;
    const decls = splitTop(r.body, ';').map(d => d.trim()).filter(Boolean).flatMap(d => {
      const k = d.indexOf(':'), prop = d.slice(0, k).trim(), value = d.slice(k + 1).trim();
      if (!COLOR_PROPS.test(prop) || SKIP_VARS.test(prop) || !/#[0-9a-fA-F]{3,8}\b/.test(value)) return [];
      const next = value.replace(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g, m => hslToHex(fn(hexToHsl(m))));
      return next === value ? [] : [`${prop}:${next}`];
    });
    if (decls.length) css += `${scope(r.selector, theme)}{${decls.join(';')}}\n`;
  }
  return css;
}

const rules = SOURCES.flatMap(f => parse(fs.readFileSync(f, 'utf8')));
const result = '/* Generated by scripts/build-themes.mjs from the app stylesheets. Do not edit by hand. */\n'
  + Object.entries(THEMES).map(([name, fn]) => `/* ${name} */\n` + themed(rules, name, fn)).join('');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== result) { console.error(OUT + ' is out of date. Run: node scripts/build-themes.mjs'); process.exit(1); }
  console.log('Passed theme check: generated black-and-gold and white-and-gold styles match the stylesheets.');
} else { fs.writeFileSync(OUT, result); console.log(`Wrote ${OUT} (${result.length} bytes).`); }
