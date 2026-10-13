/** Collections follow-up: file statuses, statements (إفادات) and payments, and the file's financial position. */

export const FILE_STATUSES = ['تحصيل ودي', 'جاهز للمحكمة', 'أمر أداء', 'دعوى قضائية', 'تنفيذ', 'تقسيط', 'مسدد', 'موقوف', 'مغلق'];
/** Statuses kept as written from the office's previous collections system. */
export const LEGACY_STATUSES = ['سوفت', 'تحت الرفع', 'سكت', 'حفظ'];
export const ALL_FILE_STATUSES = [...FILE_STATUSES, ...LEGACY_STATUSES];
export const EXECUTION_STATUSES = ['لم يُفتح', 'مفتوح', 'حجز', 'منع سفر', 'ضبط وإحضار', 'حبس', 'مسدد', 'مغلق'];
/** Statuses that count as finished files in the dashboard. */
export const CLOSED_STATUSES = ['مسدد', 'مغلق'];

export type StatementCategory = 'calls' | 'execution' | 'addresses' | 'admin';
export const STATEMENT_CATEGORIES: [StatementCategory, string][] = [['calls', 'اتصالات'], ['execution', 'تنفيذ'], ['addresses', 'عناوين خصوم'], ['admin', 'إداري']];
export const STATEMENT_ACTIONS: Record<StatementCategory, string[]> = {
  calls: ['اتصال بالخصم', 'اتصال بالموكل', 'رسالة واتساب', 'وعد بالسداد', 'رفض السداد', 'طلب تقسيط', 'الرقم مغلق', 'لا يرد', 'الرقم خطأ أو مفصول', 'متابعة'],
  execution: ['فتح ملف تنفيذ', 'إعلان بالصيغة التنفيذية', 'طلب حجز', 'حجز على راتب', 'حجز على حساب', 'منع سفر', 'ضبط وإحضار', 'استعلام عن أموال', 'تحصيل من التنفيذ', 'متابعة'],
  addresses: ['عنوان جديد', 'تحري عن العنوان', 'العنوان غير صحيح', 'إعلان على العنوان', 'متابعة'],
  admin: ['مراجعة إدارية', 'تحويل الملف', 'طلب مستندات من الموكل', 'تحديث بيانات', 'مراسلة الموكل', 'متابعة'],
};
export type StatementStatus = 'done' | 'notDone' | 'postponed';
export const STATEMENT_STATUSES: [StatementStatus, string][] = [['done', 'منجز'], ['notDone', 'غير منجز'], ['postponed', 'مؤجل']];
export const CONTACT_PARTIES: [string, string][] = [['defendant', 'الخصم'], ['client', 'الموكل'], ['other', 'آخر']];
export const CONTACT_METHODS: [string, string][] = [['', 'غير محدد'], ['phone', 'الهاتف'], ['whatsapp', 'الواتساب']];
export type StatementData = { category: StatementCategory; action: string; reviewDate: string; status: StatementStatus; text: string; phone: string; contactParty: string; method: string };

export type PaymentType = 'payment' | 'external' | 'expense';
export const PAYMENT_TYPES: [PaymentType, string][] = [['payment', 'دفعة على الملف'], ['external', 'سداد خارجي'], ['expense', 'مصروف']];
export const PAYMENT_METHODS = ['نقداً', 'تحويل بنكي', 'كي نت', 'رابط دفع', 'شيك', 'استقطاع من التنفيذ'];
export type PaymentData = { type: PaymentType; date: string; amount: string; amountMinor?: string; method: string; reference: string; notes: string; status?: 'posted' | 'void'; voidReason?: string };

/** Fils (1/1000 KWD) from a typed amount; invalid or empty → 0. */
export function fils(value: unknown): number {
  const v = String(value ?? '').trim();
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(v)) return 0;
  const [whole, frac = ''] = v.split('.');
  return Number(whole) * 1000 + Number((frac + '000').slice(0, 3));
}
export const kwd = (minor: number) => `${minor < 0 ? '-' : ''}${Math.floor(Math.abs(minor) / 1000)}.${String(Math.abs(minor) % 1000).padStart(3, '0')}`;

export type Position = { claim: number; fee: number; total: number; paid: number; external: number; expenses: number; remaining: number; net: number };
/**
 * The file's financial position in fils. Total claim = claim + order-of-payment fee. Paid counts payments on the
 * file and payments made directly to the client. Remaining = total claim − paid. Net collected = paid − expenses.
 * Cancelled payments do not count.
 */
export function position(file: { amount?: string; orderFee?: string }, payments: PaymentData[]): Position {
  const live = payments.filter(p => p.status !== 'void');
  const sum = (t: PaymentType) => live.filter(p => p.type === t).reduce((n, p) => n + (p.amountMinor ? Number(p.amountMinor) : fils(p.amount)), 0);
  const claim = fils(file.amount), fee = fils(file.orderFee), paidOnFile = sum('payment'), external = sum('external'), expenses = sum('expense');
  const paid = paidOnFile + external, total = claim + fee;
  return { claim, fee, total, paid, external, expenses, remaining: total - paid, net: paid - expenses };
}
/** Statements that need attention: not done or postponed, with a review date today or earlier. */
export function dueStatements<T extends { payload: StatementData; archived?: boolean }>(rows: T[], today: string) {
  return rows.filter(r => !r.archived && r.payload.status !== 'done' && r.payload.reviewDate && r.payload.reviewDate <= today);
}

/** One file read from a النظام السابق export, with the totals it carried (posted later as opening balances). */
export type LegacyFile = { row: number; payload: Record<string, string>; paid: string; expenses: string; autoNumber: string };
const LEGACY_EMPTY = /^(?:فارغ|null|بدون|0|-)?$/i;
/**
 * Maps the export's columns to a collection file. «سبب المديونية» holds the customer's number at the client company;
 * «الرقم الآلى - ملف» is kept as written and also returned when it is a court file number, to link the case.
 */
export function mapLegacy(header: unknown[], rows: unknown[][], dateOf: (v: unknown) => string): LegacyFile[] {
  const h = header.map(x => String(x ?? '').replace(/\s+/g, ' ').trim());
  const col = (...names: string[]) => names.map(n => h.indexOf(n)).find(i => i >= 0) ?? -1;
  const at = (r: unknown[], i: number) => (i < 0 || r[i] == null ? '' : String(r[i]).replace(/\s+/g, ' ').trim());
  const c = {
    client: col('إسم الموكل', 'اسم الموكل'), file: col('رقم الملف'), defendant: col('إسم الخصم', 'اسم الخصم'), status: col('حالة الملف'),
    customer: col('سبب المديونية'), amount: col('قيمة المطالبة'), contract: col('رقم العقد'), auto: col('الرقم الآلى - ملف', 'الرقم الآلي - ملف'),
    tag1: col('ترقيم 1'), tag2: col('ترقيم 2'), tag3: col('ترقيم 3'), tag4: col('ترقيم 4'), arrival: col('تاريخ الورود'), civil: col('رقم الهوية - الخصم'),
    address: col('عنوان المنزل - الخصم'), notes1: col('ملاحظات 1'), notes2: col('ملاحظات 2'), nationality: col('الجنسية - الخصم'), job: col('الوظيفة - الخصم'),
    area: col('المنطقة'), block: col('القطعة'), paid: col('إجمالى المدفوعات', 'إجمالي المدفوعات'), expenses: col('إجمالى المصروفات', 'إجمالي المصروفات'),
  };
  if (c.file < 0 || c.defendant < 0) throw new Error('لم يُعثر على عمودي «رقم الملف» و«إسم الخصم» في ملف النظام السابق.');
  const money = (v: string) => { const n = Number(v.replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? (Math.round(n * 1000) / 1000).toFixed(3).replace(/\.?0+$/, '') : ''; };
  const keep = (v: string) => (LEGACY_EMPTY.test(v) ? '' : v);
  return rows.flatMap((r, n) => {
    const code = at(r, c.file); if (!code) return [];
    const auto = at(r, c.auto), status = at(r, c.status);
    const payload: Record<string, string> = {
      code, company: at(r, c.client), defendant: at(r, c.defendant), civilId: keep(at(r, c.civil)), nationality: keep(at(r, c.nationality)),
      address: keep(at(r, c.address)), address2: [at(r, c.area) && 'المنطقة ' + at(r, c.area), at(r, c.block) && 'قطعة ' + at(r, c.block)].filter(Boolean).join('، '),
      amount: money(at(r, c.amount)), account: keep(at(r, c.contract)), customerId: keep(at(r, c.customer)), fileAutoNumber: keep(auto),
      fileStatus: ALL_FILE_STATUSES.includes(status) ? status : '', arrivalDate: dateOf(r[c.arrival]), defendantJob: keep(at(r, c.job)),
      tag1: keep(at(r, c.tag1)), tag2: keep(at(r, c.tag2)), tag3: keep(at(r, c.tag3)), tag4: keep(at(r, c.tag4)),
      notes: [keep(at(r, c.notes1)), keep(at(r, c.notes2)), status && !ALL_FILE_STATUSES.includes(status) ? 'حالة سابقة: ' + status : ''].filter(Boolean).join(' · '),
      sourceReference: 'ملف ' + code,
    };
    return [{ row: n + 2, payload, paid: money(at(r, c.paid)), expenses: money(at(r, c.expenses)), autoNumber: /^\d{6,12}$/.test(auto) ? auto : '' }];
  });
}
