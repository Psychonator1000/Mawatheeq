/** Collections follow-up: file statuses, statements (إفادات) and payments, and the file's financial position. */

export const FILE_STATUSES = ['تحصيل ودي', 'جاهز للمحكمة', 'أمر أداء', 'دعوى قضائية', 'تنفيذ', 'تقسيط', 'مسدد', 'موقوف', 'مغلق'];
/** Further statuses the collections team uses. */
export const EXTRA_STATUSES = ['سوفت', 'تحت الرفع', 'سكت', 'حفظ'];
export const ALL_FILE_STATUSES = [...FILE_STATUSES, ...EXTRA_STATUSES];
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

