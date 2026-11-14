// The governorate of an address from its area (owner, 14 November 2026: «we need the full address though»). A payment
// order's address reads «المحافظة - المنطقة - ق - ش - م …»; a stretched governorate («الجهـــراء») can come out of the
// scan as Latin junk, and each residential area lies in one governorate, so the area gives it back.

export const GOVERNORATES: Record<string, string[]> = {
  'العاصمة': ['الكويت', 'مدينة الكويت', 'الشرق', 'المرقاب', 'القبلة', 'الصالحية', 'دسمان', 'بنيد القار', 'الدسمة', 'الدعية', 'المنصورية', 'القادسية', 'الفيحاء',
    'النزهة', 'الروضة', 'العديلية', 'الخالدية', 'كيفان', 'الشامية', 'الشويخ', 'الصليبيخات', 'الدوحة', 'غرناطة', 'القيروان', 'النهضة', 'عبدالله السالم', 'اليرموك',
    'قرطبة', 'السرة', 'المطبة'],
  'حولي': ['حولي', 'السالمية', 'الرميثية', 'الجابرية', 'مشرف', 'بيان', 'سلوى', 'الشعب', 'الشهداء', 'حطين', 'الزهراء', 'الصديق', 'السلام', 'مبارك العبدالله',
    'البدع', 'ميدان حولي', 'النقرة'],
  'الفروانية': ['الفروانية', 'خيطان', 'جليب الشيوخ', 'العارضية', 'الأندلس', 'الرابية', 'الرحاب', 'الرقعي', 'الضجيج', 'العمرية', 'الفردوس', 'اشبيلية', 'صباح الناصر',
    'عبدالله المبارك', 'عبدالله مبارك الصباح', 'العباسية', 'الحساوي', 'الشدادية', 'غرب عبدالله المبارك', 'جنوب عبدالله المبارك'],
  'الجهراء': ['الجهراء', 'تيماء', 'الصليبية', 'القصر', 'النسيم', 'العيون', 'الواحة', 'النعيم', 'سعد العبدالله', 'امغرة', 'كبد', 'العبدلي', 'الصبية', 'المطلاع',
    'جابر الأحمد', 'القيصرية', 'كاظمة', 'الصليبية الصناعية', 'العيون الجديدة'],
  'الأحمدي': ['الأحمدي', 'الفحيحيل', 'المنقف', 'أبو حليفة', 'الصباحية', 'الرقة', 'هدية', 'الفنطاس', 'المهبولة', 'العقيلة', 'الظهر', 'علي صباح السالم', 'صباح الأحمد',
    'الوفرة', 'الزور', 'الخيران', 'جابر العلي', 'فهد الأحمد', 'الشعيبة', 'بنيدر', 'الجليعة', 'النويصيب', 'الأحمدي الجديدة', 'ضاحية فهد الأحمد'],
  'مبارك الكبير': ['مبارك الكبير', 'القرين', 'القصور', 'العدان', 'صباح السالم', 'المسيلة', 'أبو فطيرة', 'الفنيطيس', 'أبو الحصانية', 'المسايل', 'صبحان'],
};
/** The spelling-free form used to compare names: no tatweel, no spaces, one form of ا/ه/ي, no leading «ال». */
export const placeKey = (s: string) => String(s || '').replace(/ـ/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^ء-ي0-9]/g, '').replace(/^(?:مدينه|ضاحيه)/, '').replace(/^ال/, '');
const AREA = new Map<string, string>(), GOV = new Map<string, string>();
for (const [gov, areas] of Object.entries(GOVERNORATES)) {
  GOV.set(placeKey(gov), gov);
  for (const a of areas) AREA.set(placeKey(a), gov);
}
// The governorates as they are also written.
for (const [alias, gov] of [['محافظة العاصمة', 'العاصمة'], ['حولى', 'حولي'], ['الفراونية', 'الفروانية'], ['الاحمدي', 'الأحمدي'], ['مبارك', 'مبارك الكبير']] as const) GOV.set(placeKey(alias), gov);

/** The governorate a part of an address names, if any. */
export const governorateOf = (part: string) => GOV.get(placeKey(part)) || '';
/** The governorate an area lies in, if the area is known; «صباح الأحمد السكنية» is «صباح الأحمد». */
export function areaGovernorate(part: string): string {
  const k = placeKey(part);
  if (AREA.has(k)) return AREA.get(k)!;
  let best = '';
  for (const a of AREA.keys()) if (a.length >= 4 && k.startsWith(a) && a.length > best.length) best = a;
  return best ? AREA.get(best)! : '';
}
/** How many letters apart two names are (insertions, deletions, changes). */
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const cur = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  }
  return row[b.length];
}

/**
 * An address with its governorate: kept as written when the scan read it; when its first part is junk (Latin letters,
 * nothing Arabic), a misreading of the governorate one or two letters off («الاحصدي» for «الأحمدي»), or there is no
 * governorate at all, the governorate of the area that follows is put in its place.
 */
export function withGovernorate(address: string): string {
  const parts = address.split(/\s+-\s+/);
  if (parts.length < 2) return address;
  // Written in its proper form: «العاصمه» → «العاصمة», «الاحمدي» → «الأحمدي».
  if (governorateOf(parts[0])) return [governorateOf(parts[0]), ...parts.slice(1)].join(' - ');
  const junk = /[A-Za-z]/.test(parts[0]) && !/[\u0621-\u064A]{3,}/.test(parts[0]);
  const fromNext = areaGovernorate(parts[1]);
  if (junk) return fromNext ? [fromNext, ...parts.slice(1)].join(' - ') : address;
  if (fromNext && distance(placeKey(parts[0]), placeKey(fromNext)) <= 2) return [fromNext, ...parts.slice(1)].join(' - ');
  const own = areaGovernorate(parts[0]);
  return own && !parts.some(p => governorateOf(p)) ? [own, ...parts].join(' - ') : address;
}
