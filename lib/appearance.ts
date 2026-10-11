// Per-device display preferences. Purely cosmetic: never affects records or permissions.
export const THEMES = {
  burgundy: { label: 'عنابي مواثيق', swatch: '#74283b', accent: '#d8b98f' },
  noir: { label: 'أسود وذهبي', swatch: '#0b0a08', accent: '#d4af37' },
  ivory: { label: 'أبيض وذهبي', swatch: '#c99d2e', accent: '#ffffff' },
  sunflower: { label: 'أصفر مشمس', swatch: '#ffc928', accent: '#fff3b0' },
  royal: { label: 'أزرق وذهبي', swatch: '#163a66', accent: '#d4af37' },
  sky: { label: 'أزرق سماوي (Aero)', swatch: '#2fa8e8', accent: '#c8f0a8' },
  navy: { label: 'كحلي', swatch: '#1f3d63', accent: '#b9cbe0' },
  teal: { label: 'فيروزي', swatch: '#0f6e6a', accent: '#7ee0d2' },
  emerald: { label: 'زمردي', swatch: '#1d5e4b', accent: '#c9dfb8' },
  sunset: { label: 'برتقالي الغروب', swatch: '#b0451f', accent: '#ffb27a' },
  rose: { label: 'وردي', swatch: '#a3325a', accent: '#f7a8c4' },
  plum: { label: 'بنفسجي', swatch: '#5a2d6e', accent: '#e0c2d6' },
  indigo: { label: 'نيلي', swatch: '#3b3f9e', accent: '#b4b8ff' },
  copper: { label: 'نحاسي', swatch: '#8a4a24', accent: '#ecd0a3' },
  graphite: { label: 'رمادي فحمي', swatch: '#33393f', accent: '#c4ccd4' },
  phantom: { label: 'لصوص القلوب', swatch: '#e60012', accent: '#0d0d0d', hidden: true },
} as const;
type ThemeInfo = { label: string; swatch: string; accent: string; hidden?: boolean };
/** Hidden themes appear in the list only after their secret word is typed (an easter egg). */
export const SECRET_WORDS: Record<string, keyof typeof THEMES> = { persona: 'phantom', phantom: 'phantom', aero: 'sky' };
export const TEXT_SIZES = { normal: { label: 'عادي' }, large: { label: 'كبير' }, xlarge: { label: 'كبير جداً' } } as const;
export const DENSITIES = { comfortable: { label: 'مريحة' }, compact: { label: 'مضغوطة', hint: 'صفوف أقل ارتفاعاً لعرض سجلات أكثر' } } as const;
export const isHidden = (t: string) => !!(THEMES as Record<string, ThemeInfo>)[t]?.hidden;
export const BACKDROPS = {
  constellation: { label: 'شبكة نقاط حية', hint: 'نقاط متصلة تتجنب المؤشر وتتموج مع الضغط والتمرير' },
  fireflies: { label: 'يراعات مضيئة', hint: 'أضواء صغيرة تطفو وتنجذب إلى المؤشر' },
  aurora: { label: 'شفق متحرك', hint: 'هالات لونية ناعمة تتبع المؤشر' },
  spotlight: { label: 'شبكة وضوء', hint: 'شبكة نقطية مع ضوء يتبع المؤشر' },
  waves: { label: 'موجات', hint: 'تدرجات تنساب ببطء' },
  none: { label: 'بدون خلفية', hint: 'خلفية ثابتة هادئة' },
} as const;
export const MOTION_LEVELS = {
  full: { label: 'كاملة', hint: 'نقاط عند الضغط، محتوى يتفاعل مع التمرير، إمالة البطاقات وتفاعل الخلفية' },
  calm: { label: 'هادئة', hint: 'حركة خفيفة دون إمالة أو تتبع للمؤشر' },
  off: { label: 'متوقفة', hint: 'بدون أي حركة' },
} as const;
export type Appearance = { theme: keyof typeof THEMES; backdrop: keyof typeof BACKDROPS; motion: keyof typeof MOTION_LEVELS; text: keyof typeof TEXT_SIZES; density: keyof typeof DENSITIES; unlocked: string[]; previous?: keyof typeof THEMES };
export const DEFAULT_APPEARANCE: Appearance = { theme: 'burgundy', backdrop: 'constellation', motion: 'full', text: 'normal', density: 'comfortable', unlocked: [] };
const key = 'mawatheeq.appearance.v1';

export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      theme: saved.theme in THEMES ? saved.theme : DEFAULT_APPEARANCE.theme,
      backdrop: saved.backdrop in BACKDROPS ? saved.backdrop : DEFAULT_APPEARANCE.backdrop,
      motion: saved.motion in MOTION_LEVELS ? saved.motion : DEFAULT_APPEARANCE.motion,
      text: saved.text in TEXT_SIZES ? saved.text : DEFAULT_APPEARANCE.text,
      density: saved.density in DENSITIES ? saved.density : DEFAULT_APPEARANCE.density,
      unlocked: Array.isArray(saved.unlocked) ? saved.unlocked.filter((t: string) => t in THEMES) : [],
      previous: saved.previous in THEMES ? saved.previous : undefined,
    };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = a.theme; root.dataset.backdrop = a.backdrop; root.dataset.motion = a.motion; root.dataset.text = a.text; root.dataset.density = a.density;
}
export function saveAppearance(a: Appearance) {
  applyAppearance(a);
  try { localStorage.setItem(key, JSON.stringify(a)); } catch { /* Preferences still apply for this visit. */ }
  window.dispatchEvent(new Event('mawatheeq-appearance'));
}
/** Any animation at all: not switched off here and not reduced by the device. */
export const motionAllowed = () => document.documentElement.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Pointer-driven effects run only with full motion and no reduced-motion preference. */
export const pointerEffectsOn = () => document.documentElement.dataset.motion === 'full' && motionAllowed();
/** Run a state change inside a view transition when the browser supports it and motion is allowed. */
export function withViewTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { skipTransition?: () => void } };
  if (!doc.startViewTransition || !motionAllowed()) { update(); return; }
  // The change must never depend on the animation: apply it directly if the transition stalls,
  // and end any transition still running (the page is not interactive during one).
  let done = false;
  const run = () => { if (!done) { done = true; update(); } };
  const transition = doc.startViewTransition(run);
  setTimeout(run, 400);
  setTimeout(() => transition?.skipTransition?.(), 1500);
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
