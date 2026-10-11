import type { CaseRecord } from './domain';
import type { WorkItem } from './office';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const dmy = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;
const sections: [string, [keyof CaseRecord, string, boolean?][]][] = [
  ['بيانات القضية', [['code', 'كود المكتب'], ['autoNumber', 'الرقم الآلي'], ['caseNumber', 'رقم القضية'], ['court', 'المحكمة'], ['subject', 'موضوع الدعوى'], ['lawyer', 'المحامي']]],
  ['الأطراف', [['clientEntityName', 'الموكل'], ['clientContactName', 'المتابع لدى الموكل'], ['role', 'صفة الموكل'], ['opponent', 'الخصم'], ['casePerson', 'الشخص المعني'], ['casePersonRole', 'صلته بالموكل']]],
  ['الحكم', [['type', 'نوع الحكم'], ['date', 'تاريخ الحكم', true], ['outcome', 'نتيجة الحكم'], ['ruling', 'منطوق الحكم']]],
  ['الطعن والتنفيذ', [['appealRecorded', 'الطعن المسجل'], ['appealConfirmation', 'تأكيد إجراء الخصم'], ['copyDate', 'استلام الصيغة', true], ['notificationDate', 'إعلان الصيغة', true], ['announcementDate', 'بداية الإعلان', true], ['executionOpenDate', 'فتح التنفيذ', true], ['executionProcedureDate', 'إجراء التنفيذ', true], ['executionStage', 'مرحلة التنفيذ'], ['executionNote', 'ملاحظات التنفيذ']]],
  ['ملاحظات', [['notes', 'ملاحظات']]],
];

/** A self-contained, escaped HTML case summary for printing or saving as PDF. */
export function caseSheetHtml(c: CaseRecord, timing: { label: string; value: string }[], work: WorkItem[], printedAt: string, printedBy: string): string {
  const client = c.clientEntityName || c.clientGroup || c.client;
  const rows = (fields: [keyof CaseRecord, string, boolean?][]) => fields
    .map(([key, label, date]) => [label, key === 'clientEntityName' ? client : date ? dmy(String(c[key] || '')) : c[key]] as const)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`).join('');
  const body = sections.map(([title, fields]) => { const r = rows(fields); return r ? `<h2>${escape(title)}</h2><table>${r}</table>` : ''; }).join('');
  const timingRows = timing.map(t => `<tr><th>${escape(t.label)}</th><td>${escape(t.value)}</td></tr>`).join('');
  const procedures = (c.procedures || []).filter(p => p.text || p.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const procedureRows = procedures.map(p => `<tr><td class="nowrap">${escape(dmy(p.date))}</td><td>${escape(p.text)}</td><td>${escape(p.lawyer)}</td><td class="nowrap">${escape(dmy(p.followup || ''))}</td></tr>`).join('');
  const open = work.filter(w => w.caseId === c.id && w.status !== 'done' && w.status !== 'cancelled').sort((a, b) => (a.dueDate + a.dueTime).localeCompare(b.dueDate + b.dueTime));
  const workRows = open.map(w => `<tr><td class="nowrap">${escape(dmy(w.dueDate))} ${escape(w.dueTime)}</td><td>${escape(w.kind === 'hearing' ? 'جلسة' : 'مهمة')}</td><td>${escape(w.title)}</td><td>${escape(w.location)}</td></tr>`).join('');
  return page('ملف القضية ' + (c.code || c.autoNumber || ''), `<header><h1>${escape(client || 'ملف قضية')}</h1><p>${escape([c.code, c.autoNumber && 'الرقم الآلي ' + c.autoNumber, c.opponent && 'ضد ' + c.opponent].filter(Boolean).join(' · '))}</p></header>
${timingRows ? `<h2>المواعيد المحسوبة</h2><table>${timingRows}</table>` : ''}${body}
${procedureRows ? `<h2>سجل الإجراءات</h2><table class="list"><tr><th>التاريخ</th><th>الإجراء</th><th>المحامي</th><th>المتابعة</th></tr>${procedureRows}</table>` : ''}
${workRows ? `<h2>المهام والجلسات المفتوحة</h2><table class="list"><tr><th>الموعد</th><th>النوع</th><th>العمل</th><th>المكان</th></tr>${workRows}</table>` : ''}
${footer(printedAt, printedBy)}`);
}

const footer = (printedAt: string, printedBy: string) => `<footer>طُبع من مواثيق في ${escape(printedAt)}${printedBy ? ' بواسطة ' + escape(printedBy) : ''}. ملف داخلي سري.</footer>`;
function page(title: string, body: string) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(title)}</title><style>
body{font-family:'Noto Sans Arabic',Tahoma,Arial,sans-serif;color:#2b211c;margin:32px;font-size:13px;line-height:1.6}
header{border-bottom:2px solid #74283b;padding-bottom:12px;margin-bottom:8px}h1{font-size:22px;margin:0}header p{margin:4px 0 0;color:#6b5a50}
h2{font-size:15px;color:#74283b;margin:20px 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd2c6;padding:6px 8px;text-align:right;vertical-align:top}
th{background:#f6f1ea;width:28%;font-weight:600}.list th{width:auto}.nowrap{white-space:nowrap}.amount{direction:ltr;text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums}
.total td,.total th{font-weight:700;background:#f6f1ea}.signatures{display:flex;justify-content:space-between;gap:24px;margin-top:48px}.signatures div{flex:1;border-top:1px solid #8a7a70;padding-top:6px;text-align:center;color:#6b5a50}
.void{color:#a32e38;font-weight:700;border:2px solid #a32e38;padding:6px 10px;display:inline-block;margin-top:8px}footer{margin-top:24px;color:#8a7a70;font-size:11px}
@media print{body{margin:12mm}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>${body}</body></html>`;
}

type Money = (minor: string | bigint, currency: string) => string;
type LedgerEntry = { id: string; caseId: string; payload: { type: 'fee' | 'receipt' | 'expense'; date: string; currency: string; amountMinor: string; reference: string; party: string; notes: string; status: 'posted' | 'void'; voidReason: string } };
const ENTRY_LABELS = { fee: 'أتعاب مستحقة', receipt: 'مقبوضات', expense: 'مصروفات' };
const VOUCHERS = { fee: 'إشعار أتعاب مستحقة', receipt: 'سند قبض', expense: 'سند صرف' };

/** A receipt, payment or fee voucher for one ledger entry. Void entries are clearly marked. */
export function voucherHtml(entry: LedgerEntry, caseLabel: string, money: Money, words: string, printedAt: string, printedBy: string): string {
  const p = entry.payload, title = VOUCHERS[p.type];
  const party = p.type === 'receipt' ? 'استلمنا من' : p.type === 'expense' ? 'صُرف إلى' : 'مستحق على';
  const rows: [string, string][] = [['رقم المرجع', p.reference], ['التاريخ', dmy(p.date)], [party, p.party], ['المبلغ', money(p.amountMinor, p.currency)], ['المبلغ كتابةً', words], ['القضية', caseLabel], ['البيان', p.notes]];
  return page(title + ' ' + p.reference, `<header><h1>${escape(title)}</h1><p>مواثيق للمحاماة</p>${p.status === 'void' ? `<p class="void">قيد ملغى — ${escape(p.voidReason)}</p>` : ''}</header>
<table>${rows.filter(([, v]) => String(v || '').trim()).map(([k, v]) => `<tr><th>${escape(k)}</th><td${k === 'المبلغ' ? ' class="amount"' : ''}>${escape(v)}</td></tr>`).join('')}</table>
<div class="signatures"><div>المستلم</div><div>المحاسب</div><div>الختم</div></div>${footer(printedAt, printedBy)}`);
}

/** A statement of posted entries in one currency, with fee, receipt and expense totals. */
export function statementHtml(entries: LedgerEntry[], currency: string, scope: string, caseLabel: (id: string) => string, money: Money, printedAt: string, printedBy: string): string {
  const posted = entries.filter(e => e.payload.status === 'posted' && e.payload.currency === currency).sort((a, b) => a.payload.date.localeCompare(b.payload.date) || a.id.localeCompare(b.id));
  const totals = { fee: BigInt(0), receipt: BigInt(0), expense: BigInt(0) };
  for (const e of posted) totals[e.payload.type] += BigInt(e.payload.amountMinor);
  const cell = (e: LedgerEntry, type: keyof typeof totals) => `<td class="amount">${e.payload.type === type ? escape(money(e.payload.amountMinor, currency)) : ''}</td>`;
  const rows = posted.map(e => `<tr><td class="nowrap">${escape(dmy(e.payload.date))}</td><td>${escape(e.payload.reference)}</td><td>${escape(ENTRY_LABELS[e.payload.type])}</td><td>${escape(e.payload.party)}</td><td>${escape(caseLabel(e.caseId))}</td>${cell(e, 'fee')}${cell(e, 'receipt')}${cell(e, 'expense')}</tr>`).join('');
  const sum = (v: bigint) => `<td class="amount">${escape(money(v, currency))}</td>`;
  return page('كشف حساب ' + currency, `<header><h1>كشف حساب</h1><p>${escape(scope)} · العملة ${escape(currency)} · ${posted.length} قيد مرحّل</p></header>
<table class="list"><tr><th>التاريخ</th><th>المرجع</th><th>الحركة</th><th>الطرف</th><th>القضية</th><th>أتعاب</th><th>مقبوضات</th><th>مصروفات</th></tr>${rows || '<tr><td colspan="8">لا توجد قيود مرحلة ضمن التصفية.</td></tr>'}
<tr class="total"><th colspan="5">الإجمالي</th>${sum(totals.fee)}${sum(totals.receipt)}${sum(totals.expense)}</tr></table>
<table><tr class="total"><th>الأتعاب المتبقية (الأتعاب − المقبوضات)</th>${sum(totals.fee - totals.receipt)}</tr><tr><th>صافي المقبوضات بعد المصروفات</th>${sum(totals.receipt - totals.expense)}</tr></table>
<p>القيود الملغاة لا تدخل في الكشف.</p>${footer(printedAt, printedBy)}`);
}

/** Open a same-origin print window with already-escaped HTML. */
export function printHtml(html: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html); w.document.close(); w.focus(); w.print();
  return true;
}
