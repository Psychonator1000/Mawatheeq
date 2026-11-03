// Court names written out in full. The old register wrote «الكليه ت.م.ج/30»: the courthouse, its circuit in
// abbreviations and the circuit number in one string, sometimes with stray English letters. Here it becomes
// «المحكمة الكلية - تجاري مدني جزئي / 30»: courthouse, full circuit name, and the number after the slash
// (the form the app's circuit field reads: kind / number · قاعة N · الدور N).

const PLACES: [RegExp, string][] = [
  [/^ا?لكلي[هة]$/, 'المحكمة الكلية'],
  [/^(ال)?رقع[ىي]$/, 'محكمة الرقعي'],
  [/^حول[ىي]?$/, 'محكمة حولي'],
  [/^(ال)?[اأ]حمد[ىي]$/, 'محكمة الأحمدي'],
  [/^(ال)?جهراء$/, 'محكمة الجهراء'],
  [/^(ال)?فرواني[هة]$/, 'محكمة الفروانية'],
  [/^(ال)?عاصم[هة]$/, 'محكمة العاصمة'],
  [/^مبارك$/, 'محكمة مبارك الكبير'],
];

// Each abbreviation as the owner confirmed it (ت تجاري، م مدني، ج جزئي، ك كلي، ح حكومة، ع عمالي، س استئناف).
const LETTERS: Record<string, string> = { ت: 'تجاري', م: 'مدني', ج: 'جزئي', ك: 'كلي', ح: 'حكومة', ع: 'عمالي' };
const WORDS: Record<string, string> = {
  تجارى: 'تجاري', مدنى: 'مدني', عمالى: 'عمالي', جزئى: 'جزئي', كلى: 'كلي', ادارى: 'إداري', اداري: 'إداري', ادري: 'إداري',
  اسره: 'أسرة', اسرة: 'أسرة', اسريه: 'أسرية', مستانف: 'مستأنفة', مستانفه: 'مستأنفة', مستاف: 'مستأنفة', مستأنف: 'مستأنفة', مستئناف: 'مستأنفة',
  بلديه: 'بلدية', عاديه: 'عادية', تجاريه: 'تجارية', تجاره: 'تجارة', حكومه: 'حكومة', حكمومه: 'حكومة', ايجارات: 'إيجارات', ايجارت: 'إيجارات',
  ايجار: 'إيجارات', اسئناف: 'استئناف', اسستئناف: 'استئناف', استنئاف: 'استئناف', جنيات: 'جنايات', جنايه: 'جنايات', احول: 'أحوال',
  احوال: 'أحوال', شخصيه: 'شخصية', اعفاءات: 'إعفاءات', افلاس: 'إفلاس', شئون: 'شؤون', الشئون: 'الشؤون', شوون: 'شؤون', نيابه: 'نيابة',
  النيابه: 'النيابة', العامه: 'العامة', الاعلام: 'الإعلام', اعلام: 'إعلام', احداث: 'أحداث', امر: 'أمر', اداء: 'أداء', عريضه: 'عريضة',
  التجاريه: 'التجارية', الالكترونيه: 'الإلكترونية', اثبات: 'إثبات', حاله: 'حالة', وحده: 'وحدة', التامين: 'التأمين', اداره: 'إدارة',
  اطفاء: 'إطفاء', تميز: 'تمييز', تمييو: 'تمييز', التمييز: 'تمييز', المهبوله: 'المهبولة', بلده: 'بلدية', علي: 'على', الواحه: 'الواحة',
  ابوفطيره: 'أبو فطيرة',
};
// Words already written in full.
const FULL = new Set(['استئناف', 'تمييز', 'تجاري', 'مدني', 'عمالي', 'جزئي', 'كلي', 'حكومة', 'جزائي', 'جعفري', 'منازعات', 'تظلمات', 'مستعجل',
  'بيوع', 'جنح', 'جنايات', 'مرور', 'شيكات', 'تنفيذ', 'موظفين', 'مخالفات', 'ومخالفات', 'العمل', 'علاقات', 'تنظيم', 'دوائر', 'مخفر', 'معلومات',
  'الفنطاس', 'مبارك', 'أبو', 'فطيرة', 'عسكري', 'الوزراء', 'وزراء', ...Object.values(WORDS)]);
const FOR_JUNH = /^(مستان|مستاف|مستأنف|مستئناف|بلدي|بلده|عادي|تجاري|تجار|شيكات|مرور)/;
const GLUED = /^(تمييز|تميز|التمييز|استئناف|اسئناف)(.+)$/;

/** A circuit's name, word by word, with every abbreviation written out. `unsure` when a word's meaning is not certain. */
function expandKind(text: string): { kind: string; unsure: boolean } {
  // «تمييزت», «تمييزمدني», «استئنافت»: the court level written together with what follows it.
  const raw = text.replace(/[.]/g, ' ').split(/\s+/).filter(Boolean).flatMap(t => { const m = GLUED.exec(t); return m && (LETTERS[m[2]] || WORDS[m[2]] || FULL.has(m[2])) ? [m[1], m[2]] : [t]; });
  let unsure = false;
  const known = (t?: string) => !t || Boolean(LETTERS[t]) || /^(جزئ|كل|مدن|حكوم)/.test(t);
  const out = raw.map((t, i) => {
    const next = raw[i + 1], prev = raw[i - 1];
    if (t === 'س') { if (i === 0 && next !== undefined) return 'استئناف'; unsure = true; return t; }
    if (t === 'ج') {
      if (FOR_JUNH.test(next || '')) return 'جنح';
      if (/^(تمييز|تميز|جنح)$/.test(prev || '')) { unsure = true; return t; }
      return 'جزئي';
    }
    if (t === 'ت' || t === 'م') { if (prev === 'جنح' || !known(next)) { unsure = true; return t; } return LETTERS[t]; }
    if (LETTERS[t]) return LETTERS[t];
    if (WORDS[t]) return WORDS[t];
    if (FULL.has(t)) return t;
    unsure = true; return t;
  });
  return { kind: out.filter((w, i) => w !== out[i - 1]).join(' '), unsure };
}

export type CourtName = { value: string; changed: boolean; unsure: boolean };
/**
 * One court value written out in full; the hall and floor stay as they were. A value with any word whose meaning is
 * not certain is returned unchanged with `unsure`, for a person to decide.
 */
export function fullCourtName(value: string): CourtName {
  const original = String(value ?? '');
  const keep = { value: original, changed: false, unsure: false };
  let s = original.replace(/[‎‏ـ]/g, '').trim();
  if (!s) return keep;
  const tail = /\s*·\s*(قاعة|الدور)\s.*$/.exec(s), extra = tail ? ' · ' + tail[0].replace(/^\s*·\s*/, '').trim() : '';
  if (tail) s = s.slice(0, tail.index);
  s = s.replace(/[A-Za-z]+/g, ' ').replace(/[()]/g, ' ').replace(/(\D)0(\D)/g, '$1.$2').replace(/(?<!محكمة )مبارك\s*الكبير/g, ' مبارك ');
  const nums = [...s.matchAll(/[0-9٠-٩]+/g)], last = nums.at(-1);
  let number = '';
  if (last) { number = last[0]; s = s.slice(0, last.index) + ' ' + s.slice(last.index! + last[0].length); }
  if (nums.length > 1) return { ...keep, unsure: true };
  // A court already written in full keeps its name.
  let place = '';
  const full = PLACES.map(([, name]) => name).find(name => s.trim().startsWith(name));
  if (full) { place = full; s = s.trim().slice(full.length); }
  let tokens = s.replace(/[/\-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const placeOf = (t?: string) => (t && PLACES.find(([re]) => re.test(t))?.[1]) || '';
  const at = place ? -1 : tokens.findIndex(t => placeOf(t));
  if (at >= 0) { place = placeOf(tokens[at]); tokens = tokens.filter((_, i) => i !== at); }
  if (tokens.some(t => placeOf(t))) return { ...keep, unsure: true };
  // Not a court at all (e.g. «تحت الرفع»): left exactly as it was.
  if (!place && !number && tokens.join(' ') === 'تحت الرفع') return keep;
  const { kind, unsure } = expandKind(tokens.join(' '));
  if (unsure) return { ...keep, unsure: true };
  const result = [[place, kind].filter(Boolean).join(' - '), number].filter(Boolean).join(' / ') + extra;
  return { value: result, changed: result !== original, unsure: false };
}

/** The courts to pick from: every full court name already in use (no abbreviations), each once, most used first. */
export function courtChoices(values: string[], base: readonly string[] = []): string[] {
  const count = new Map<string, number>();
  for (const v of values) {
    const kind = String(v || '').replace(/\s*·\s*(قاعة|الدور)\s.*$/, '').replace(/\s*\/\s*[^/]*$/, '').trim();
    if (!kind || fullCourtName(kind).value !== kind || fullCourtName(kind).unsure) continue;
    count.set(kind, (count.get(kind) || 0) + 1);
  }
  for (const b of base) if (!count.has(b)) count.set(b, 0);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar')).map(([k]) => k);
}

/** The courthouses, written in full, to pick from. */
export const COURT_PLACES = [...new Set(PLACES.map(([, name]) => name))];
const isPlace = (s: string) => /^(ال)?محكمة\s/.test(s) || COURT_PLACES.includes(s);
/** A court written «المحكمة - نوع الدائرة» in its two parts; a value with only one of them fills that one. */
export function courtPart(kind: string): { place: string; type: string } {
  const k = String(kind || '').trim(), at = k.indexOf(' - ');
  if (at >= 0) return { place: k.slice(0, at).trim(), type: k.slice(at + 3).trim() };
  return isPlace(k) ? { place: k, type: '' } : { place: '', type: k };
}
export const joinCourt = (place: string, type: string) => [place.trim(), type.trim()].filter(Boolean).join(' - ');
