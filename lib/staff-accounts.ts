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
/** A Latin username suggestion such as «jamal.alkhatib», unique among `taken`. Always editable before saving. */
export function suggestUsername(label: string, taken: Iterable<string>): string {
  const words = personName(label).split(' ').map(w => [...w].map(ch => LETTERS[ch] ?? (/[a-z0-9]/i.test(ch) ? ch.toLowerCase() : '')).join('')).filter(Boolean);
  let base = words.join('.').replace(/\.{2,}/g, '.').slice(0, 28).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (base.length < 3) base = ('staff' + (base ? '.' + base : '')).slice(0, 28);
  const used = new Set([...taken].map(u => u.toLowerCase()));
  let name = base, n = 2;
  while (used.has(name)) name = `${base}${n++}`;
  return name;
}
/** A readable random password, e.g. «Kufa-7342-Ratel-Mivo» (about 50 bits; sign-in attempts are rate-limited and locked). */
export function generatePassword(): string {
  const consonants = 'bcdfghjkmnprstvz', vowels = 'aeiou';
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const word = () => { let w = ''; for (let i = 0; i < 4; i++) w += i % 2 ? pick(vowels) : pick(consonants); return w[0].toUpperCase() + w.slice(1); };
  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000);
  return [word(), digits, word(), word()].join('-');
}
