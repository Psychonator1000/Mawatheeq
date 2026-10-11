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
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape('ملف القضية ' + (c.code || c.autoNumber || ''))}</title><style>
body{font-family:'Noto Sans Arabic',Tahoma,Arial,sans-serif;color:#2b211c;margin:32px;font-size:13px;line-height:1.6}
header{border-bottom:2px solid #74283b;padding-bottom:12px;margin-bottom:8px}h1{font-size:22px;margin:0}header p{margin:4px 0 0;color:#6b5a50}
h2{font-size:15px;color:#74283b;margin:20px 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd2c6;padding:6px 8px;text-align:right;vertical-align:top}
th{background:#f6f1ea;width:28%;font-weight:600}.list th{width:auto}.nowrap{white-space:nowrap}footer{margin-top:24px;color:#8a7a70;font-size:11px}
@media print{body{margin:12mm}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>
<header><h1>${escape(client || 'ملف قضية')}</h1><p>${escape([c.code, c.autoNumber && 'الرقم الآلي ' + c.autoNumber, c.opponent && 'ضد ' + c.opponent].filter(Boolean).join(' · '))}</p></header>
${timingRows ? `<h2>المواعيد المحسوبة</h2><table>${timingRows}</table>` : ''}${body}
${procedureRows ? `<h2>سجل الإجراءات</h2><table class="list"><tr><th>التاريخ</th><th>الإجراء</th><th>المحامي</th><th>المتابعة</th></tr>${procedureRows}</table>` : ''}
${workRows ? `<h2>المهام والجلسات المفتوحة</h2><table class="list"><tr><th>الموعد</th><th>النوع</th><th>العمل</th><th>المكان</th></tr>${workRows}</table>` : ''}
<footer>طُبع من مواثيق في ${escape(printedAt)}${printedBy ? ' بواسطة ' + escape(printedBy) : ''}. ملف داخلي سري.</footer></body></html>`;
}
