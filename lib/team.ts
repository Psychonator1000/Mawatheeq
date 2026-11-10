// «الهيكل الوظيفي»: who reports to whom (table `team_lines`, read and changed through the daily request).
export type TeamLine = { userId: string; managerId: string };
/** What an account oversees (`below`, at any depth), and the whole chart for whoever may change it or reads every report. */
export type TeamInfo = { all: boolean; leads: boolean; canManage: boolean; below: string[]; lines: TeamLine[] };

/** Everyone under `id`, at any depth, from a map of who reports to whom. */
export function teamBelow(boss: Map<string, string>, id: string): Set<string> {
  const kids = new Map<string, string[]>();
  for (const [user, manager] of boss) kids.set(manager, [...(kids.get(manager) || []), user]);
  const out = new Set<string>();
  const walk = (x: string) => { for (const k of kids.get(x) || []) if (!out.has(k)) { out.add(k); walk(k); } };
  walk(id);
  return out;
}
/** «شخص واحد، شخصين، 3 أشخاص، 11 شخصاً». */
export const peopleCount = (n: number) => n === 1 ? 'شخص واحد' : n === 2 ? 'شخصين' : n % 100 >= 3 && n % 100 <= 10 ? `${n} أشخاص` : `${n} شخصاً`;
