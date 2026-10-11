// Per-device display preferences. Purely cosmetic: never affects records or permissions.
export const THEMES = {
  burgundy: { label: 'عنابي مواثيق', swatch: '#74283b' },
  navy: { label: 'كحلي', swatch: '#1f3d63' },
  emerald: { label: 'زمردي', swatch: '#1d5e4b' },
  plum: { label: 'بنفسجي', swatch: '#5a2d6e' },
  copper: { label: 'نحاسي', swatch: '#8a4a24' },
  graphite: { label: 'رمادي فحمي', swatch: '#33393f' },
} as const;
export const BACKDROPS = {
  aurora: { label: 'شفق متحرك', hint: 'هالات لونية ناعمة تتبع المؤشر' },
  spotlight: { label: 'شبكة وضوء', hint: 'شبكة نقطية مع ضوء يتبع المؤشر' },
  waves: { label: 'موجات', hint: 'تدرجات تنساب ببطء' },
  none: { label: 'بدون خلفية', hint: 'خلفية ثابتة هادئة' },
} as const;
export const MOTION_LEVELS = {
  full: { label: 'كاملة', hint: 'إمالة البطاقات، الظهور عند التمرير، وتفاعل الخلفية' },
  calm: { label: 'هادئة', hint: 'حركة خفيفة دون إمالة أو تتبع للمؤشر' },
  off: { label: 'متوقفة', hint: 'بدون أي حركة' },
} as const;
export type Appearance = { theme: keyof typeof THEMES; backdrop: keyof typeof BACKDROPS; motion: keyof typeof MOTION_LEVELS };
export const DEFAULT_APPEARANCE: Appearance = { theme: 'burgundy', backdrop: 'aurora', motion: 'full' };
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
/** Pointer-driven effects run only with full motion and no reduced-motion preference. */
export const pointerEffectsOn = () => document.documentElement.dataset.motion === 'full' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
