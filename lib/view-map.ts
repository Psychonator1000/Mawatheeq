// What each account sees, down to each field: every page of the cases workspace, every other workspace, every tab of
// the case window, every card in «بيانات الحكم» and every field in those cards. Each item is shown (the default),
// read-only or hidden; an item inherits the strictest setting of the items above it (a hidden tab hides its fields).
// The pages and workspaces still need their section in `sections`; this map only narrows what a section shows.

export type ViewMode = 'show' | 'read' | 'hide';
export type ViewKind = 'workspace' | 'page' | 'tab' | 'card' | 'field';
export type ViewItem = { id: string; label: string; kind: ViewKind; parent?: string; group?: string; section?: string };
/** Saved per account: only the items that are not simply shown. */
export type ViewSettings = Record<string, Exclude<ViewMode, 'show'>>;
export type AccountKind = 'staff' | 'lawyer' | 'counsel' | 'client';
export const ACCOUNT_KINDS: Record<AccountKind, { label: string; hint: string }> = {
  staff: { label: 'موظف', hint: 'موظف في المكتب: يرى الصفحات والقضايا التي تمنحها له.' },
  lawyer: { label: 'محامٍ', hint: 'محامٍ في المكتب: القضايا المسندة إليه عادةً.' },
  counsel: { label: 'مستشار', hint: 'مستشار قانوني: يطّلع على القضايا للرأي والإشراف.' },
  client: { label: 'موكل', hint: 'حساب للموكل نفسه: يرى قضايا ملفه فقط، للاطلاع دون تعديل، وما تسمح به فقط.' },
};

const page = (id: string, label: string, group: string, section: string): ViewItem => ({ id: 'page:' + id, label, kind: 'page', group, section });
const field = (card: string, key: string, label: string): ViewItem => ({ id: 'field:' + key, label, kind: 'field', parent: 'card:' + card });

export const VIEW_ITEMS: ViewItem[] = [
  // The cases workspace sidebar, in its groups.
  page('overview', 'نظرة عامة', '', 'overview'),
  page('cases', 'سجل الأحكام', 'القضايا', 'cases'),
  page('study', 'قضايا تحت الدراسة', 'القضايا', 'cases'),
  page('consultations', 'الاستشارات', 'القضايا', 'cases'),
  page('stayed', 'القضايا الموقوفة', 'القضايا', 'cases'),
  page('noContract', 'القضايا بدون عقود', 'القضايا', 'cases'),
  page('verification', 'التحقق من القضايا', 'القضايا', 'verification'),
  page('conflicts', 'فحص الأطراف', 'القضايا', 'conflicts'),
  page('daily', 'مهام اليوم والتقرير', 'الجلسات والمواعيد', 'daily'),
  page('work', 'المهام والجلسات', 'الجلسات والمواعيد', 'work'),
  page('posting', 'ترحيل الجلسات', 'الجلسات والمواعيد', 'cases'),
  page('postingErrors', 'أخطاء الترحيل', 'الجلسات والمواعيد', 'cases'),
  page('followup', 'متابعة الجلسات', 'الجلسات والمواعيد', 'cases'),
  page('deadlines', 'المواعيد والمتابعة', 'الجلسات والمواعيد', 'deadlines'),
  page('roll', 'مواعيد الجلسات (رول)', 'الجلسات والمواعيد', 'cases'),
  page('judgments', 'الأحكام الصادرة', 'الجلسات والمواعيد', 'cases'),
  page('statements', 'كشوف القضايا', 'الجلسات والمواعيد', 'cases'),
  page('clients', 'الموكلون', 'الموكلون والتقارير', 'clients'),
  page('summary', 'ملخص الموكلين', 'الموكلون والتقارير', 'clients'),
  page('analytics', 'التحليل والإحصائيات', 'الموكلون والتقارير', 'analytics'),
  // The other workspaces, whole.
  { id: 'ws:secretary', label: 'السكرتارية', kind: 'workspace', section: 'secretary' },
  { id: 'ws:collections', label: 'التحصيل', kind: 'workspace', section: 'collections' },
  { id: 'ws:accounting', label: 'المحاسبة', kind: 'workspace', section: 'accounting' },
  { id: 'ws:hr', label: 'الموارد البشرية', kind: 'workspace', section: 'hr' },
  { id: 'ws:archive', label: 'الأرشيف', kind: 'workspace', section: 'archive' },
  // The case window: its tabs…
  { id: 'tab:case', label: 'بيانات الحكم', kind: 'tab' },
  { id: 'tab:sessions', label: 'الجلسات', kind: 'tab' },
  { id: 'tab:stages', label: 'درجات التقاضي', kind: 'tab' },
  { id: 'tab:execution', label: 'الطعن والتنفيذ', kind: 'tab' },
  { id: 'tab:history', label: 'سجل الإجراءات', kind: 'tab' },
  { id: 'tab:timeline', label: 'السير الزمني', kind: 'tab' },
  { id: 'tab:files', label: 'المستندات', kind: 'tab' },
  { id: 'tab:finance', label: 'المالية', kind: 'tab' },
  { id: 'tab:collections', label: 'ملفات التحصيل', kind: 'tab' },
  { id: 'tab:verification', label: 'التحقق والمصادر', kind: 'tab' },
  { id: 'tab:discussion', label: 'النقاش', kind: 'tab' },
  // …the cards of «بيانات الحكم»…
  { id: 'card:parties', label: 'الملف والأطراف', kind: 'card', parent: 'tab:case' },
  { id: 'card:judgment', label: 'الحكم', kind: 'card', parent: 'tab:case' },
  { id: 'card:classify', label: 'التصنيف والملاحظات', kind: 'card', parent: 'tab:case' },
  { id: 'card:contract', label: 'عقد الأتعاب', kind: 'card', parent: 'tab:case' },
  { id: 'card:stay', label: 'إيقاف القضية', kind: 'card', parent: 'tab:case' },
  // …and every field in them.
  field('parties', 'code', 'كود المكتب'), field('parties', 'autoNumber', 'الرقم الآلي'), field('parties', 'role', 'صفة الموكل'),
  field('parties', 'opponent', 'الخصم'), field('parties', 'client', 'الموكل / الجهة'), field('parties', 'clientContactId', 'المتابع لدى الموكل'),
  field('parties', 'casePerson', 'الشخص المعني بالقضية'), field('parties', 'casePersonRole', 'صلته بالموكل'),
  field('judgment', 'caseNumber', 'رقم القضية / السنة'), field('judgment', 'court', 'المحكمة والدائرة'), field('judgment', 'type', 'نوع الحكم'),
  field('judgment', 'date', 'تاريخ الحكم'), field('judgment', 'outcome', 'نتيجة الحكم'), field('judgment', 'lawyer', 'المحامي'),
  field('judgment', 'ruling', 'منطوق الحكم'), field('judgment', 'subject', 'موضوع الدعوى'),
  field('classify', 'flags', 'تأمين / تنفيذ / اتصالات'), field('classify', 'notes', 'ملاحظات'),
  field('contract', 'contractNumber', 'رقم العقد'), field('contract', 'contractDate', 'تاريخ العقد'), field('contract', 'contractFee', 'الأتعاب المتفق عليها'),
  field('contract', 'contractWaived', 'لا يلزم عقد'),
  field('stay', 'stayed', 'القضية موقوفة'), field('stay', 'stayReason', 'سبب الإيقاف'),
];
const BY_ID = new Map(VIEW_ITEMS.map(i => [i.id, i]));
const RANK: Record<ViewMode, number> = { show: 0, read: 1, hide: 2 };

/** An item's mode for an account: its own setting, or a stricter one from the items above it. */
export function viewMode(view: ViewSettings | undefined, id: string): ViewMode {
  let mode: ViewMode = 'show';
  for (let cur: string | undefined = id; cur; cur = BY_ID.get(cur)?.parent) {
    const own = view?.[cur] || 'show';
    if (RANK[own] > RANK[mode]) mode = own;
  }
  return mode;
}
export const canSee = (view: ViewSettings | undefined, id: string) => viewMode(view, id) !== 'hide';
export const canChange = (view: ViewSettings | undefined, id: string) => viewMode(view, id) === 'show';
/** Show → read-only → hidden → show: what one click in the live preview does. */
export function cycleMode(mode: ViewMode, readable = true): ViewMode {
  return mode === 'show' ? (readable ? 'read' : 'hide') : mode === 'read' ? 'hide' : 'show';
}
export function setMode(view: ViewSettings, id: string, mode: ViewMode): ViewSettings {
  const next = { ...view };
  if (mode === 'show') delete next[id]; else next[id] = mode;
  return next;
}
/** Saved settings keep only known items with a valid mode. */
export function cleanView(view: unknown): ViewSettings {
  const out: ViewSettings = {};
  if (view && typeof view === 'object') for (const [k, v] of Object.entries(view as Record<string, unknown>)) if (BY_ID.has(k) && (v === 'read' || v === 'hide')) out[k] = v;
  return out;
}

/** Starting points: each account starts from one, then the owner adjusts it in the live preview. */
const hideAll = (ids: string[]): ViewSettings => Object.fromEntries(ids.map(id => [id, 'hide'])) as ViewSettings;
const FINANCE = ['tab:finance', 'tab:collections', 'card:contract', 'page:noContract'];
export const VIEW_TEMPLATES: { id: string; label: string; hint: string; view: ViewSettings }[] = [
  { id: 'all', label: 'كل شيء', hint: 'كل ما تفتحه صلاحياته ظاهر وقابل للتعديل.', view: {} },
  { id: 'admin', label: 'الأعمال الإدارية فقط', hint: 'الجلسات والمواعيد والإجراءات دون أي شيء مالي: لا المالية ولا التحصيل ولا عقود الأتعاب.', view: hideAll(FINANCE) },
  { id: 'readonly', label: 'اطلاع فقط', hint: 'يرى كل ما يُسمح له به دون أي تعديل.', view: Object.fromEntries(VIEW_ITEMS.filter(i => i.kind === 'tab').map(i => [i.id, 'read'])) as ViewSettings },
  { id: 'client', label: 'موكل', hint: 'يرى قضاياه للاطلاع: بيانات الحكم والجلسات ودرجات التقاضي والسير الزمني، دون المالية والتحصيل والملاحظات الداخلية والتحقق والنقاش.',
    view: { ...Object.fromEntries(VIEW_ITEMS.filter(i => i.kind === 'tab').map(i => [i.id, 'read'])) as ViewSettings,
      ...hideAll([...FINANCE, 'tab:history', 'tab:verification', 'tab:discussion', 'tab:files', 'card:classify', 'card:stay', 'field:lawyer',
        'page:study', 'page:consultations', 'page:stayed', 'page:verification', 'page:conflicts', 'page:work', 'page:posting', 'page:postingErrors',
        'page:followup', 'page:deadlines', 'page:roll', 'page:judgments', 'page:statements', 'page:clients', 'page:summary', 'page:analytics',
        'ws:secretary', 'ws:collections', 'ws:accounting', 'ws:hr', 'ws:archive']) } },
];
export const DEFAULT_TEMPLATE: Record<AccountKind, string> = { staff: 'all', lawyer: 'all', counsel: 'all', client: 'client' };

/** Parts a client account never has, whatever its view map says: the server refuses them to client accounts. */
const CLIENT_NEVER = ['tab:files', 'tab:discussion', 'tab:verification', 'tab:finance', 'tab:collections', 'page:paper', 'page:mail', 'ws:secretary', 'ws:collections', 'ws:accounting', 'ws:hr', 'ws:archive'];
/** The view map the app applies: the account's own, plus what its kind never sees. */
export function effectiveView(access: { view?: ViewSettings; accountKind?: AccountKind }): ViewSettings {
  return access.accountKind === 'client' ? { ...(access.view || {}), ...Object.fromEntries(CLIENT_NEVER.map(id => [id, 'hide'])) } : access.view || {};
}
