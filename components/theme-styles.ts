// Theme colours, kept out of the main stylesheet: only the rules for the theme and mode in use are on the page.
// The other themes' rules (about half of every rule in the app) made the browser test each element against them
// on every redraw, which doubled the time spent restyling a page when switching sections or opening a case.
// Both sheets go after the main stylesheet, in the same order they had at the end of it, so nothing changes look.
import generated from './themes.generated.css?inline';
import hand from './themes.css?inline';

type Block = { text: string; test: (theme: string, mode: string) => boolean };

/** Splits a stylesheet into its top-level rules (at-rules with their whole body). */
function topLevel(css: string): string[] {
  const out: string[] = []; let depth = 0, start = 0, quote = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '/' && css[i + 1] === '*') { const end = css.indexOf('*/', i + 2); i = end < 0 ? css.length : end + 1; if (!depth) start = i + 1; }
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) { out.push(css.slice(start, i + 1).trim()); start = i + 1; } }
  }
  return out.filter(Boolean);
}
/** A selector list split at its top-level commas. */
function selectors(list: string): string[] {
  const out: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) { const ch = list[i]; if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--; else if (ch === ',' && !depth) { out.push(list.slice(start, i)); start = i + 1; } }
  return [...out, list.slice(start)];
}
const THEME = /data-theme=["']?([\w-]+)/g, MODE = /data-mode=["']?([\w-]+)/g;
/** True when one selector can match under the theme and mode: every theme and mode it names is the one in use. */
function selectorTest(sel: string) {
  if (sel.includes(':not(')) return () => true;
  const themes = [...sel.matchAll(THEME)].map(m => m[1]), modes = [...sel.matchAll(MODE)].map(m => m[1]);
  if (!themes.length && !modes.length) return () => true;
  return (theme: string, mode: string) => themes.every(t => t === theme) && modes.every(m => m === mode);
}
function blocks(css: string): Block[] {
  return topLevel(css).map(text => {
    if (text.startsWith('@')) {
      // At-rules (media, keyframes) are kept whenever any rule inside could apply.
      const inner = topLevel(text.slice(text.indexOf('{') + 1, -1)).map(r => r.startsWith('@') ? () => true : (() => { const tests = selectors(r.slice(0, r.indexOf('{'))).map(selectorTest); return (t: string, m: string) => tests.some(f => f(t, m)); })());
      return { text, test: (t, m) => !inner.length || inner.some(f => f(t, m)) };
    }
    const tests = selectors(text.slice(0, text.indexOf('{'))).map(selectorTest);
    return { text, test: (t, m) => tests.some(f => f(t, m)) };
  });
}

let sheets: { el: HTMLStyleElement; blocks: Block[] }[] | null = null, current = '';
/** Puts the rules for the page's current theme and mode on the page; call after either attribute changes. */
export function syncThemeStyles() {
  const root = document.documentElement, theme = root.dataset.theme || '', mode = root.dataset.mode || '', key = theme + '|' + mode;
  if (key === current) return;
  current = key;
  if (!sheets) sheets = [generated, hand].map(css => { const el = document.createElement('style'); el.dataset.themeStyles = ''; document.head.appendChild(el); return { el, blocks: blocks(css) }; });
  for (const s of sheets) s.el.textContent = s.blocks.filter(b => b.test(theme, mode)).map(b => b.text).join('\n');
}
// Anything else that changes the theme or mode on the page (a preview, a test) is followed too.
if (typeof MutationObserver !== 'undefined') new MutationObserver(syncThemeStyles).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] });
