// Helpers for creating staff accounts: Latin usernames suggested from Arabic names, and generated passwords.
const LETTERS: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th',
  'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
  'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a', 'ء': '', 'ئ': 'e', 'ؤ': 'o',
};
/** The person's name without titles such as «ا/» or «المحامي». */
export function personName(label: string): string {
  return label.replace(/^\s*(?:(?:ال)?محام[يى]ة?|الأستاذ(?:ة)?|أ\s*[/.]|ا\s*[/.]|د\s*[/.])\s*/u, '').replace(/\s+/g, ' ').trim();
}
/** Usual Latin spellings of common names, since short vowels are not written in Arabic. */
const NAMES: Record<string, string> = {
  'محمد': 'mohammad', 'احمد': 'ahmad', 'محمود': 'mahmoud', 'مصطفى': 'mustafa', 'يوسف': 'yousef', 'ابراهيم': 'ibrahim', 'اسماعيل': 'ismail',
  'عبدالله': 'abdullah', 'عبدالرحمن': 'abdulrahman', 'عبدالعزيز': 'abdulaziz', 'عبدالمحسن': 'abdulmohsen', 'عبدالكريم': 'abdulkarim',
  'عبدالوهاب': 'abdulwahab', 'عبدالرزاق': 'abdulrazzaq', 'عبدالحميد': 'abdulhamid', 'عبدالمجيد': 'abdulmajeed', 'عبدالباسط': 'abdulbasit',
  'علي': 'ali', 'حسن': 'hassan', 'حسين': 'hussain', 'خالد': 'khaled', 'سعيد': 'saeed', 'سعد': 'saad', 'سالم': 'salem', 'سلمان': 'salman',
  'سليمان': 'sulaiman', 'فهد': 'fahad', 'فيصل': 'faisal', 'ناصر': 'nasser', 'نواف': 'nawaf', 'مشعل': 'mishal', 'بدر': 'bader', 'جاسم': 'jassim',
  'حمد': 'hamad', 'حامد': 'hamed', 'طارق': 'tareq', 'عمر': 'omar', 'عثمان': 'othman', 'عادل': 'adel', 'عماد': 'emad', 'وليد': 'waleed',
  'ياسر': 'yasser', 'هاني': 'hani', 'هشام': 'hesham', 'كريم': 'karim', 'مريم': 'maryam', 'فاطمة': 'fatima', 'نورة': 'noura', 'سارة': 'sara',
  'امل': 'amal', 'منى': 'mona', 'هدى': 'huda', 'ريم': 'reem', 'دانة': 'dana', 'اسلام': 'islam', 'ايمن': 'ayman', 'ايهاب': 'ehab',
  'السباعي': 'alsebaei', 'ابوالليزيد': 'abualyazid', 'ابوزيد': 'abuzaid', 'الشطي': 'alshaty', 'العنزي': 'alenezi', 'المطيري': 'almutairi',
  'العجمي': 'alajmi', 'الرشيدي': 'alrashidi', 'الشمري': 'alshammari', 'الكندري': 'alkandari', 'العازمي': 'alazmi', 'الهاجري': 'alhajri',
  'الدوسري': 'aldossari', 'الظفيري': 'aldhafiri', 'العتيبي': 'alotaibi', 'الحربي': 'alharbi', 'الفضلي': 'alfadhli', 'السبيعي': 'alsubaie',
  'القحطاني': 'alqahtani', 'البلوشي': 'albalushi', 'الخالدي': 'alkhalidi', 'الصباح': 'alsabah', 'المري': 'almarri', 'الكبيسي': 'alkubaisi',
};
const isLetter = (ch?: string) => !!ch && ch in LETTERS;
/** One Arabic word in Latin letters: a known name, or letter by letter with و/ي read as vowels between letters. */
function romanize(word: string): string {
  const w = word.replace(/[أإآ]/g, 'ا').replace(/[\u064B-\u0652ـ]/g, '');
  const known = NAMES[w] || NAMES[w.replace(/ة$/, 'ه')];
  if (known) return known;
  const chars = [...w];
  return chars.map((ch, i) => {
    const prev = chars[i - 1], next = chars[i + 1];
    if (i === 0 && ch === 'ا' && next === 'ل') return 'a';
    // و and ي after a letter are usually long vowels (يوسف, الشطي); at the start of a word they are consonants.
    if (ch === 'و' && i > 0 && isLetter(prev) && prev !== 'ا') return next ? 'o' : 'w';
    if (ch === 'ي' && i > 0 && isLetter(prev) && prev !== 'ا') return next ? 'ee' : 'i';
    return LETTERS[ch] ?? (/[a-z0-9]/i.test(ch) ? ch.toLowerCase() : '');
  }).join('');
}
/** A Latin username suggestion such as «yousef.alshaty», unique among `taken`. Always editable before saving. */
export function suggestUsername(label: string, taken: Iterable<string>): string {
  // «عبد الله» and «أبو زيد» are one name each.
  const name = personName(label).replace(/(^|\s)(عبد|ابو|أبو)\s+/gu, '$1$2');
  const words = name.split(' ').map(romanize).filter(Boolean);
  let base = words.join('.').replace(/\.{2,}/g, '.').slice(0, 28).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (base.length < 3) base = ('staff' + (base ? '.' + base : '')).slice(0, 28);
  const used = new Set([...taken].map(u => u.toLowerCase()));
  let candidate = base, n = 2;
  while (used.has(candidate)) candidate = `${base}${n++}`;
  return candidate;
}
/** A readable random password, e.g. «Kufa-7342-Ratel-Mivo» (about 50 bits; sign-in attempts are rate-limited and locked). */
export function generatePassword(): string {
  const consonants = 'bcdfghjkmnprstvz', vowels = 'aeiou';
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const word = () => { let w = ''; for (let i = 0; i < 4; i++) w += i % 2 ? pick(vowels) : pick(consonants); return w[0].toUpperCase() + w.slice(1); };
  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000);
  return [word(), digits, word(), word()].join('-');
}
