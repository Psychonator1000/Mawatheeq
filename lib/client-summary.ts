// «ملخص الموكلين»: each client's cases counted by file status and court level, with sessions, judgments, contracts and
// lawyers on request, grouped under the people who link several client files (an owner of several companies).
import { type CaseRecord, type Rules, caseState, todayISO, daysBetween } from './domain.ts';
import { type ClientEntity } from './clients.ts';
import { currentLevel } from './case-stages.ts';
import { nextSitting } from './case-desk.ts';
import { normalizeSearch } from './case-browse.ts';

export const STATUS_COLUMNS = [
  ['filing', 'تحت الرفع'], ['open1', 'متداول · أول درجة'], ['open2', 'متداول · استئناف'], ['open3', 'متداول · تمييز'],
  ['follow', 'متابعة'], ['execution', 'تنفيذ'], ['stayed', 'موقوف / مشطوب'], ['closed', 'منتهي'], ['other', 'أخرى'],
] as const;
export type StatusKey = typeof STATUS_COLUMNS[number][0];
export const EXTRA_GROUPS = [['sessions', 'الجلسات القادمة'], ['judgments', 'الأحكام'], ['contracts', 'العقود والأتعاب'], ['lawyers', 'المحامون']] as const;
export type ExtraGroup = typeof EXTRA_GROUPS[number][0];

/** Where a case stands, from the old register's file status (or the app's own state when it has none). */
export function statusOf(c: CaseRecord): StatusKey {
  const s = normalizeSearch(c.legacyStatus);
  const open = (): StatusKey => { const l = currentLevel(c); return l === 'تمييز' ? 'open3' : l === 'استئناف' ? 'open2' : 'open1'; };
  if (c.archived || /^(منته|مضموم)/.test(s)) return 'closed';
  if (/^تحت الرفع/.test(s)) return 'filing';
  if (/^(وقف|مشطوب)/.test(s) || c.stayed) return 'stayed';
  if (/^تنفيذ/.test(s)) return 'execution';
  if (/^متابع/.test(s)) return 'follow';
  if (/^متداول/.test(s) || !s) return open();
  return 'other';
}

/** One row per case: records of the same case at several court levels share its code and number; the highest counts. */
export function casesOnce(records: CaseRecord[]): CaseRecord[] {
  const rank = (c: CaseRecord) => ({ ابتدائي: 1, استئناف: 2, تمييز: 3 } as Record<string, number>)[currentLevel(c)] || 0;
  const best = new Map<string, CaseRecord>();
  for (const c of records) {
    const code = String(c.code || '').trim(), auto = String(c.autoNumber || '').trim();
    const key = code || auto ? `${c.insurance ? 'i' : 'm'}|${code}|${auto}` : c.id, had = best.get(key);
    if (!had || (had.archived && !c.archived) || (Boolean(had.archived) === Boolean(c.archived) && rank(c) > rank(had))) best.set(key, c);
  }
  return [...best.values()];
}

export type SummaryRow = {
  counts: Record<StatusKey, number>; total: number; open: number;
  next7: number; next30: number; nextDate: string; won: number; lost: number; appealOpen: number;
  noContract: number; fees: number; lawyers: [string, number][];
};
export function summarize(records: CaseRecord[], rules: Rules, today = todayISO()): SummaryRow {
  const counts = Object.fromEntries(STATUS_COLUMNS.map(([k]) => [k, 0])) as Record<StatusKey, number>;
  const row: SummaryRow = { counts, total: 0, open: 0, next7: 0, next30: 0, nextDate: '', won: 0, lost: 0, appealOpen: 0, noContract: 0, fees: 0, lawyers: [] };
  const lawyers = new Map<string, number>();
  for (const c of casesOnce(records)) {
    const k = statusOf(c); counts[k]++; row.total++;
    const live = k !== 'closed';
    if (live) row.open++;
    const next = nextSitting(c);
    if (live && next && next >= today) {
      const d = daysBetween(today, next) ?? 999;
      if (d <= 7) row.next7++;
      if (d <= 30) row.next30++;
      if (!row.nextDate || next < row.nextDate) row.nextDate = next;
    }
    if (c.date) {
      if (c.outcome === 'لصالحنا') row.won++; else if (c.outcome === 'غير صالحنا') row.lost++;
      const st = caseState(c, rules, today);
      if (live && st.remaining !== null && st.remaining > 0) row.appealOpen++;
    }
    if (live && !String(c.contractNumber || '').trim() && !c.contractWaived) row.noContract++;
    const fee = Number(String(c.contractFee || '').replace(/[^\d.]/g, ''));
    if (Number.isFinite(fee)) row.fees += fee;
    const l = String(c.lawyer || '').trim();
    if (l && live) lawyers.set(l, (lawyers.get(l) || 0) + 1);
  }
  row.lawyers = [...lawyers].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'));
  return row;
}

const tokens = (s: string) => normalizeSearch(s).replace(/عبد\s+/g, 'عبد').replace(/[^\p{L}\s]/gu, ' ').split(' ').filter(Boolean);
/** The same person written two ways: same first and last name, and every part of the shorter in the longer. */
export function samePerson(a: string, b: string) {
  const x = tokens(a), y = tokens(b);
  if (x.length < 2 || y.length < 2) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short[0] === long[0] && short.at(-1) === long.at(-1) && short.every(t => long.includes(t));
}

export type PersonGroup = { person: string; clients: ClientEntity[] };
/**
 * People who link several client files: listed under «الأشخاص المرتبطون» of two or more files, or listed in one
 * and holding a client file in their own name. A file can sit under several people.
 */
export function personGroups(clients: ClientEntity[]): PersonGroup[] {
  const people: { name: string; ids: Set<string> }[] = [];
  const add = (name: string, id: string) => {
    if (tokens(name).length < 2) return;
    const p = people.find(x => samePerson(x.name, name));
    if (p) { p.ids.add(id); if (tokens(name).length > tokens(p.name).length) p.name = name; } else people.push({ name, ids: new Set([id]) });
  };
  for (const c of clients) for (const p of c.contacts || []) add(p.name, c.id);
  for (const p of people) for (const c of clients) if (c.kind !== 'organization' && samePerson(p.name, c.name)) { p.ids.add(c.id); if (tokens(c.name).length >= tokens(p.name).length) p.name = c.name; }
  return people.filter(p => p.ids.size > 1).map(p => ({ person: p.name, clients: clients.filter(c => p.ids.has(c.id)) }));
}
