// «الهيكل الوظيفي»: who reports to whom, and the sections («الأقسام») people sit in (tables `team_lines` and
// `team_areas`, read and changed through the daily request). A node of the tree is a person ('u:' + id) or a section
// ('a:' + id); every node has one parent, or none when it sits at the top under the owner.
export type TeamLine = { userId: string; managerId: string | null; areaId: string | null };
export type TeamArea = { id: string; name: string; role: string | null; parentUser: string | null; parentArea: string | null };
export type TeamChart = { lines: TeamLine[]; areas: TeamArea[] };
/** What an account oversees (`below`, at any depth), and the whole chart for whoever may change it or reads every report. */
export type TeamInfo = TeamChart & { all: boolean; leads: boolean; canManage: boolean; below: string[] };
export const EMPTY_CHART: TeamChart = { lines: [], areas: [] };

/** Each node's parent ('u:…' or 'a:…'); a node missing from the map sits at the top. */
export function parents(chart: TeamChart): Map<string, string> {
  const p = new Map<string, string>();
  for (const l of chart.lines) { const to = l.managerId ? 'u:' + l.managerId : l.areaId ? 'a:' + l.areaId : ''; if (to) p.set('u:' + l.userId, to); }
  for (const a of chart.areas) { const to = a.parentUser ? 'u:' + a.parentUser : a.parentArea ? 'a:' + a.parentArea : ''; if (to) p.set('a:' + a.id, to); }
  return p;
}
/** Every node under `key`, at any depth. */
export function nodesBelow(parent: Map<string, string>, key: string): Set<string> {
  const kids = new Map<string, string[]>();
  for (const [child, up] of parent) kids.set(up, [...(kids.get(up) || []), child]);
  const out = new Set<string>();
  const walk = (x: string) => { for (const k of kids.get(x) || []) if (!out.has(k)) { out.add(k); walk(k); } };
  walk(key);
  return out;
}
/** The people under a person or a section, at any depth (sections themselves left out). */
export const peopleBelow = (parent: Map<string, string>, key: string) => new Set([...nodesBelow(parent, key)].filter(k => k.startsWith('u:')).map(k => k.slice(2)));
/** «شخص واحد، شخصين، 3 أشخاص، 11 شخصاً». */
export const peopleCount = (n: number) => n === 1 ? 'شخص واحد' : n === 2 ? 'شخصين' : n % 100 >= 3 && n % 100 <= 10 ? `${n} أشخاص` : `${n} شخصاً`;
/** A section's name to start from, for the kind of work it is for. */
export const AREA_NAMES: Record<string, string> = {
  manager: 'الإدارة', lawyer: 'المحامون', traineeLawyer: 'المحامون المتدربون', counsel: 'المستشارون', legalResearcher: 'الباحثون القانونيون',
  translator: 'الترجمة', secretary: 'السكرتارية', receptionist: 'الاستقبال', sessionsClerk: 'إداريو الجلسات', executionClerk: 'إداريو التنفيذ',
  collections: 'التحصيل', callCenter: 'الكول سنتر', accountant: 'المحاسبة', hr: 'الموارد البشرية', archivist: 'الأرشيف', dataEntry: 'إدخال البيانات',
  courier: 'الخارجيات', representative: 'المندوبون', driver: 'السائقون', officeAdmin: 'الشؤون الإدارية', officeBoy: 'الخدمات', developer: 'البرمجيات',
  networkEngineer: 'الشبكات', itSupport: 'الدعم الفني', engineer: 'الهندسة',
};
