// One-time import of the old system's case registers: its per-case history reports (copied from the PDFs as text),
// the office's main register numbered from case 1 and the insurance companies' own registers. Each case gives its code,
// client and role, opponent, subject, court, file status, case and automatic numbers, and every court session, expert
// session and judgment. The register is the reference: names are cleaned by the office's rules and written in correct
// Arabic, and sessions become the app's session entries (each pointing to the next), so the roll and the posting
// checks read them as if they had been posted here. To be removed with its import tool once the import is done.
import { emptyCase, type CaseRecord, type Procedure } from './domain.ts';

export type LegacyEvent = { kind: 'session' | 'expert' | 'judgment'; level: string; date: string; text: string };
export type LegacyCase = {
  seq: number; code: string; client: string; clientId: string; role: string; opponent: string; opponentId: string;
  subject: string; court: string; status: string; caseNumber: string; autoNumber: string; events: LegacyEvent[];
};
/** Which register a file is: the office's main one, or an insurance company's own (with its own numbering). */
export type Register = { kind: 'main' | 'insurance'; company: string };

const DATE = /(\d{2})-(\d{2})-(\d{4})/;
const flip = (s: string) => s.replace(/\)([^()]*)\(/g, '($1)').replace(/\s+/g, ' ').trim();

/** Reads one register report. Page headers and footers are dropped and an entry split by a page break is joined. */
export function parseRegister(raw: string): { cases: LegacyCase[]; problems: string[] } {
  const lines = raw.normalize('NFKC').replace(/\r/g, '').split('\n').map(l => l.trim());
  const keep: string[] = [];
  for (const l of lines) {
    if (!l || l === 'مكتب مواثيق' || l.startsWith('للمحاماه') || l.startsWith('.....يتبع')) continue;
    if (keep.length && /^(جلسة محكمة|جلسة خبراء|حكم \S+)$/.test(keep[keep.length - 1]) && !/^\d+الجهة/.test(l)) { keep[keep.length - 1] += l; continue; }
    keep.push(l);
  }
  const cases: LegacyCase[] = [], problems: string[] = [];
  let cur: LegacyCase | null = null;
  for (const l of keep) {
    let m = /^(\d+)الجهة \/\s*(.*?)الصفة \/\s*(.*)$/.exec(l);
    if (m) {
      const id = /(\d{8,})\s*$/.exec(m[2]);
      cur = { seq: +m[1], code: '', client: (id ? m[2].slice(0, id.index) : m[2]).trim(), clientId: id ? id[1] : '', role: m[3].trim(),
        opponent: '', opponentId: '', subject: '', court: '', status: '', caseNumber: '', autoNumber: '', events: [] };
      cases.push(cur); continue;
    }
    if (!cur) { problems.push(l); continue; }
    if (l.startsWith('الخصم /')) {
      const o = l.slice('الخصم /'.length).trim(), id = /(\d{8,})\s*$/.exec(o);
      cur.opponent = flip(id ? o.slice(0, id.index) : o); cur.opponentId = id ? id[1] : ''; continue;
    }
    m = /^كود(\d+)الموضوع :(.*?)محكمة \/(.*)$/.exec(l);
    if (m) { cur.code = m[1]; cur.subject = flip(m[2]); cur.court = flip(m[3]); continue; }
    m = /^وضع الملف - (.*?)(?: ?دعوى رقم(.*?))?(?: ?ملف رقم(\d*))?\s*$/.exec(l);
    if (m) { cur.status = m[1].trim(); cur.caseNumber = (m[2] || '').trim(); cur.autoNumber = m[3] || ''; continue; }
    m = new RegExp('^(جلسة محكمة|جلسة خبراء|حكم (\\S+?))' + DATE.source + '(.*)$').exec(l);
    if (m) {
      cur.events.push({ kind: m[1] === 'جلسة محكمة' ? 'session' : m[1] === 'جلسة خبراء' ? 'expert' : 'judgment', level: m[2] || '',
        date: `${m[5]}-${m[4]}-${m[3]}`, text: flip(m[6]) });
      continue;
    }
    // A wrapped line continues the entry above it.
    const last = cur.events[cur.events.length - 1];
    if (last) last.text = flip(last.text + ' ' + l); else problems.push(l);
  }
  return { cases, problems };
}

/** A key for telling whether two spellings name the same party: letters unified, stars, IDs, «closed» and spacing ignored. */
export function nameKey(s: string) {
  return s.normalize('NFKC').toLowerCase().replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\d{8,}/g, '').replace(/مقفله|مفقله/g, '').replace(/ش\s*\.?\s*م\s*\.?\s*ك/g, '').replace(/[*().\-–—_/\\,،:+]/g, ' ').replace(/\s+/g, '');
}

export function detectRegister(cases: LegacyCase[]): Register {
  const counts = new Map<string, number>();
  for (const c of cases) for (const co of ['بوبيان', 'عنايه', 'وثاق']) if (nameKey(c.client).includes(co)) counts.set(co, (counts.get(co) || 0) + 1);
  const [company, n] = [...counts].sort((a, b) => b[1] - a[1])[0] || ['', 0];
  return n > cases.length * .8 ? { kind: 'insurance', company } : { kind: 'main', company: '' };
}

// Correct Arabic spelling: the old system dropped hamzas and wrote ة as ه and ى as ي (or the reverse). Only words known
// to need it are changed, plus the safe patterns (a final «ية» on adjectives, a final «ي» on family names).
const TA = new Set(('شركه مؤسسه مجموعه العامه عامه التجاره تجاره الاداره اداره المتنقله متنقله المحدوده محدوده ورثه مدرسه الخاصه خاصه شبكه '
  + 'الحياه حياه الدوله دوله السياحه سياحه هيئه الهيئه المنطقه منطقه القابضه قابضه الصحه وزاره الوزاره محافظه الاجاره اجاره المتحده متحده '
  + 'الجديده جديده مكتبه الصناعه صناعه الطاقه طاقه الخدمه خدمه الامانه امانه الشراكه شراكه الاغذيه اغذيه التكنولوجيا الشامله شامله المبتكره '
  + 'الدوليه الثقافه ثقافه المتكامله متكامله الممتازه ممتازه الذهبيه نجاه زكاه حمزه اسامه طلحه عبيده جمعه قتيبه حذيفه عكرمه خليفه معاويه '
  + 'فاطمه خديجه عائشه منيره نوره حصه عزه وضحه لطيفه شريفه رفيده طيبه ساره ريمه اميره سميره نعيمه حليمه جميله فريده شيخه فضه صالحه منيفه '
  + 'نبيله هنيه ساميه ناديه هانيه بدريه اسماء العزيزه سعيده حميده مريمه رحمه نعمه سلامه مشاعل').split(' '));
const NOT_YEH = new Set('فيه عليه اليه لديه وجيه نبيه فقيه الفقيه سيبويه نفطويه راهويه خالويه'.split(' '));
const HAMZA: Record<string, string> = {
  احمد: 'أحمد', ابراهيم: 'إبراهيم', اسماعيل: 'إسماعيل', اسامه: 'أسامة', امل: 'أمل', انور: 'أنور', اسعد: 'أسعد', ايمن: 'أيمن', ايوب: 'أيوب',
  اكرم: 'أكرم', اشرف: 'أشرف', امين: 'أمين', انس: 'أنس', ادريس: 'إدريس', الياس: 'إلياس', ايمان: 'إيمان', اميره: 'أميرة', اسراء: 'إسراء',
  اقبال: 'إقبال', اسماء: 'أسماء', التامين: 'التأمين', للتامين: 'للتأمين', تامين: 'تأمين', الاداره: 'الإدارة', اداره: 'إدارة', اموال: 'أموال',
  اولاد: 'أولاد', ابناء: 'أبناء', الاهلي: 'الأهلي', الاوسط: 'الأوسط', الاجاره: 'الإجارة', اجاره: 'إجارة', الاسنان: 'الأسنان', الانشاءات: 'الإنشاءات',
  انشاءات: 'إنشاءات', الانجليزيه: 'الإنجليزية', الانجليزية: 'الإنجليزية', الامريكيه: 'الأمريكية', الاعلاميه: 'الإعلامية', اعلاميه: 'إعلامية', الايطاليه: 'الإيطالية', الاولى: 'الأولى', الاولويه: 'الأولوية',
  اسلامي: 'إسلامي', الاسلاميه: 'الإسلامية', الالكترونيه: 'الإلكترونية', الامانه: 'الأمانة', امانه: 'أمانة', الامن: 'الأمن', الاثاث: 'الأثاث',
  الاغذيه: 'الأغذية', اغذيه: 'أغذية', الاعمار: 'الإعمار', الاسكان: 'الإسكان', الاهليه: 'الأهلية', الاوروبيه: 'الأوروبية', الانماء: 'الإنماء',
  مصطفي: 'مصطفى', مستشفي: 'مستشفى', موسي: 'موسى', عيسي: 'عيسى', يحيي: 'يحيى', ليلي: 'ليلى', هدي: 'هدى', سلمي: 'سلمى', نجوي: 'نجوى',
  سامى: 'سامي', ناجى: 'ناجي', هادى: 'هادي', فادى: 'فادي', راضى: 'راضي', حمدى: 'حمدي', مهدى: 'مهدي', شوقى: 'شوقي', فوزى: 'فوزي', رمزى: 'رمزي',
  صبحى: 'صبحي', لطفى: 'لطفي', زكى: 'زكي', علوى: 'علوي', مكى: 'مكي', بدوى: 'بدوي',
  سلوي: 'سلوى', مرتضي: 'مرتضى', مجتبي: 'مجتبى', الكبري: 'الكبرى', العظمي: 'العظمى', مني: 'منى', على: 'علي', الاسماعيل: 'الإسماعيل',
};
function fixWord(w: string): string {
  // «للتجاره» is «ل» + «التجاره» with its alif dropped.
  if (/^لل./.test(w)) { const f = fixWord('ال' + w.slice(2)); return f.startsWith('ال') || f.startsWith('الإ') || f.startsWith('الأ') ? 'لل' + f.slice(2) : w; }
  for (const pre of ['', 'و', 'ب', 'ل']) {
    if (pre && !w.startsWith(pre)) continue;
    const base = w.slice(pre.length);
    if (!base) continue;
    if (HAMZA[base]) return pre + HAMZA[base];
    if (base.startsWith('ال') && HAMZA[base.slice(2)] && /^[اإأ]/.test(HAMZA[base.slice(2)]) === false) return pre + 'ال' + HAMZA[base.slice(2)];
    if (/ه$/.test(base) && !NOT_YEH.has(base) && (TA.has(base) || (base.startsWith('ال') && TA.has(base.slice(2))) || (base.length > 3 && /يه$/.test(base) && /^(ال|لل)/.test(base)))) {
      return pre + base.slice(0, -1) + 'ة';
    }
    // Family names (الشطى) and «عبد» names (عبدالهادى) end in ي.
    if (/^(ال|عبد).{2,}ى$/.test(base)) return pre + base.slice(0, -1) + 'ي';
  }
  return w;
}
/** Correct Arabic spelling, word by word, with the hamza fixes applied to adjectives turned feminine too. */
export const fixArabic = (s: string) => s.replace(/([\u0600-\u06FF])([A-Za-z])/g, '$1 $2').replace(/([A-Za-z])([\u0600-\u06FF])/g, '$1 $2').split(' ').map(fixWord).join(' ').replace(/(?<!\S)ش\s*\.?\s*م\s*\.?\s*ك(?!\S)/g, 'ش.م.ك');

/**
 * The office's naming rules: no leading star, no «closed» (مقفلة) in words or brackets, English names in brackets lose
 * the brackets, brackets the old reports printed backwards are put right, and the civil ID is not part of a name.
 */
export function cleanName(raw: string): string {
  let s = flip(raw).replace(/^[*\s]+|[*\s]+$/g, '').replace(/\d{8,}\s*$/, '').replace(/\s*\.+\s*$/, '');
  s = s.replace(/\(\s*(?:ش\s*\.?\s*م\s*\.?\s*ك\s*)?(?:مقفله|مقفلة|مفقله)\s*\)/g, m => /ش/.test(m) ? 'ش.م.ك' : '').replace(/(?<!\S)(?:مقفله|مقفلة|مفقله)(?!\S)/g, '');
  s = s.replace(/\(\s*([A-Za-z0-9 .&-]+)\s*\)/g, ' $1 ').replace(/\(\s*\)/g, '');
  return fixArabic(s.replace(/\s+/g, ' ').trim());
}

/**
 * The register's history as the app's entries. A session's decision is what the next session was held for and its
 * follow-up is the next session's date, so the latest held session points to the coming one; a session still to come
 * is not an entry of its own. Two lines on the same day are one session and its outcome. Judgments are entries too.
 */
export function historyOf(c: LegacyCase, today: string): Procedure[] {
  const out: Procedure[] = [], sittings = c.events.filter(e => e.kind !== 'judgment');
  const judgedOn = new Set(c.events.filter(e => e.kind === 'judgment').map(e => e.date));
  const merged: (LegacyEvent & { outcome?: string })[] = [];
  for (const s of sittings) {
    const prev = merged[merged.length - 1];
    if (prev && prev.date === s.date && prev.kind === s.kind) { prev.outcome = s.text; continue; }
    merged.push({ ...s });
  }
  merged.forEach((s, i) => {
    const next = merged[i + 1];
    if (s.date > today) {
      // Nothing held yet: the case is filed with its first coming session.
      if (i === 0) out.push({ id: crypto.randomUUID(), kind: 'قيد الدعوى', date: '', text: s.text, followup: s.date, court: c.court, source: 'السجل القديم' });
      return;
    }
    out.push({
      id: crypto.randomUUID(), kind: s.kind === 'expert' ? 'جلسة خبراء' : 'جلسة', date: s.date, text: s.text, court: s.kind === 'expert' ? '' : c.court,
      venue: s.kind === 'expert' ? 'الخبراء' : 'المحكمة', source: 'السجل القديم',
      decision: s.outcome || (judgedOn.has(s.date) ? 'صدور الحكم' : next ? next.text : ''), followup: next && next.date > s.date ? next.date : '',
    });
  });
  for (const j of c.events.filter(e => e.kind === 'judgment'))
    out.push({ id: crypto.randomUUID(), kind: 'حكم / إجراء', date: j.date, text: `حكم ${j.level}: ${j.text}`, source: 'السجل القديم' });
  return out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

const LEVEL_TYPE: Record<string, string> = { ابتدائي: 'حكم أول درجة', معارضة: 'حكم أول درجة', استئناف: 'حكم استئناف', تمييز: 'حكم تمييز' };
const NEXT_LEVEL: Record<string, string> = { ابتدائي: 'استئناف', معارضة: 'استئناف', استئناف: 'تمييز', تمييز: 'تمييز' };
const LEVEL_STAGE: Record<string, string> = { ابتدائي: 'ابتدائي', معارضة: 'ابتدائي', استئناف: 'استئناف', تمييز: 'تمييز' };

/** What the register sets on a case it matches (the register wins), and the whole record for a case the app lacks. */
export function caseFromRegister(c: LegacyCase, register: Register, client: string, opponent: string, today: string) {
  const header = {
    code: c.code, client, clientGroup: client, role: c.role, opponent, subject: c.subject, court: c.court, caseNumber: c.caseNumber,
    legacyStatus: c.status, clientCivilId: c.clientId, opponentCivilId: c.opponentId,
    ...(register.kind === 'insurance' ? { insurance: true } : {}), ...(/^تنفيذ/.test(c.status) ? { executionFile: true } : {}),
  };
  const procedures = historyOf(c, today);
  const judgments = c.events.filter(e => e.kind === 'judgment'), last = judgments[judgments.length - 1];
  const after = last && c.events.some(e => e.kind !== 'judgment' && e.date > last.date);
  const stage = last ? (after ? NEXT_LEVEL[last.level] || 'ابتدائي' : LEVEL_STAGE[last.level] || 'ابتدائي') : 'ابتدائي';
  const newCase: CaseRecord = {
    ...emptyCase(), ...header, autoNumber: c.autoNumber, procedures, stage,
    type: last && LEVEL_TYPE[last.level] && !after ? LEVEL_TYPE[last.level] : LEVEL_TYPE[stage] || 'حكم أول درجة',
    date: last && !after ? last.date : '', ruling: last && !after ? last.text : '',
  } as CaseRecord;
  return { autoNumber: c.autoNumber, code: c.code, insurance: register.kind === 'insurance', header, procedures, newCase };
}
