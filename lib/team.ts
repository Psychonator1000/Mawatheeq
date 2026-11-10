// «الهيكل الوظيفي»: who reports to whom, and the sections («الأقسام») people sit in (tables `team_lines` and
// `team_areas`, read and changed through the daily request). A node of the tree is a person ('u:' + id) or a section
// ('a:' + id); every node has one parent, or none when it sits at the top under the owner.
export type TeamLine = { userId: string; managerId: string | null; areaId: string | null };
import { LEGAL_SECTIONS, WORKSPACE_LABELS, type Permissions, type Section } from './permissions';

export type Workspace = keyof typeof WORKSPACE_LABELS;
/** `workspace`: the workspace a section stands for; whoever sits in it (at any depth) opens that workspace alone. */
export type TeamArea = { id: string; name: string; role: string | null; workspace?: Workspace | null; parentUser: string | null; parentArea: string | null };
/** `extras`: sections a person belongs to besides their main place, for the workspaces those sections stand for. */
export type TeamExtra = { userId: string; areaId: string };
/** `order`: each box's place among the boxes side by side under the same head, as the owner arranged them. */
export type TeamChart = { lines: TeamLine[]; areas: TeamArea[]; extras?: TeamExtra[]; order?: Record<string, number> };
/** What an account oversees (`below`, at any depth), and the whole chart for whoever may change it or reads every report. */
export type TeamInfo = TeamChart & { all: boolean; leads: boolean; canManage: boolean; below: string[] };
export const EMPTY_CHART: TeamChart = { lines: [], areas: [], extras: [] };

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

/** The workspace a person or section is in: that of the nearest section above it (itself included) standing for one. */
export function workspaceOf(parent: Map<string, string>, areas: TeamArea[], key: string): Workspace | null {
  const byId = new Map(areas.map(a => [a.id, a]));
  for (let k: string | undefined = key, n = 0; k && n < 80; k = parent.get(k), n++) if (k.startsWith('a:')) { const w = byId.get(k.slice(2))?.workspace; if (w) return w; }
  return null;
}
/**
 * Every workspace a person opens through the tree: that of their main place, and those of the sections they were added
 * to as well, in the workspace chooser's order.
 */
export function workspacesFor(parent: Map<string, string>, chart: TeamChart, userId: string): Workspace[] {
  const set = new Set<Workspace>();
  const main = workspaceOf(parent, chart.areas, 'u:' + userId); if (main) set.add(main);
  for (const x of chart.extras || []) if (x.userId === userId) { const w = workspaceOf(parent, chart.areas, 'a:' + x.areaId); if (w) set.add(w); }
  return (Object.keys(WORKSPACE_LABELS) as Workspace[]).filter(w => set.has(w));
}
/** The cases workspace's pages for someone who had none of them: the day, the register, dates and tasks. */
const LEGAL_START: Section[] = ['overview', 'cases', 'deadlines', 'work', 'daily'];
/**
 * A person's pages once the tree gives them the workspaces `ws`: those workspaces' pages alone. The cases workspace keeps
 * the cases pages they had, or starts from the usual ones; a department is its one section; no workspace means no pages.
 * The daily report («مهام اليوم والتقرير») stays with whoever had it.
 */
export function sectionsFor(p: Pick<Permissions, 'sections'>, ws: Workspace[]): Section[] {
  const daily: Section[] = p.sections.includes('daily') ? ['daily'] : [];
  const out: Section[] = [];
  for (const w of ws) {
    if (w === 'legal') { const own = p.sections.filter(s => LEGAL_SECTIONS.includes(s)); out.push(...(own.some(s => s !== 'daily') ? own : LEGAL_START)); }
    else out.push(w as Section);
  }
  return [...new Set([...out, ...daily])];
}
/** Each node's parent once `node` is moved under `target` (null: the top). */
export function movedParents(parent: Map<string, string>, node: string, target: string | null): Map<string, string> {
  const next = new Map(parent);
  if (target) next.set(node, target); else next.delete(node);
  return next;
}
