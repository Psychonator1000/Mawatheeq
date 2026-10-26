import type { CaseRecord } from './domain';
import type { WorkItem } from './office';
import type { MonthSummary } from './attendance';

import { brandMarkSvg } from './brand-mark.ts';
export { brandMarkSvg, BRAND_MARK_VIEWBOX } from './brand-mark.ts';

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
  const stages = Array.isArray(c.stages) ? c.stages as { level: string; caseNumber: string; court: string; date: string; outcome: string; ruling: string; appealedBy: string; procedures?: { date: string; text: string }[] }[] : [];
  const stageRows = stages.map(st => `<tr><td class="nowrap">${escape(st.level === 'ابتدائي' ? 'أول درجة' : st.level)}</td><td class="nowrap">${escape(st.caseNumber)}</td><td>${escape(st.court)}</td><td class="nowrap">${escape(dmy(st.date))}</td><td>${escape(st.outcome)}</td><td>${escape(st.ruling)}</td><td>${escape(st.appealedBy)}</td><td>${(st.procedures || []).length}</td></tr>`).join('');
  const workRows = open.map(w => `<tr><td class="nowrap">${escape(dmy(w.dueDate))} ${escape(w.dueTime)}</td><td>${escape(w.kind === 'hearing' ? 'جلسة' : 'مهمة')}</td><td>${escape(w.title)}</td><td>${escape(w.location)}</td></tr>`).join('');
  return page('ملف القضية ' + (c.code || c.autoNumber || ''), `<header><h1>${escape(client || 'ملف قضية')}</h1><p>${escape([c.code, c.autoNumber && 'الرقم الآلي ' + c.autoNumber, c.opponent && 'ضد ' + c.opponent].filter(Boolean).join(' · '))}</p></header>
${timingRows ? `<h2>المواعيد المحسوبة</h2><table>${timingRows}</table>` : ''}${body}
${stageRows ? `<h2>درجات التقاضي السابقة</h2><table class="list"><tr><th>الدرجة</th><th>رقم القضية</th><th>المحكمة</th><th>تاريخ الحكم</th><th>النتيجة</th><th>المنطوق</th><th>الطاعن</th><th>الإجراءات</th></tr>${stageRows}</table>` : ''}
${procedureRows ? `<h2>سجل الإجراءات</h2><table class="list"><tr><th>التاريخ</th><th>الإجراء</th><th>المحامي</th><th>المتابعة</th></tr>${procedureRows}</table>` : ''}
${workRows ? `<h2>المهام والجلسات المفتوحة</h2><table class="list"><tr><th>الموعد</th><th>النوع</th><th>العمل</th><th>المكان</th></tr>${workRows}</table>` : ''}
${footer(printedAt, printedBy)}`);
}

const footer = (printedAt: string, printedBy: string) => `<footer><span>طُبع من نظام مواثيق في ${escape(printedAt)}${printedBy ? ' بواسطة ' + escape(printedBy) : ''}</span><span>ملف داخلي سري</span></footer>`;
/** The office logo (the same vector mark as in the app), with «و» in the logo's maroon. */
const SEAL = `<div class="seal" aria-hidden="true">${brandMarkSvg('#8a2d2a')}</div>`;
/**
 * Printed pages have no browser margin, so the browser cannot add its own header and footer (page address, title, date).
 * The page spacing comes instead from a frame table whose empty head and foot rows repeat on every printed page. The
 * frame's single row must be allowed to break across pages, or the browser moves it to page 2 and leaves page 1 blank.
 */
function page(title: string, body: string, landscape = false) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@700&family=Cinzel:wght@600&family=Cormorant+Garamond:wght@600;700&family=Noto+Kufi+Arabic:wght@600;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap"><style>
@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Noto Sans Arabic',Tahoma,Arial,sans-serif;color:#2a201b;margin:0;padding:0 13mm;font-size:12.5px;line-height:1.55;background:#fff}
@media screen{body{padding:26px 34px}.print-frame>thead,.print-frame>tfoot{display:none}}
.print-frame{width:100%;border-collapse:collapse}.print-frame>thead td,.print-frame>tfoot td{height:11mm;border:0;padding:0;background:none}.print-frame>tbody>tr{break-inside:auto}.print-frame>tbody>tr>td{border:0;padding:0;background:none}
.watermark{position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;opacity:.035;z-index:-1;font-family:'Aref Ruqaa',serif;font-weight:700;font-size:190px;color:#5a1a2b}
.brand{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:10px;border-bottom:2px solid #6e1f33;position:relative;margin-bottom:6px}
.brand::after{content:'';position:absolute;left:0;right:0;bottom:-5px;height:1px;background:#c9a24a}
.brand-id{display:flex;align-items:center;gap:14px}
.seal{width:42px;height:74px;flex-shrink:0;color:#1d1714}.seal svg{width:100%;height:100%;overflow:visible}
.brand-name strong{display:block;font-family:'Noto Kufi Arabic','Noto Sans Arabic',Tahoma,sans-serif;font-size:15.5px;font-weight:700;color:#5a1a2b;line-height:1.45}
.brand-name small{display:block;font-family:'Cinzel','Cormorant Garamond',Georgia,serif;font-size:9.5px;letter-spacing:.14em;color:#a8873e;font-weight:700;direction:ltr;text-align:right}
.brand-meta{font-size:10px;color:#8a7568;text-align:left;line-height:1.7}
header{margin:16px 0 10px}h1{font-family:'Noto Kufi Arabic','Noto Sans Arabic',Tahoma,sans-serif;font-size:19px;font-weight:700;margin:0;color:#2a201b}header p{margin:3px 0 0;color:#76645a;font-size:11.5px}
h2{font-size:13px;color:#6e1f33;margin:16px 0 6px;padding-inline-start:8px;border-inline-start:3px solid #c9a24a;break-after:avoid}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #e3d8ca;padding:5px 7px;text-align:right;vertical-align:top;overflow-wrap:anywhere}
th{background:#f6efe5;width:28%;font-weight:600;color:#4a3a30}.list th{width:auto}
.list thead th{background:#6e1f33;color:#fff;border-color:#6e1f33;font-weight:600;font-size:.95em}
.list thead{display:table-header-group}.list tbody tr{break-inside:avoid}.list tbody tr:nth-child(even) td{background:#fbf8f3}
.nowrap{white-space:nowrap}.amount{direction:ltr;text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums}
.total td,.total th{font-weight:700;background:#f3e9dc}.signatures{display:flex;justify-content:space-between;gap:24px;margin-top:48px}.signatures div{flex:1;border-top:1px solid #8a7a70;padding-top:6px;text-align:center;color:#6b5a50}
.void{color:#a32e38;font-weight:700;border:2px solid #a32e38;padding:6px 10px;display:inline-block;margin-top:8px}
footer{margin-top:18px;padding-top:8px;border-top:1px solid #e3d8ca;display:flex;justify-content:space-between;gap:12px;color:#8a7a70;font-size:10px}
</style></head><body><div class="watermark" aria-hidden="true">مواثيق</div><table class="print-frame"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
<div class="brand"><div class="brand-id">${SEAL}<div class="brand-name"><strong>مواثيق للاستشارات القانونية وأعمال المحاماة</strong><small>MAWATHEEQ · LEGAL CONSULTANTS &amp; LAW FIRM</small></div></div><div class="brand-meta">${escape(title)}<br>للاستخدام الداخلي</div></div>
${body}</td></tr></tbody></table></body></html>`;
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

type PayrollRow = Pick<MonthSummary, 'scheduledDays' | 'presentDays' | 'absentDays' | 'leaveDays' | 'lateDays' | 'lateMinutes' | 'earlyMinutes' | 'excessMinutes' | 'overtimeMinutes' | 'salaryMinor' | 'lateDeductionMinor' | 'absenceDeductionMinor' | 'overtimePayMinor' | 'netMinor' | 'potentialDeductionMinor' | 'warnings'> & { employee: { name: string; employeeNumber: string; currency: string } };
const hm = (n: number) => n <= 0 ? '0' : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

/** Monthly payroll estimate grouped by currency. In warning mode deductions are listed as potential only. */
export function payrollHtml(rows: PayrollRow[], monthLabel: string, deductionMode: 'warn' | 'deduct', money: Money, printedAt: string, printedBy: string): string {
  const currencies = [...new Set(rows.map(r => r.employee.currency))].sort();
  const tables = currencies.map(currency => {
    const list = rows.filter(r => r.employee.currency === currency);
    const sum = (k: 'salaryMinor' | 'lateDeductionMinor' | 'absenceDeductionMinor' | 'overtimePayMinor' | 'netMinor' | 'potentialDeductionMinor') => list.reduce((t, r) => t + r[k], BigInt(0));
    const amount = (v: bigint) => `<td class="amount">${escape(money(v, currency))}</td>`;
    const body = list.map(r => `<tr><td>${escape(r.employee.name)}<br><small>${escape(r.employee.employeeNumber)}</small></td><td>${r.presentDays}/${r.scheduledDays}</td><td>${r.absentDays}</td><td>${r.leaveDays}</td><td class="nowrap">${r.lateDays} · ${escape(hm(r.lateMinutes + r.earlyMinutes))}</td><td class="nowrap">${escape(hm(r.excessMinutes))}</td><td class="nowrap">${escape(hm(r.overtimeMinutes))}</td>${amount(r.salaryMinor)}${amount(deductionMode === 'deduct' ? r.lateDeductionMinor + r.absenceDeductionMinor : r.potentialDeductionMinor)}${amount(r.overtimePayMinor)}${amount(r.netMinor)}</tr>`).join('');
    return `<h2>العملة ${escape(currency)}</h2><table class="list"><tr><th>الموظف</th><th>الحضور</th><th>غياب</th><th>إجازة</th><th>تأخير وخروج مبكر</th><th>تجاوز السماحية</th><th>إضافي</th><th>الراتب</th><th>${deductionMode === 'deduct' ? 'الخصومات' : 'خصم محتمل (تنبيه فقط)'}</th><th>بدل إضافي</th><th>الصافي التقديري</th></tr>${body}
<tr class="total"><th colspan="7">الإجمالي (${list.length} موظف)</th>${amount(sum('salaryMinor'))}${amount(deductionMode === 'deduct' ? sum('lateDeductionMinor') + sum('absenceDeductionMinor') : sum('potentialDeductionMinor'))}${amount(sum('overtimePayMinor'))}${amount(sum('netMinor'))}</tr></table>`;
  }).join('');
  const notes = rows.filter(r => r.warnings.length).map(r => `<li><b>${escape(r.employee.name)}:</b> ${r.warnings.map(escape).join('؛ ')}</li>`).join('');
  return page('كشف الرواتب ' + monthLabel, `<header><h1>كشف الرواتب التقديري</h1><p>${escape(monthLabel)} · ${deductionMode === 'deduct' ? 'الخصومات مطبقة حسب إعدادات الدوام' : 'وضع التنبيه: لا تُخصم أي مبالغ من الراتب'}</p></header>
${tables || '<p>لا يوجد موظفون نشطون.</p>'}${notes ? `<h2>تنبيهات</h2><ul>${notes}</ul>` : ''}
<p>تقدير محسوب من سجل البصمات والإجازات المعتمدة، ويُراجع قبل الصرف.</p><div class="signatures"><div>الموارد البشرية</div><div>المحاسب</div><div>الاعتماد</div></div>${footer(printedAt, printedBy)}`);
}

/** An attendance warning letter for one employee and month. */
export function warningLetterHtml(row: PayrollRow & { days: { date: string; kind: string; first: string | null; last: string | null; lateMinutes: number; earlyMinutes: number }[] }, monthLabel: string, labels: Record<string, string>, printedAt: string, printedBy: string): string {
  const issues = row.days.filter(d => d.kind === 'absent' || d.kind === 'missing' || d.lateMinutes > 0 || d.earlyMinutes > 0);
  const lines = issues.map(d => `<tr><td class="nowrap">${escape(dmy(d.date))}</td><td>${escape(labels[d.kind] || d.kind)}</td><td class="nowrap">${escape(d.first || '—')}</td><td class="nowrap">${escape(d.last || '—')}</td><td class="nowrap">${escape(hm(d.lateMinutes))}</td><td class="nowrap">${escape(hm(d.earlyMinutes))}</td></tr>`).join('');
  return page('إنذار حضور ' + row.employee.name, `<header><h1>إنذار بشأن الحضور والانصراف</h1><p>مواثيق للمحاماة · ${escape(monthLabel)}</p></header>
<table><tr><th>الموظف</th><td>${escape(row.employee.name)}</td></tr><tr><th>الرقم الوظيفي</th><td>${escape(row.employee.employeeNumber)}</td></tr></table>
<p>نود إحاطتكم بأن سجل الحضور للشهر المذكور أظهر ما يلي:</p><ul>${row.warnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul>
${lines ? `<h2>تفاصيل الأيام</h2><table class="list"><tr><th>التاريخ</th><th>الحالة</th><th>الدخول</th><th>الخروج</th><th>تأخير</th><th>خروج مبكر</th></tr>${lines}</table>` : ''}
<p>نأمل الالتزام بمواعيد الدوام الرسمية، وتقديم ما يبرر أي غياب أو تأخير إلى الموارد البشرية.</p>
<div class="signatures"><div>الموارد البشرية</div><div>توقيع الموظف بالعلم</div><div>التاريخ</div></div>${footer(printedAt, printedBy)}`);
}

/** Open a same-origin print window with already-escaped HTML. */
/**
 * Prints a standalone page through a hidden frame, so no extra window or tab is left open whether the person prints
 * or cancels. `window.__mawatheeqPrint`, when set (browser tests), receives the page instead of the print dialog.
 */
export function printHtml(html: string): boolean {
  const capture = (window as unknown as { __mawatheeqPrint?: (html: string) => void }).__mawatheeqPrint;
  if (typeof capture === 'function') { capture(html); return true; }
  document.querySelectorAll('iframe[data-print-frame]').forEach(f => f.remove());
  const frame = document.createElement('iframe');
  frame.setAttribute('data-print-frame', ''); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(frame);
  const win = frame.contentWindow, doc = frame.contentDocument;
  if (!win || !doc) { frame.remove(); return false; }
  doc.open(); doc.write(html); doc.close();
  let done = false;
  const cleanup = () => { if (done) return; done = true; setTimeout(() => frame.remove(), 500); };
  win.addEventListener('afterprint', cleanup);
  // Wait for the page's fonts so Arabic text prints correctly, then open the print dialog.
  const go = () => { win.focus(); win.print(); setTimeout(cleanup, 60000); };
  if (doc.fonts?.ready) void doc.fonts.ready.then(() => setTimeout(go, 50)); else setTimeout(go, 200);
  return true;
}

export type RollRow = { time: string; title: string; location: string; caseRef: string; parties: string; caseNumber: string; level: string; assignee: string; notes: string; client?: string; opponent?: string; autoNumber?: string };
/** The day's hearings roll (رول الجلسات), grouped by court or expert office, in time order. */
/** One case on a roll, as a band: who's who in a headline, every number under its name, the office code large. */
export type RollCard = { code: string; client: string; role?: string; opponent: string; lawyer?: string; facts: [string, string, string?][]; writeIn?: string[] };
// Compact on purpose: a roll of a thousand cases should come out at around ten bands a page, not two.
const ROLL_CARD_STYLE = `<style>
.rc{display:grid;grid-template-columns:24px 1fr auto;gap:0 8px;align-items:stretch;border:1px solid #d8cfc4;border-radius:5px;margin:0 0 3px;padding:3px 7px;break-inside:avoid}
.rc-n{display:grid;place-items:center;font-size:15px;font-weight:700;color:#6e1f33;border-inline-end:1px solid #e6ddd2}
.rc-main{display:grid;gap:2px;min-width:0}
.rc-head{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto;align-items:baseline;gap:2px 8px;font-size:11px;padding-bottom:2px;border-bottom:1px solid #efe7dd;line-height:1.35}
.rc-head small,.rc-facts dt,.rc-code small,.rc-write small{color:#8a7a70;font-size:8px;font-weight:600}
.rc-head b{font-size:11.5px}.rc-head em{font-style:normal;color:#6b5a50;font-size:9.5px}.rc-vs{color:#a08f84;font-weight:700}.rc-lawyer{white-space:nowrap;padding-inline-start:8px;border-inline-start:1px solid #efe7dd}
.rc-facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));grid-auto-flow:row dense;gap:1px 8px;margin:0;line-height:1.3}.rc-facts div{display:grid;align-content:start;min-width:0}.rc-facts .w{grid-column:span 2}.rc-facts dd{margin:0;font-weight:600;font-size:10px;direction:auto;overflow-wrap:anywhere}.rc-facts dd small{display:block;font-weight:400;color:#6b5a50;font-size:8.5px}
.rc-code{display:grid;align-content:center;justify-items:center;border-inline-start:1px solid #e6ddd2;padding-inline-start:6px;line-height:1.2}.rc-code{min-width:52px}.rc-code b{font-size:16px;letter-spacing:.3px;white-space:nowrap}
.rc-write{display:grid;grid-template-columns:auto 1fr auto 1fr;align-items:end;gap:2px 8px;font-size:9.5px}.rc-write span{border-bottom:1px dotted #b9ab9f;min-height:13px}
.rc-legend{font-size:9.5px;color:#6b5a50;margin:0 0 4px}
</style>`;
function rollCard(n: number, c: RollCard): string {
  // Every label shows, empty or not, so the bands line up and each number keeps its name.
  const facts = c.facts.map(([k, v, sub]) => `<div${(v || '').length + (sub || '').length > 22 ? ' class="w"' : ''}><dt>${escape(k)}</dt><dd>${escape(v || '—')}${sub ? ` <small>${escape(sub)}</small>` : ''}</dd></div>`).join('');
  return `<article class="rc"><div class="rc-n">${n}</div><div class="rc-main"><div class="rc-head"><span><small>الموكل</small> <b>${escape(c.client || '—')}</b>${c.role ? ` <em>(${escape(c.role)})</em>` : ''}</span><span class="rc-vs">ضد</span><span><small>الخصم</small> <b>${escape(c.opponent || '—')}</b></span>${c.lawyer ? `<span class="rc-lawyer"><small>المستشار</small> <b>أ/ ${escape(c.lawyer.replace(/^\s*[اأإ]\s*[/.]\s*/, ''))}</b></span>` : ''}</div>`
    + `${facts ? `<dl class="rc-facts">${facts}</dl>` : ''}${c.writeIn?.length ? `<div class="rc-write">${c.writeIn.map(w => `<small>${escape(w)}</small><span></span>`).join('')}</div>` : ''}</div>`
    + `<div class="rc-code"><small>الكود</small><b>${escape(c.code || '—')}</b></div></article>`;
}
/** A roll of case bands, grouped; used by «رول الأحكام» (cards layout) and the daily hearings roll. */
export function rollCardsHtml(title: string, scope: string, groups: [string, RollCard[]][], printedAt: string, printedBy: string, landscape = true, unit = 'قضية'): string {
  const total = groups.reduce((n, [, l]) => n + l.length, 0);
  let index = 0;
  const body = groups.map(([label, list]) => `${label ? `<h2>${escape(label)} (${list.length})</h2>` : ''}${list.map(c => rollCard(++index, c)).join('')}`).join('');
  return page(title, `${ROLL_CARD_STYLE}<header><h1>${escape(title)}</h1><p>${escape(scope)} · ${total} ${unit}</p></header><p class="rc-legend">م: التسلسل · الكود: كود المكتب للقضية · الرقم الآلي: رقم القضية في نظام المحاكم</p>${body || '<p>لا توجد سجلات.</p>'}${footer(printedAt, printedBy)}`, landscape);
}

export function hearingRollHtml(date: string, rows: RollRow[], printedAt: string, printedBy: string): string {
  const groups = new Map<string, RollRow[]>();
  for (const r of [...rows].sort((a, b) => (a.location + a.time).localeCompare(b.location + b.time))) groups.set(r.location || 'المكان غير محدد', [...(groups.get(r.location || 'المكان غير محدد') || []), r]);
  const cards: [string, RollCard[]][] = [...groups].map(([place, list]) => [place, list.map(r => {
    const [client, opponent] = r.client !== undefined ? [r.client, r.opponent || ''] : [r.parties.split(' ضد ')[0] || r.parties, r.parties.split(' ضد ')[1] || ''];
    return { code: r.caseRef, client, opponent, lawyer: r.assignee, facts: [['وقت الجلسة', r.time || '—'], ['الرقم الآلي', r.autoNumber || ''], ['رقم القضية', r.caseNumber, r.level], ['الجلسة', r.title], ['القرار السابق / ملاحظات', r.notes]], writeIn: ['قرار الجلسة', 'الجلسة القادمة'] };
  })]);
  return rollCardsHtml('رول الجلسات ' + dmy(date), dmy(date), cards, printedAt, printedBy, false, 'جلسة');
}

/**
 * «رول الأحكام»: a numbered, grouped list in landscape. Cells are [main text, smaller second line]; the caller chooses
 * the columns. Smaller type is used when many columns are printed so the roll stays on the page width.
 */
export function judgmentRollHtml(title: string, scope: string, headers: string[], groups: [string, [string, string][][]][], printedAt: string, printedBy: string, widths: number[] = []): string {
  const total = groups.reduce((n, [, list]) => n + list.length, 0);
  let index = 0;
  const size = headers.length > 14 ? 9 : headers.length > 10 ? 10 : 11;
  const sum = widths.reduce((n, w) => n + w, 0);
  const cols = sum ? `<colgroup><col style="width:24px">${widths.map(w => `<col style="width:${(w / sum * 100).toFixed(2)}%">`).join('')}</colgroup>` : '';
  const table = (list: [string, string][][]) => `<table class="list roll">${cols}<thead><tr><th>م</th>${headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${list.map(row => `<tr><td class="nowrap">${++index}</td>${row.map(([main, sub]) => `<td>${escape(main)}${sub ? `<br><small>${escape(sub)}</small>` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const body = groups.map(([label, list]) => `${label ? `<h2>${escape(label)} (${list.length})</h2>` : ''}${table(list)}`).join('');
  return page(title, `<style>.roll{font-size:${size}px;table-layout:fixed}.roll th{white-space:normal;line-height:1.3}.roll th:first-child,.roll td:first-child{text-align:center;padding-inline:2px}.roll td{overflow-wrap:break-word;word-break:normal;padding:4px 5px}.roll td small{font-size:.9em}.roll thead{display:table-header-group}.roll tr{break-inside:avoid}.roll small{color:#6b5a50}h2{break-after:avoid}</style><header><h1>${escape(title)}</h1><p>${escape(scope)} · ${total} قضية</p></header>${total ? body : '<p>لا توجد قضايا في هذا النطاق.</p>'}${footer(printedAt, printedBy)}`, true);
}

/** A simple printable table (file statements, a file's account statement…), escaped, with optional totals rows. */
export function listHtml(title: string, subtitle: string, headers: string[], rows: string[][], printedAt: string, printedBy: string, totals: [string, string][] = []): string {
  const table = `<table class="list"><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const sums = totals.length ? `<table class="totals" style="margin-top:12px;width:auto">${totals.map(([k, v]) => `<tr class="total"><th>${escape(k)}</th><td class="amount">${escape(v)}</td></tr>`).join('')}</table>` : '';
  return page(title, `<header><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></header>${rows.length ? table : '<p>لا توجد سجلات.</p>'}${sums}${footer(printedAt, printedBy)}`, headers.length > 6);
}

/**
 * A handover sheet by recipient: each person's files with a signature block under them, either each on its own page
 * (to hand every lawyer their own sheet) or all together on one sheet, divided by recipient.
 */
export function handoverSheetsHtml(title: string, subtitle: string, headers: string[], groups: { name: string; rows: string[][] }[], separate: boolean, printedAt: string, printedBy: string): string {
  const sign = '<table class="sign"><tr><td>توقيع المستلم: ............................</td><td>التاريخ: ........../........../..........</td></tr></table>';
  const table = (rows: string[][]) => `<table class="list"><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const style = '<style>.sign{width:100%;margin:14px 0 4px;border:0}.sign td{border:0;padding:6px 0;font-size:12.5px}.person{break-inside:avoid}.person+.person{margin-top:18px}.sheet{break-after:page}.sheet:last-of-type{break-after:auto}</style>';
  const body = separate
    ? groups.map(g => `<section class="sheet"><header><h1>${escape(title)}</h1><p>${escape(subtitle)} · المستلم: ${escape(g.name)} · ${g.rows.length} ملف</p></header>${table(g.rows)}${sign}${footer(printedAt, printedBy)}</section>`).join('')
    : `<header><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></header>${groups.map(g => `<section class="person"><h2>${escape(g.name)} · ${g.rows.length} ملف</h2>${table(g.rows)}${sign}</section>`).join('')}${footer(printedAt, printedBy)}`;
  return page(title, style + body, false);
}

export type ArchiveLabel = { number: string; barcode: string; title: string; caseRef: string; parties: string; type: string; location: string };
/** Spine/cover labels for physical files, two per row, each with its archive number as a Code 39 barcode. */
export function archiveLabelsHtml(labels: ArchiveLabel[], printedAt: string, printedBy: string): string {
  const style = `<style>.labels{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.label{border:1.4px solid #6e1f33;border-radius:3mm;padding:3.5mm 4mm;break-inside:avoid;display:flex;flex-direction:column;gap:1.5mm;min-height:44mm}
.label-top{display:flex;justify-content:space-between;align-items:center;gap:3mm}.label-no{font-family:'Noto Kufi Arabic',sans-serif;font-size:18px;font-weight:700;color:#5a1a2b;direction:ltr}.label-type{font-size:10.5px;color:#7b6458;border:1px solid #d9c9b7;border-radius:99px;padding:0 7px}
.label-title{font-weight:700;font-size:13px;line-height:1.5}.label-meta{font-size:10.5px;color:#5c4a40}.label-bar{display:flex;justify-content:center;margin-top:auto}.label-bar svg{max-width:100%;height:13mm}.label-loc{font-size:10px;color:#8a7568;text-align:center}</style>`;
  const cards = labels.map(l => `<div class="label"><div class="label-top"><span class="label-no">${escape(l.number)}</span><span class="label-type">${escape(l.type)}</span></div><div class="label-title">${escape(l.title)}</div><div class="label-meta">${escape([l.caseRef, l.parties].filter(Boolean).join(' · '))}</div><div class="label-bar">${l.barcode}</div><div class="label-loc">${escape(l.location ? 'الموقع: ' + l.location : '')}</div></div>`).join('');
  return page('ملصقات ملفات الأرشيف', `${style}<header><h1>ملصقات ملفات الأرشيف</h1><p>${labels.length} ملصق</p></header><div class="labels">${cards}</div>${footer(printedAt, printedBy)}`);
}
/** A handover or receipt slip for one file movement, with signature lines for both sides. */
export function custodyReceiptHtml(title: string, rows: [string, string][], from: string, to: string, printedAt: string, printedBy: string): string {
  return page(title, `<header><h1>${escape(title)}</h1><p>يُحفظ أصل هذا الإيصال في الأرشيف وتُسلّم صورته للمستلم.</p></header><table>${rows.filter(([, v]) => v).map(([k, v]) => `<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`).join('')}</table>
<div class="signatures"><div>${escape(from)}<br>الاسم والتوقيع</div><div>${escape(to)}<br>الاسم والتوقيع</div></div>${footer(printedAt, printedBy)}`);
}

export type InvoicePrint = { title: string; number: string; date: string; due: string; partner: string; reference: string; caseLabel: string; status: string;
  lines: { label: string; quantity: string; price: string; discount: string; amount: string }[]; total: string; paid: string; due_amount: string; words: string;
  schedule: [string, string][]; note: string };
/** An invoice, bill or credit note: header, service lines, totals with what is paid and still due, instalments and a note. */
export function invoiceHtml(d: InvoicePrint, printedAt: string, printedBy: string): string {
  const info: [string, string][] = [['الرقم', d.number], ['التاريخ', dmy(d.date)], ['تاريخ الاستحقاق', dmy(d.due)], ['الموكل / المورد', d.partner], ['المرجع', d.reference], ['القضية', d.caseLabel], ['الحالة', d.status]];
  const lines = `<table class="list"><thead><tr><th>البيان</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>المبلغ</th></tr></thead><tbody>${d.lines.map(l => `<tr><td>${escape(l.label)}</td><td class="amount">${escape(l.quantity)}</td><td class="amount">${escape(l.price)}</td><td class="amount">${escape(l.discount)}</td><td class="amount">${escape(l.amount)}</td></tr>`).join('')}</tbody></table>`;
  const totals: [string, string][] = [['الإجمالي (KWD)', d.total], ['المدفوع', d.paid], ['المتبقي', d.due_amount]];
  return page(d.title + ' ' + d.number, `<header><h1>${escape(d.title)}</h1><p>مواثيق للمحاماة</p></header>
<table>${info.filter(([, v]) => String(v || '').trim()).map(([k, v]) => `<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`).join('')}</table>${lines}
<table class="totals" style="margin-top:12px;width:auto">${totals.map(([k, v]) => `<tr class="total"><th>${escape(k)}</th><td class="amount">${escape(v)}</td></tr>`).join('')}</table>
${d.words ? `<p>${escape(d.words)}</p>` : ''}${d.schedule.length > 1 ? `<table class="list" style="margin-top:12px;width:auto"><thead><tr><th>الدفعة المستحقة في</th><th>المبلغ</th></tr></thead><tbody>${d.schedule.map(([a, b]) => `<tr><td>${escape(dmy(a))}</td><td class="amount">${escape(b)}</td></tr>`).join('')}</tbody></table>` : ''}
${d.note ? `<p>${escape(d.note)}</p>` : ''}<div class="signatures"><div>المحاسب</div><div>الختم</div></div>${footer(printedAt, printedBy)}`);
}
