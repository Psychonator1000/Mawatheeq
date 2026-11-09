// The app opens in the blink of an eye: the screen it showed last is kept (on leaving or hiding the page), and
// public/instant.js shows it again on the next visit before the app has even loaded. As soon as the live page is ready
// it takes over in place; until then the copy cannot be clicked. Kept only for the signed-in session it came from,
// and deleted with the rest of the account's copies when the session ends.
const KEY = 'mawatheeq.instant.v1', SESSION = 'mawatheeq.local-session.v1', LIMIT = 1_500_000, WAIT = 4000;

/** This version of the app (its stylesheet's name changes with each release): a screen kept by another version is not shown. */
// The first stylesheet is the app's own (pages opened later add theirs after it).
const buildOf = () => document.querySelector('link[rel=stylesheet]')?.getAttribute('href') || '';
const tagOf = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };

/** The live page is ready to take over: a page is drawn and it is not still loading as a whole. */
function ready(root: HTMLElement) {
  // A placeholder further down (a chart still loading) does not hold it back: only a page still loading as a whole.
  return !!root.querySelector('.main, .auth-page, .workspace-chooser, .department-shell') && !root.querySelector('[data-loading]');
}

/** Takes the saved screen away (at once, or with a short fade when it is already showing over a ready page). */
function dropScreen() {
  const layer = document.getElementById('instant-screen');
  document.querySelectorAll('style[data-instant-style]').forEach(s => s.remove());
  if (!layer) return;
  layer.classList.add('leaving');
  window.setTimeout(() => layer.remove(), 160);
}

/** Watches for the live page to be ready, then takes the saved screen away; never waits more than a few seconds. */
export function startInstant() {
  const root = document.getElementById('root');
  if (!root) return;
  if (document.getElementById('instant-screen')) {
    let frame = 0;
    const check = () => { frame = 0; if (ready(root)) { observer.disconnect(); window.clearTimeout(timer); dropScreen(); } };
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(check); });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const timer = window.setTimeout(() => { observer.disconnect(); dropScreen(); }, WAIT);
    check();
  }
  const save = () => { try { saveScreen(root); } catch { /* The next visit opens as before. */ } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);
}

function saveScreen(root: HTMLElement) {
  const token = localStorage.getItem(SESSION);
  if (!token || document.getElementById('instant-screen') || !ready(root) || root.querySelector('.skeleton')) return;
  // Only a settled page: no dialog, menu or message open, nothing loading.
  if (root.querySelector('[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [data-radix-popper-content-wrapper]') || document.querySelector('body > [role=dialog]')) return;
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[data-sonner-toaster], [data-no-snapshot], script, iframe, video, audio, canvas, .motion-layer, input[type=file]').forEach(el => el.remove());
  const html = copy.innerHTML;
  if (!html || html.length > LIMIT) { localStorage.removeItem(KEY); return; }
  const attrs: Record<string, string> = {};
  for (const a of Array.from(document.documentElement.attributes)) if (a.name.startsWith('data-') || a.name === 'class' || a.name === 'style') attrs[a.name] = a.value;
  const styles = Array.from(document.querySelectorAll<HTMLStyleElement>('style[data-theme-styles]')).map(s => s.textContent || '');
  localStorage.setItem(KEY, JSON.stringify({ v: 1, tag: tagOf(token), hash: location.hash, build: buildOf(), at: Date.now(), attrs, styles, html }));
}

/** Forgets the saved screen (sign-out, an ended session). */
export function forgetInstant() { try { localStorage.removeItem(KEY); } catch { /* Nothing kept. */ } }
