// Per-device display preferences. Purely cosmetic: never affects records or permissions.
export const THEMES = {
  burgundy: { label: 'عنابي مواثيق', swatch: '#74283b', accent: '#d8b98f' },
  // One gold theme: black and gold in dark mode, white and gold in light mode.
  noir: { label: 'ذهبي', swatch: '#0b0a08', accent: '#d4af37' },
  sunflower: { label: 'أصفر مشمس', swatch: '#ffc928', accent: '#fff3b0' },
  royal: { label: 'أزرق وذهبي', swatch: '#163a66', accent: '#d4af37' },
  sky: { label: 'أزرق سماوي (Aero)', swatch: '#2fa8e8', accent: '#c8f0a8' },
  navy: { label: 'كحلي', swatch: '#1f3d63', accent: '#b9cbe0' },
  teal: { label: 'فيروزي', swatch: '#0f6e6a', accent: '#7ee0d2' },
  emerald: { label: 'زمردي', swatch: '#1d5e4b', accent: '#c9dfb8' },
  sunset: { label: 'برتقالي الغروب', swatch: '#b0451f', accent: '#ffb27a' },
  rose: { label: 'ساكورا', swatch: '#a3325a', accent: '#ffd6e2' },
  plum: { label: 'بنفسجي', swatch: '#5a2d6e', accent: '#e0c2d6' },
  indigo: { label: 'نيلي', swatch: '#3b3f9e', accent: '#b4b8ff' },
  copper: { label: 'نحاسي', swatch: '#8a4a24', accent: '#ecd0a3' },
  graphite: { label: 'رمادي فحمي', swatch: '#33393f', accent: '#c4ccd4' },
  phantom: { label: 'لصوص القلوب', swatch: '#e60012', accent: '#0d0d0d', hidden: true },
  yorha: { label: 'يورها (NieR)', swatch: '#dedac7', accent: '#4e4b42', hidden: true },
} as const;
type ThemeInfo = { label: string; swatch: string; accent: string; hidden?: boolean };
/** Hidden themes appear in the list only after their secret word is typed (an easter egg). */
export const SECRET_WORDS: Record<string, keyof typeof THEMES> = { persona: 'phantom', phantom: 'phantom', aero: 'sky', sakura: 'rose', nier: 'yorha', yorha: 'yorha' };
export const TEXT_SIZES = { normal: { label: 'عادي' }, large: { label: 'كبير' }, xlarge: { label: 'كبير جداً' } } as const;
export const DENSITIES = { comfortable: { label: 'مريحة' }, compact: { label: 'مضغوطة', hint: 'صفوف أقل ارتفاعاً لعرض سجلات أكثر' } } as const;
export const isHidden = (t: string) => !!(THEMES as Record<string, ThemeInfo>)[t]?.hidden;
export const BACKDROPS = {
  constellation: { label: 'شبكة نقاط حية', hint: 'نقاط متصلة تتجنب المؤشر وتتموج مع الضغط والتمرير' },
  fireflies: { label: 'يراعات مضيئة', hint: 'أضواء صغيرة تطفو وتنجذب إلى المؤشر' },
  aurora: { label: 'شفق متحرك', hint: 'هالات لونية ناعمة تتبع المؤشر' },
  spotlight: { label: 'شبكة وضوء', hint: 'شبكة نقطية مع ضوء يتبع المؤشر' },
  waves: { label: 'موجات', hint: 'تدرجات تنساب ببطء' },
  web: { label: 'شبكة نقاط كثيفة', hint: 'مثل الشبكة الحية بنقاط أكثر وخيوط أطول' },
  starfield: { label: 'سماء ونجوم', hint: 'نجوم تتلألأ وتنساب، ونيزك يعبر بين حين وآخر' },
  snow: { label: 'ثلج هادئ', hint: 'ندف تتساقط وتتمايل ببطء' },
  ripples: { label: 'تموجات ماء', hint: 'حلقات تتسع على سطح ساكن، وكل ضغطة ترسم حلقتها' },
  petals: { label: 'بتلات متساقطة', hint: 'بتلات زهر الكرز تتساقط مع النسيم' },
  bubbles: { label: 'فقاعات زجاجية', hint: 'فقاعات لامعة تطفو للأعلى' },
  none: { label: 'بدون خلفية', hint: 'خلفية ثابتة هادئة' },
} as const;
export const MOTION_LEVELS = {
  full: { label: 'كاملة', hint: 'نقاط عند الضغط، محتوى يتفاعل مع التمرير، إمالة البطاقات وتفاعل الخلفية' },
  calm: { label: 'هادئة', hint: 'حركة خفيفة دون إمالة أو تتبع للمؤشر' },
  off: { label: 'متوقفة', hint: 'بدون أي حركة' },
} as const;
export const MODES = {
  auto: { label: 'حسب السمة', hint: 'الوضع الأصلي لكل سمة' },
  light: { label: 'فاتح' },
  dark: { label: 'داكن' },
} as const;
export const FOLLOWERS = {
  ring: { label: 'حلقة صغيرة' }, dot: { label: 'نقطة' }, diamond: { label: 'معيّن' }, off: { label: 'بدون', hint: 'إخفاء الشكل الذي يتبع المؤشر' },
} as const;
export const PERFORMANCE = {
  auto: { label: 'تلقائي', hint: 'يخفف المؤثرات وحده على الأجهزة الضعيفة' },
  lite: { label: 'خفيف', hint: 'بدون خلفية متحركة أو تأثيرات زجاجية؛ أسرع على الأجهزة القديمة' },
  full: { label: 'كامل', hint: 'كل المؤثرات دائماً' },
} as const;
export const CURSORS = {
  themed: { label: 'بألوان السمة', hint: 'مؤشر الفأرة يتلون مع السمة' },
  system: { label: 'مؤشر النظام' },
} as const;
export type Appearance = { theme: keyof typeof THEMES; backdrop: keyof typeof BACKDROPS; motion: keyof typeof MOTION_LEVELS; text: keyof typeof TEXT_SIZES; density: keyof typeof DENSITIES; mode: keyof typeof MODES; performance: keyof typeof PERFORMANCE; follower: keyof typeof FOLLOWERS; cursor: keyof typeof CURSORS; unlocked: string[]; previous?: keyof typeof THEMES };
export const DEFAULT_APPEARANCE: Appearance = { theme: 'burgundy', backdrop: 'constellation', motion: 'full', text: 'normal', density: 'comfortable', mode: 'auto', performance: 'auto', follower: 'ring', cursor: 'themed', unlocked: [] };
/** Themes whose own look is dark. */
const DARK_NATIVE = new Set<string>(['noir', 'phantom']);
/**
 * The stylesheet theme and mode actually applied. The gold theme is black and gold when dark and white and gold
 * when light; Persona has its own light "paper" version; every other theme gets a generated dark version.
 */
export function resolveTheme(a: Pick<Appearance, 'theme' | 'mode'>): { theme: string; dark: boolean; mode: '' | 'dark' } {
  const dark = a.mode === 'dark' || (a.mode === 'auto' && DARK_NATIVE.has(a.theme));
  if (a.theme === 'noir') return { theme: dark ? 'noir' : 'ivory', dark, mode: '' };
  if (a.theme === 'phantom') return { theme: dark ? 'phantom' : 'phantom-light', dark, mode: '' };
  // YoRHa: parchment and ink in light mode, near-black and parchment in dark mode.
  if (a.theme === 'yorha') return { theme: dark ? 'yorha-dark' : 'yorha', dark, mode: '' };
  return { theme: a.theme, dark, mode: dark ? 'dark' : '' };
}
const key = 'mawatheeq.appearance.v1';

export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      // The former separate white-and-gold theme is now the gold theme in light mode.
      theme: saved.theme === 'ivory' ? 'noir' : saved.theme in THEMES ? saved.theme : DEFAULT_APPEARANCE.theme,
      backdrop: saved.backdrop in BACKDROPS ? saved.backdrop : DEFAULT_APPEARANCE.backdrop,
      motion: saved.motion in MOTION_LEVELS ? saved.motion : DEFAULT_APPEARANCE.motion,
      text: saved.text in TEXT_SIZES ? saved.text : DEFAULT_APPEARANCE.text,
      density: saved.density in DENSITIES ? saved.density : DEFAULT_APPEARANCE.density,
      mode: saved.theme === 'ivory' && (saved.mode ?? 'auto') === 'auto' ? 'light' : saved.mode in MODES ? saved.mode : DEFAULT_APPEARANCE.mode,
      performance: saved.performance in PERFORMANCE ? saved.performance : DEFAULT_APPEARANCE.performance,
      follower: saved.follower in FOLLOWERS ? saved.follower : DEFAULT_APPEARANCE.follower,
      cursor: saved.cursor in CURSORS ? saved.cursor : DEFAULT_APPEARANCE.cursor,
      unlocked: Array.isArray(saved.unlocked) ? saved.unlocked.filter((t: string) => t in THEMES) : [],
      previous: saved.previous in THEMES ? saved.previous : undefined,
    };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  const view = resolveTheme(a);
  root.dataset.theme = view.theme; root.dataset.backdrop = a.backdrop; root.dataset.motion = a.motion; root.dataset.text = a.text; root.dataset.density = a.density;
  root.dataset.follower = a.follower; root.dataset.cursor = a.cursor;
  if (liteMode(a)) root.dataset.perf = 'lite'; else delete root.dataset.perf;
  if (view.mode) root.dataset.mode = view.mode; else delete root.dataset.mode;
  if (a.cursor === 'themed') applyThemedCursor(view.theme, view.dark); else { root.style.removeProperty('--cursor-arrow'); root.style.removeProperty('--cursor-hand'); }
}
const svgUrl = (svg: string, x: number, y: number, fallback: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;
/** Draws the mouse pointer in the current theme's colours (an arrow, and a filled variant over clickable things). */
function applyThemedCursor(theme: string, dark: boolean) {
  const root = document.documentElement, css = getComputedStyle(root);
  const brand = css.getPropertyValue('--brand').trim() || '#74283b';
  const accent = (THEMES as Record<string, ThemeInfo>)[theme === 'ivory' ? 'noir' : theme]?.accent || css.getPropertyValue('--glow-2').trim() || '#d8b98f';
  const edge = dark ? '#0b0b0b' : '#ffffff';
  const arrow = 'M6 3v21.5l5.6-5.3 3.8 8.4 3.6-1.6-3.8-8.3h7.7z';
  const shape = (fill: string, stroke: string, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${extra}<path d="${arrow}" fill="${fill}" stroke="${stroke}" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
  let normal: string, hand: string;
  if (theme.startsWith('phantom')) {
    // Comic-style: a hard red arrow with a black outline and an offset shadow.
    const shadow = `<path d="${arrow}" transform="translate(2.5 2.5)" fill="${theme === 'phantom' ? '#ffffff' : '#000000'}"/>`;
    normal = shape('#e60012', '#000000', shadow); hand = shape(theme === 'phantom' ? '#ffffff' : '#000000', '#e60012', shadow.replace(/fill="[^"]+"/, 'fill="#e60012"'));
  } else if (theme === 'rose') {
    // Sakura: a blush-pink arrow; over clickable things it carries a small blossom.
    const blush = '<defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3ea"/><stop offset="1" stop-color="#e2678f"/></linearGradient></defs>';
    const flower = '<g transform="translate(23 23)" fill="#f9bfd2" stroke="#d9466f" stroke-width=".8">' + [0, 72, 144, 216, 288].map(r => `<ellipse cy="-3.6" rx="2.6" ry="3.6" transform="rotate(${r})"/>`).join('') + '<circle r="1.4" fill="#d9466f"/></g>';
    normal = shape('url(#p)', dark ? '#2a0f18' : '#7a1f42', blush); hand = shape('url(#p)', dark ? '#2a0f18' : '#7a1f42', blush).replace('</svg>', flower + '</svg>');
  } else if (theme.startsWith('yorha')) {
    // YoRHa: a parchment arrow outlined in ink; over clickable things it becomes solid ink with a square marker.
    const [paper, ink] = theme === 'yorha-dark' ? ['#1d1c19', '#d6d0b5'] : ['#e9e5d5', '#4e4b42'];
    const mark = `<rect x="21" y="21" width="7" height="7" fill="${ink}" stroke="${paper}" stroke-width="1.2"/>`;
    normal = shape(paper, ink); hand = shape(ink, paper).replace('</svg>', mark + '</svg>');
  } else if (theme === 'sky') {
    // Aero: a glossy blue arrow with a white rim.
    const gloss = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfeaff"/><stop offset=".45" stop-color="#3fb3f0"/><stop offset="1" stop-color="#0d6fb0"/></linearGradient><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9ffd0"/><stop offset=".5" stop-color="#8fdc5a"/><stop offset="1" stop-color="#3f9a24"/></linearGradient></defs>';
    normal = shape('url(#g)', '#ffffff', gloss); hand = shape('url(#h)', '#ffffff', gloss);
  } else {
    normal = shape(brand, edge); hand = shape(accent, brand);
  }
  root.style.setProperty('--cursor-arrow', svgUrl(normal, 6, 3, 'auto'));
  root.style.setProperty('--cursor-hand', svgUrl(hand, 6, 3, 'pointer'));
}
export function saveAppearance(a: Appearance) {
  applyAppearance(a);
  try { localStorage.setItem(key, JSON.stringify(a)); } catch { /* Preferences still apply for this visit. */ }
  window.dispatchEvent(new Event('mawatheeq-appearance'));
}
/** Any animation at all: not switched off here and not reduced by the device. */
export const motionAllowed = () => document.documentElement.dataset.motion !== 'off' && document.documentElement.dataset.perf !== 'lite' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
const SLOW_KEY = 'mawatheeq.slow-device';
/** A device that is likely to struggle with the full effects: few cores, little memory, or data saver. */
let softwareGraphics: boolean | null = null;
/** Chrome draws without the graphics card (software rendering) when the driver is blocked or missing. */
function noGraphicsCard(): boolean {
  if (softwareGraphics !== null) return softwareGraphics;
  try {
    const gl = document.createElement('canvas').getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) return (softwareGraphics = true);
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return (softwareGraphics = /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(renderer));
  } catch { return (softwareGraphics = false); }
}
export function weakDevice(): boolean {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (n.hardwareConcurrency || 8) <= 4 || (n.deviceMemory || 8) <= 4 || !!n.connection?.saveData || noGraphicsCard();
}
/**
 * Remembered when the app measured repeated slow frames or graphics resets on this device, so later visits start
 * light. It lasts a week, then the device is measured again (a busy moment should not switch effects off for good).
 * The older permanent marker from before this rule is ignored.
 */
const SLOW_DAYS = 7;
type SlowMark = { at: number; reason: 'frames' | 'graphics' };
const readSlow = (): SlowMark | null => { try { const m = JSON.parse(localStorage.getItem(SLOW_KEY) || 'null') as SlowMark | null; return m && typeof m.at === 'number' && Date.now() - m.at < SLOW_DAYS * 864e5 ? m : null; } catch { return null; } };
export const markedSlow = () => !!readSlow();
export const markSlow = (reason: SlowMark['reason'] = 'frames') => { try { localStorage.setItem(SLOW_KEY, JSON.stringify({ at: Date.now(), reason })); } catch { /* Applies for this visit only. */ } };
export const clearSlow = () => { try { localStorage.removeItem(SLOW_KEY); } catch { /* Nothing stored. */ } };
/** Why automatic light mode is on, in the owner's words, or '' when it is off. */
export function liteReason(): string {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (noGraphicsCard()) return 'المتصفح يعمل دون بطاقة الرسوميات (تسريع الأجهزة متوقف في إعدادات المتصفح).';
  if ((n.hardwareConcurrency || 8) <= 4) return `المعالج بعدد أنوية قليل (${n.hardwareConcurrency}).`;
  if ((n.deviceMemory || 8) <= 4) return `ذاكرة الجهاز قليلة (${n.deviceMemory} GB).`;
  if (n.connection?.saveData) return 'وضع توفير البيانات مفعّل في المتصفح.';
  const m = readSlow(); if (!m) return '';
  const until = new Date(m.at + SLOW_DAYS * 864e5).toLocaleDateString('ar-KW');
  return (m.reason === 'graphics' ? 'تكررت إعادة تشغيل الرسوميات أثناء الاستخدام' : 'قاس التطبيق بطئاً متكرراً في الحركة') + ` — يُعاد القياس تلقائياً بعد ${until}.`;
}
/** Light mode: chosen explicitly, or automatic on a weak or measured-slow device. */
export const liteMode = (a: Pick<Appearance, 'performance'>) => a.performance === 'lite' || (a.performance === 'auto' && (weakDevice() || markedSlow()));
/** Pointer-driven effects run only with full motion and no reduced-motion preference. */
export const pointerEffectsOn = () => document.documentElement.dataset.motion === 'full' && motionAllowed();
/** Run a state change inside a view transition when the browser supports it and motion is allowed. */
export function withViewTransition(update: () => void) {
  // Page snapshots (the View Transitions API) made the whole screen flash blank on weak graphics cards, so the change
  // is applied directly; pages animate their own content in instead.
  update();
}
/**
 * Secret words toggle their theme: the first time switches to it, typing it again returns to the theme
 * used before. Hidden themes show in the theme list only while they are active.
 * Returns true when the theme was switched on.
 */
export function toggleSecretTheme(theme: keyof typeof THEMES): boolean {
  const a = loadAppearance();
  if (a.theme === theme) {
    saveAppearance({ ...a, theme: a.previous && a.previous !== theme ? a.previous : DEFAULT_APPEARANCE.theme, previous: undefined, unlocked: a.unlocked.filter(t => t !== theme) });
    return false;
  }
  saveAppearance({ ...a, theme, previous: a.theme, unlocked: a.unlocked.includes(theme) ? a.unlocked : [...a.unlocked, theme] });
  return true;
}
