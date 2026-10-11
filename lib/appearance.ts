// Per-device display preferences. Purely cosmetic: never affects records or permissions.
export const THEMES = {
  burgundy: { label: 'عنابي مواثيق', swatch: '#74283b', accent: '#d8b98f' },
  noir: { label: 'أسود وذهبي', swatch: '#0b0a08', accent: '#d4af37' },
  ivory: { label: 'أبيض وذهبي', swatch: '#c99d2e', accent: '#ffffff' },
  sunflower: { label: 'أصفر مشمس', swatch: '#ffc928', accent: '#fff3b0' },
  sky: { label: 'أزرق سماوي', swatch: '#1d6fa5', accent: '#8fd3ff' },
  navy: { label: 'كحلي', swatch: '#1f3d63', accent: '#b9cbe0' },
  teal: { label: 'فيروزي', swatch: '#0f6e6a', accent: '#7ee0d2' },
  emerald: { label: 'زمردي', swatch: '#1d5e4b', accent: '#c9dfb8' },
  sunset: { label: 'برتقالي الغروب', swatch: '#b0451f', accent: '#ffb27a' },
  rose: { label: 'وردي', swatch: '#a3325a', accent: '#f7a8c4' },
  plum: { label: 'بنفسجي', swatch: '#5a2d6e', accent: '#e0c2d6' },
  indigo: { label: 'نيلي', swatch: '#3b3f9e', accent: '#b4b8ff' },
  copper: { label: 'نحاسي', swatch: '#8a4a24', accent: '#ecd0a3' },
  graphite: { label: 'رمادي فحمي', swatch: '#33393f', accent: '#c4ccd4' },
} as const;
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
export type Appearance = { theme: keyof typeof THEMES; backdrop: keyof typeof BACKDROPS; motion: keyof typeof MOTION_LEVELS };
export const DEFAULT_APPEARANCE: Appearance = { theme: 'burgundy', backdrop: 'constellation', motion: 'full' };
const key = 'mawatheeq.appearance.v1';

export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      theme: saved.theme in THEMES ? saved.theme : DEFAULT_APPEARANCE.theme,
      backdrop: saved.backdrop in BACKDROPS ? saved.backdrop : DEFAULT_APPEARANCE.backdrop,
      motion: saved.motion in MOTION_LEVELS ? saved.motion : DEFAULT_APPEARANCE.motion,
    };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = a.theme; root.dataset.backdrop = a.backdrop; root.dataset.motion = a.motion;
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
