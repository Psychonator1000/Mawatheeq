// What each account sees, down to each field: every page of the cases workspace, every other workspace, every tab of
// the case window, every card in «بيانات الحكم» and every field in those cards. Each item is shown (the default),
// read-only or hidden; an item inherits the strictest setting of the items above it (a hidden tab hides its fields).
// The pages and workspaces still need their section in `sections`; this map only narrows what a section shows.

export type ViewMode = 'show' | 'read' | 'hide';
export type ViewKind = 'workspace' | 'page' | 'tab' | 'card' | 'field';
export type ViewItem = { id: string; label: string; kind: ViewKind; parent?: string; group?: string; section?: string };
/** Saved per account: only the items that are not simply shown (and «show» for a new page shown to a restricted account). */
export type ViewSettings = Record<string, ViewMode>;
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
  // «ملفاتي الورقية» needs no section: every office account has it unless it is hidden here.
  { id: 'page:paper', label: 'ملفاتي الورقية', kind: 'page', group: 'بريدي وملفاتي' },
  // The other workspaces, whole.
  { id: 'ws:secretary', label: 'السكرتارية', kind: 'workspace', section: 'secretary' },
  { id: 'ws:collections', label: 'التحصيل', kind: 'workspace', section: 'collections' },
  { id: 'ws:accounting', label: 'المحاسبة', kind: 'workspace', section: 'accounting' },
  { id: 'ws:hr', label: 'الموارد البشرية', kind: 'workspace', section: 'hr' },
  { id: 'ws:archive', label: 'الأرشيف', kind: 'workspace', section: 'archive' },
  // Mail and chat, switched off per account here; the server refuses them too (view_hidden).
  { id: 'ws:mail', label: 'البريد', kind: 'workspace' },
  { id: 'ws:chat', label: 'المحادثات', kind: 'workspace' },
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

// New pages start hidden for restricted accounts (owner, 13 November 2026: «yes do the new pages hidden too»): the
// pages and workspaces as they stood on 13 November 2026. One added after that (any page or workspace not listed here)
// starts hidden for an account whose view hides any page or workspace, until the owner shows it in its permissions,
// which keeps {"page:x": "show"}. Accounts that see everything see it as before. Never add to this list.
const PAGES_ON_13_NOV_2026 = new Set(['page:overview', 'page:cases', 'page:study', 'page:consultations', 'page:stayed', 'page:noContract', 'page:verification',
  'page:conflicts', 'page:daily', 'page:work', 'page:posting', 'page:postingErrors', 'page:followup', 'page:deadlines', 'page:roll', 'page:judgments',
  'page:statements', 'page:clients', 'page:summary', 'page:analytics', 'page:paper', 'ws:secretary', 'ws:collections', 'ws:accounting', 'ws:hr',
  'ws:archive', 'ws:mail', 'ws:chat']);
/** A page or workspace added after 13 November 2026. */
export const isNewPage = (i: ViewItem | undefined) => !!i && (i.kind === 'page' || i.kind === 'workspace') && !PAGES_ON_13_NOV_2026.has(i.id);
/** An account whose view hides at least one page or workspace. */
export const restricted = (view: ViewSettings | undefined) => Object.entries(view || {}).some(([k, m]) => m === 'hide' && /^(page|ws):/.test(k));
/** The account's view with the new pages it has not been shown hidden, when it is restricted. */
export function withDefaults(view: ViewSettings | undefined, items: ViewItem[] = VIEW_ITEMS): ViewSettings {
  const v = view || {};
  if (!restricted(v)) return v;
  let out = v;
  for (const i of items) if (isNewPage(i) && !(i.id in v)) out = { ...out, [i.id]: 'hide' };
  return out;
}
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
  // A new page keeps its «show», so a restricted account goes on seeing it (see withDefaults).
  if (mode === 'show' && !isNewPage(BY_ID.get(id))) delete next[id]; else next[id] = mode;
  return next;
}
/** Saved settings keep only known items with a valid mode. */
export function cleanView(view: unknown): ViewSettings {
  const out: ViewSettings = {};
  if (view && typeof view === 'object') for (const [k, v] of Object.entries(view as Record<string, unknown>)) if (BY_ID.has(k) && (v === 'read' || v === 'hide' || (v === 'show' && isNewPage(BY_ID.get(k))))) out[k] = v;
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
/** Whether mail or chat is switched off for this account (the owner, with no view map, always has both). */
export const toolOff = (access: { view?: ViewSettings; accountKind?: AccountKind } | null | undefined, tool: 'mail' | 'chat') => !!access && effectiveView(access)['ws:' + tool] === 'hide';
export function effectiveView(access: { view?: ViewSettings; accountKind?: AccountKind }): ViewSettings {
  const view = withDefaults(access.view);
  return access.accountKind === 'client' ? { ...view, ...Object.fromEntries(CLIENT_NEVER.map(id => [id, 'hide'])) } : view;
}

// «مهام اليوم والتقرير» also opens for an account with cases, hearings or deadlines (canOpen in permissions.ts), so its
// section only decides whether the account writes a daily report: shown = writes one, read-only = sees its day
// without a report, hidden = not in its menu at all.
const DAILY = 'page:daily', DAY_SECTIONS = ['work', 'cases', 'deadlines'];
type Pages = { sections: string[]; view?: ViewSettings; adminPowers?: string[] };
const dayOpens = (v: Pages) => v.sections.some(s => DAY_SECTIONS.includes(s)) || (v.adminPowers || []).some(p => p === 'staff' || p === 'reviews');

/** Whether the item is in the account's menu at all (granted), before its own setting. */
export const itemGranted = (v: Pages, i: ViewItem) => !i.section || v.sections.includes(i.section) || (i.id === DAILY && dayOpens(v));
/** The item's mode for an account: hidden when it is not granted. */
export function itemMode(v: Pages, i: ViewItem): ViewMode {
  if (!itemGranted(v, i)) return 'hide';
  const own = viewMode(withDefaults(v.view), i.id);
  return i.id === DAILY && own === 'show' && !v.sections.includes('daily') ? 'read' : own;
}
/** What one click on the item does: grants it when it is not granted, else turns it to the next mode. */
export const nextItemMode = (v: Pages, i: ViewItem, readable = true): ViewMode => !itemGranted(v, i) ? 'show' : cycleMode(itemMode(v, i), readable);

/**
 * An account's pages with item `i` set to `mode`, as the permission editor does it: an item whose section is not
 * granted is granted and shown alone in the side list (its section's other pages hidden); hiding the last shown item
 * of a section takes the section away, so the server refuses it too. Shared by the editor and «تطبيق على عدة حسابات».
 */
export function withItemMode<P extends Pages>(v: P, i: ViewItem, mode: ViewMode): P {
  if (i.id === DAILY) {
    const others = v.sections.filter(s => s !== 'daily'), view = setMode(v.view || {}, DAILY, mode === 'hide' ? 'hide' : 'show');
    // Read-only for an account the page does not open for otherwise would leave it out of the menu: it writes reports.
    const report = mode === 'show' || (mode === 'read' && !dayOpens({ ...v, sections: others }));
    return { ...v, sections: report ? [...others, 'daily'] : others, view } as P;
  }
  const sec = i.section, siblings = sec ? VIEW_ITEMS.filter(x => x.section === sec) : [], side = (x: ViewItem) => x.kind === 'page' || x.kind === 'workspace';
  let next = v.view || {};
  if (sec && !v.sections.includes(sec)) {
    if (mode === 'hide') return v;
    next = setMode(next, i.id, mode);
    for (const x of siblings) if (x.id !== i.id && side(x) && side(i)) next = setMode(next, x.id, 'hide');
    return { ...v, sections: [...v.sections, sec], view: next };
  }
  next = setMode(next, i.id, mode);
  // The section goes with its last page; the pages keep their hidden mark, since some open by another section too.
  if (sec && siblings.every(x => viewMode(withDefaults(next), x.id) === 'hide')) return { ...v, view: next, sections: v.sections.filter(x => x !== sec) };
  return { ...v, view: next };
}
