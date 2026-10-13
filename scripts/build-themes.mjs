// Generates components/themes.generated.css: black-and-gold ("noir"), white-and-gold ("ivory") and Persona
// versions of every hard-coded colour in the app's stylesheets, a dark mode for every light theme (tinted with
// that theme's own colour), and Persona's light "paper" version, so each page follows the chosen look.
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
const toHex = n => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
const normalize = value => value
  .replace(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/g, (_, r, g, b, a) => '#' + toHex(+r) + toHex(+g) + toHex(+b) + (a === undefined ? '' : toHex((a.endsWith('%') ? parseFloat(a) / 100 : +a) * 255)))
  .replace(/(^|[\s,(])white(?=$|[\s,);!])/g, '$1#ffffff').replace(/(^|[\s,(])black(?=$|[\s,);!])/g, '$1#000000');
const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g, HAS_HEX = /#[0-9a-fA-F]{3,8}\b/;
const recolor = (value, fn) => normalize(value).replace(HEX, m => hslToHex(fn(hexToHsl(m))));
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
  // YoRHa (NieR: Automata): every surface becomes parchment and every ink a warm grey-brown; colours are muted.
  yorha: c => c.l >= .5
    ? { ...c, h: chroma(c) > .12 ? c.h : 48, s: chroma(c) > .12 ? c.s * .3 : .2, l: clamp(.79 + (c.l - .5) * .3) }
    : { ...c, h: chroma(c) > .12 ? c.h : 45, s: chroma(c) > .12 ? c.s * .35 : .08, l: clamp(.2 + c.l * .32) },
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
// A `background` shorthand resets background-clip, which would turn gradient text into a solid block, so the
// rule's own clip settings are repeated after it.
const CLIP = /^(-webkit-)?background-clip$|^-webkit-text-fill-color$/;
const withClip = (out, body) => out.some(d => d.startsWith('background:')) ? [...out, ...decls(body).filter(([p]) => CLIP.test(p)).map(([p, v]) => `${p}:${v}`)] : out;
// Puts a rule under an extra condition on the root element, e.g. [data-theme=noir] or [data-mode=dark].
const scope = (selector, attr) => splitTop(selector, ',').map(s => {
  s = s.trim();
  if (s.startsWith(':root')) return `:root${attr}` + s.slice(5);
  if (/^html\b/.test(s)) return `:root${attr}` + s.slice(4);
  return `:root${attr} ${s}`;
}).join(',');
const decls = body => splitTop(body, ';').map(d => d.trim()).filter(Boolean).map(d => { const k = d.indexOf(':'); return [d.slice(0, k).trim(), d.slice(k + 1).trim()]; });

/** Colour declarations of every rule, recoloured by `fn`, under `attr`. Theme-specific rules are left alone. */
// With `keepOrder`, colour declarations without fixed colours (e.g. `background:var(--brand)` on an active state)
// are repeated under the same condition, so a recoloured base rule never outranks its own state variants.
function themed(rules, attr, fn, skipVars = SKIP_VARS, skipSelector = null, keepOrder = false) {
  let css = '';
  for (const r of rules) {
    if (r.at) { const inner = themed(r.rules, attr, fn, skipVars, skipSelector, keepOrder); if (inner) css += `${r.at}{${inner}}\n`; continue; }
    if (r.selector.includes('[data-theme') || r.selector.includes('::view-transition') || skipSelector?.test(r.selector)) continue;
    const out = decls(r.body).flatMap(([prop, value]) => {
      if (!COLOR_PROPS.test(prop) || skipVars.test(prop)) return [];
      if (!HAS_HEX.test(normalize(value))) return keepOrder && !prop.startsWith('--') && /var\(|currentColor|transparent|inherit/.test(value) ? [`${prop}:${value}`] : [];
      const next = recolor(value, fn);
      return next === value ? [] : [`${prop}:${next}`];
    });
    if (out.length) css += `${scope(r.selector, attr)}{${withClip(out, r.body).join(';')}}\n`;
  }
  return css;
}

// Dark mode for the light themes: surfaces become deep and text light, keeping each colour's own hue.
// The sidebar is already dark in every light theme, so its rules and variables are kept.
const night = c => {
  const colourful = chroma(c) > .12;
  return c.l >= .5
    ? { ...c, l: clamp((colourful ? .13 : .075) + (1 - c.l) * .55), s: colourful ? c.s * .6 : Math.min(c.s, .12) }
    : { ...c, l: clamp(.93 - c.l * .42), s: colourful ? c.s * .75 : Math.min(c.s, .12) };
};
const NIGHT_SKIP_VARS = /^--(brand|glow|sidebar|chart|dept|k|kb|s|ax|ay|cx|cy|gx|gy|mag|tilt|glare|scroll|cursor)/;
const LIGHT_SIDEBAR = ['sunflower', 'sky'];
const SIDEBAR = /sidebar|\.nav-|\.brand-(?:ar|en|mark)|\.egg-splash|\.calling-card|\.aero-splash/;
const LIGHT_THEMES = ['burgundy', 'navy', 'emerald', 'plum', 'copper', 'graphite', 'sunflower', 'royal', 'sky', 'teal', 'sunset', 'rose', 'indigo'];
const hsl = (h, s, l) => hslToHex({ h, s, l, a: '' });
/** Per-theme dark variables: surfaces tinted with the theme's own colour, and a brighter brand for dark backgrounds. */
function nightVars(theme, brand) {
  const { h, s } = hexToHsl(brand), tint = Math.min(s, .5);
  const b = hexToHsl(brand), bright = { ...b, l: Math.max(b.l, .66), s: Math.min(b.s, .7) };
  const v = {
    '--background': hsl(h, tint * .45, .075), '--card': hsl(h, tint * .4, .11), '--popover': hsl(h, tint * .4, .11),
    '--muted': hsl(h, tint * .3, .165), '--secondary': hsl(h, tint * .3, .165), '--accent': hsl(h, tint * .4, .19),
    '--border': hsl(h, tint * .3, .22), '--input': hsl(h, tint * .3, .26),
    '--foreground': hsl(h, .08, .92), '--card-foreground': hsl(h, .08, .92), '--popover-foreground': hsl(h, .08, .92),
    '--secondary-foreground': hsl(h, .1, .88), '--muted-foreground': hsl(h, .08, .66), '--primary-foreground': hsl(h, .3, .1),
    '--brand': hslToHex(bright), '--brand-hover': hslToHex({ ...bright, l: Math.min(.8, bright.l + .07) }), '--brand-ink': hsl(h, .25, .94),
    '--brand-deep': hslToHex({ ...b, l: Math.min(b.l, .2) }),
  };
  const sel = theme === 'burgundy' ? ':root[data-mode=dark]:not([data-theme]),:root[data-mode=dark][data-theme=burgundy]' : `:root[data-mode=dark][data-theme=${theme}]`;
  return `${sel}{color-scheme:dark;${Object.entries(v).map(([k, x]) => `${k}:${x}`).join(';')}}\n`;
}
/** Theme-specific rules (from themes.css) recoloured for dark mode, under [data-mode=dark]. */
function nightThemeRules(rules, themes) {
  let css = '';
  for (const r of rules) {
    if (r.at) { const inner = nightThemeRules(r.rules, themes); if (inner) css += `${r.at}{${inner}}\n`; continue; }
    const theme = r.selector.match(/\[data-theme=([a-z-]+)\]/)?.[1];
    if (!theme || !themes.includes(theme) || r.selector.includes('::view-transition')) continue;
    // A sidebar that is already dark keeps its look; light sidebars (sunflower, Aero) are darkened with the page.
    const lightSidebar = LIGHT_SIDEBAR.includes(theme);
    if (!lightSidebar && SIDEBAR.test(r.selector)) continue;
    const out = decls(r.body).flatMap(([prop, value]) => COLOR_PROPS.test(prop) && (!NIGHT_SKIP_VARS.test(prop) || (lightSidebar && prop.startsWith('--sidebar'))) && HAS_HEX.test(normalize(value)) ? [`${prop}:${recolor(value, night)}`] : []);
    if (out.length) css += `${r.selector.replaceAll('[data-theme=', '[data-mode=dark][data-theme=')}{${withClip(out, r.body).join(';')}}\n`;
  }
  return css;
}

// Persona's light version: paper-white surfaces and black ink, red untouched.
const paper = c => c.l >= .85 ? { ...c, l: clamp(c.l + (1 - c.l) * .85), s: c.s * .1 } : c.l >= .6 ? { ...c, s: c.s * .25 } : chroma(c) > .12 ? c : { ...c, s: c.s * .3 };
const swapInk = c => chroma(c) > .12 ? c : { ...c, l: 1 - c.l, s: 0 };
// YoRHa's dark version: surfaces become warm near-blacks and ink becomes parchment; colours stay muted.
const yorhaNight = c => c.l >= .5
  ? { ...c, h: chroma(c) > .12 ? c.h : 45, s: chroma(c) > .12 ? c.s * .3 : .08, l: clamp(.09 + (1 - c.l) * .35) }
  : { ...c, h: chroma(c) > .12 ? c.h : 48, s: chroma(c) > .12 ? c.s * .35 : .22, l: clamp(.84 - c.l * .25) };
const swapNeutral = c => chroma(c) > .2 ? c : { ...c, l: 1 - c.l };
/** YoRHa's own rules copied for the dark version, with parchment and ink swapped. */
function darkYorha(rules) {
  let css = '';
  for (const r of rules) {
    if (r.at) { const inner = darkYorha(r.rules); if (inner) css += `${r.at}{${inner}}\n`; continue; }
    if (!r.selector.includes('[data-theme=yorha]')) continue;
    const out = decls(r.body).map(([prop, value]) => prop === 'color-scheme' ? 'color-scheme:dark' : COLOR_PROPS.test(prop) || /shadow|clip|gradient/.test(prop) || /#|rgb|white|black/.test(value) ? `${prop}:${recolor(value, swapNeutral)}` : `${prop}:${value}`);
    css += `${r.selector.replaceAll('[data-theme=yorha]', '[data-theme=yorha-dark]')}{${out.join(';')}}\n`;
  }
  return css;
}
/** Persona's own rules copied in full for the light version, with black and white swapped. */
function paperPersona(rules) {
  let css = '';
  for (const r of rules) {
    if (r.at) { const inner = paperPersona(r.rules); if (inner) css += `${r.at}{${inner}}\n`; continue; }
    if (!r.selector.includes('[data-theme=phantom]')) continue;
    const out = decls(r.body).map(([prop, value]) => prop === 'color-scheme' ? 'color-scheme:light' : COLOR_PROPS.test(prop) || /shadow|clip|gradient/.test(prop) || /#|rgb|white|black/.test(value) ? `${prop}:${recolor(value, swapInk)}` : `${prop}:${value}`);
    css += `${r.selector.replaceAll('[data-theme=phantom]', '[data-theme=phantom-light]')}{${out.join(';')}}\n`;
  }
  return css;
}

const rules = SOURCES.flatMap(f => parse(fs.readFileSync(f, 'utf8')));
const themeRules = parse(fs.readFileSync('components/themes.css', 'utf8'));
// Each light theme's brand colour, from its variable block (`:root,:root[data-theme=burgundy]` is the default).
const brands = Object.fromEntries(rules.filter(r => r.selector && /^:root(,|\[data-theme=)/.test(r.selector) && /--brand:\s*#/.test(r.body))
  .map(r => [r.selector.match(/\[data-theme=([a-z-]+)\]/)?.[1] || 'burgundy', r.body.match(/--brand:\s*(#[0-9a-fA-F]{3,8})/)[1]]));
const missing = LIGHT_THEMES.filter(t => !brands[t]);
if (missing.length) { console.error('No --brand colour found for: ' + missing.join(', ')); process.exit(1); }
const result = '/* Generated by scripts/build-themes.mjs from the app stylesheets. Do not edit by hand. */\n'
  + Object.entries(THEMES).map(([name, fn]) => `/* ${name} */\n` + themed(rules, `[data-theme=${name}]`, fn)).join('')
  + '/* phantom-light */\n' + themed(rules, '[data-theme=phantom-light]', paper) + paperPersona(themeRules)
  + '/* yorha-dark */\n' + themed(rules, '[data-theme=yorha-dark]', yorhaNight) + darkYorha(themeRules)
  + '/* dark mode for light themes */\n' + themed(rules, '[data-mode=dark]', night, NIGHT_SKIP_VARS, SIDEBAR, true)
  + nightThemeRules(themeRules, LIGHT_THEMES) + LIGHT_THEMES.map(t => nightVars(t, brands[t])).join('');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== result) { console.error(OUT + ' is out of date. Run: node scripts/build-themes.mjs'); process.exit(1); }
  console.log('Passed theme check: generated theme, dark-mode and Persona light styles match the stylesheets.');
} else { fs.writeFileSync(OUT, result); console.log(`Wrote ${OUT} (${result.length} bytes).`); }
