// Advanced roll filter: print only certain clients, opponents, lawyers, courts, codes or numbers, everything except them,
// a range of codes or numbers (from one to another), or values containing some text.
// Each rule names a field, a mode and its values; a sitting is printed when it passes every rule.
import { arCompare, caseCode, caseState, enNumericCompare, inCaseCategory, type CaseRecord } from './domain.ts';
import { normalizeSearch } from './case-browse.ts';
import { clientName } from './clients.ts';
import { currentLevel, LEVEL_TITLE } from './case-stages.ts';

export type RollField = 'client' | 'opponent' | 'lawyer' | 'court' | 'role' | 'code' | 'autoNumber' | 'caseNumber' | 'level' | 'status' | 'staff' | 'decision' | 'kind' | 'progress' | 'category';
export const ROLL_FIELDS: [RollField, string][] = [['client', 'الموكل'], ['opponent', 'الخصم'], ['lawyer', 'المستشار'], ['court', 'المحكمة'], ['role', 'صفة الموكل'],
  ['code', 'الكود'], ['autoNumber', 'الرقم الآلي'], ['caseNumber', 'رقم القضية'], ['level', 'درجة التقاضي'], ['status', 'حالة القضية'], ['staff', 'الموظف المختص'],
  ['decision', 'الإجراء'], ['kind', 'نوع الإجراء'], ['progress', 'حالة الإنجاز'], ['category', 'التصنيف']];
/** Fields that hold numbers (a code may carry a prefix such as «ت-»): these also filter by range. */
export const NUMBER_FIELDS: RollField[] = ['code', 'autoNumber', 'caseNumber'];
export type RollMode = 'only' | 'except' | 'range' | 'outside' | 'contains';
export const ROLL_MODES: [RollMode, string][] = [['only', 'فقط'], ['except', 'ما عدا'], ['range', 'من … إلى'], ['outside', 'خارج النطاق'], ['contains', 'يحتوي على']];
/** The modes offered for a field: ranges only for numbers. */
export const modesFor = (field: RollField) => ROLL_MODES.filter(([m]) => NUMBER_FIELDS.includes(field) || (m !== 'range' && m !== 'outside'));
export type RollRule = { id: string; field: RollField; mode: RollMode; values: string[]; from?: string; to?: string };
/**
 * One row of a roll: the case, the court of the sitting, and for the sessions roll the sitting's date, the last
 * procedure posted and the staff member assigned to attend.
 */
export type RollItem = { c: CaseRecord; court?: string; date?: string; last?: { date?: unknown; decision?: unknown; kind?: unknown }; staff?: string; today?: string };
const CATEGORY_NAMES: [string, string][] = [['insurance', 'تأمين'], ['telecom', 'اتصالات'], ['execution', 'تنفيذ']];

export function rollValue(item: RollItem, field: RollField): string {
  const c = item.c;
  if (field === 'client') return clientName(c) || '';
  if (field === 'opponent') return String(c.opponent || '');
  if (field === 'lawyer') return String(c.lawyer || '');
  if (field === 'court') return String(item.court || c.court || '');
  if (field === 'code') return caseCode(c);
  if (field === 'autoNumber') return String(c.autoNumber || '');
  if (field === 'caseNumber') return String(c.caseNumber || '');
  if (field === 'level') return LEVEL_TITLE[currentLevel(c)];
  if (field === 'status') return caseState(c).status;
  if (field === 'staff') return item.staff || '';
  if (field === 'decision') return String(item.last?.decision || '');
  if (field === 'kind') return String(item.last?.kind || '');
  // A sitting whose date has passed without the next one being posted is still on the roll: it is overdue.
  if (field === 'progress') return item.date ? (item.date < (item.today || '') ? 'فائتة لم تُرحَّل' : 'قادمة') : '';
  if (field === 'category') return CATEGORY_NAMES.find(([k]) => inCaseCategory(c, k))?.[1] || 'عام';
  return String(c.role || '');
}
/** The distinct values of a field among the given sittings, for picking. */
export function rollOptions(items: RollItem[], field: RollField): string[] {
  const seen = new Map<string, string>();
  for (const i of items) { const v = rollValue(i, field).trim(); if (v && !seen.has(normalizeSearch(v))) seen.set(normalizeSearch(v), v); }
  return [...seen.values()].sort(arCompare);
}
/**
 * Several values typed or pasted at once: numbers are split at commas, spaces and new lines («1001، 1005 1010»);
 * names only at commas and new lines, since a name has spaces in it.
 */
export function splitValues(text: string, field: RollField): string[] {
  const parts = text.split(NUMBER_FIELDS.includes(field) ? /[\s,،;؛]+/ : /[\n,،;؛]+/).map(s => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}
// A number with what comes before it: «ت-120» is prefix «ت-» and 120. Arabic-Indic digits count too.
const digits = (s: string) => s.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
function numbered(s: string) {
  const m = digits(s.trim()).match(/^(.*?)(\d+)$/);
  return m ? { prefix: normalizeSearch(m[1].replace(/\s+/g, '')), n: Number(m[2]) } : null;
}
/** Whether a value lies between the two ends (either may be empty); a prefix on an end must match the value's. */
export function inRange(value: string, from = '', to = ''): boolean {
  const v = numbered(value), a = from.trim() ? numbered(from) : null, b = to.trim() ? numbered(to) : null;
  if (!v || (!a && !b)) return false;
  const prefix = (a || b)!.prefix;
  if (v.prefix !== prefix) return false;
  let lo = a ? a.n : -Infinity, hi = b ? b.n : Infinity;
  if (lo > hi) [lo, hi] = [hi, lo];
  return v.n >= lo && v.n <= hi;
}
/** A rule that has something to filter by. */
export const ruleActive = (r: RollRule) => r.mode === 'range' || r.mode === 'outside' ? !!(r.from?.trim() || r.to?.trim()) : r.values.length > 0;
/** True when the sitting passes every rule that has values. */
export function passesRollRules(item: RollItem, rules: RollRule[]): boolean {
  for (const r of rules) {
    if (!ruleActive(r)) continue;
    const raw = rollValue(item, r.field).trim(), v = normalizeSearch(raw);
    let pass: boolean;
    if (r.mode === 'range' || r.mode === 'outside') { const hit = inRange(raw, r.from, r.to); pass = r.mode === 'range' ? hit : !hit; }
    else if (r.mode === 'contains') pass = !!v && r.values.some(x => v.includes(normalizeSearch(x)));
    else {
      // Numbers match whatever way they were written (leading zeros, Arabic-Indic digits).
      const same = (x: string) => { if (NUMBER_FIELDS.includes(r.field)) { const p = numbered(x), q = numbered(raw); if (p && q) return p.prefix === q.prefix && p.n === q.n; } return normalizeSearch(x) === v; };
      const hit = r.values.some(same);
      pass = r.mode === 'only' ? hit : !hit;
    }
    if (!pass) return false;
  }
  return true;
}

/** How the roll orders its sittings within each day. */
export type RollSort = 'date' | 'court' | 'client' | 'code' | 'lawyer' | 'autoNumber';
export const ROLL_SORTS: [RollSort, string][] = [['date', 'الموعد والمحكمة'], ['court', 'المحكمة'], ['client', 'الموكل'], ['code', 'الكود'], ['lawyer', 'المستشار'], ['autoNumber', 'الرقم الآلي']];
export function sortRoll<T extends RollItem>(items: T[], by: RollSort): T[] {
  if (by === 'date') return items;
  const field: RollField = by === 'court' ? 'court' : by === 'client' ? 'client' : by === 'code' ? 'code' : by === 'lawyer' ? 'lawyer' : 'autoNumber';
  const cmp = NUMBER_FIELDS.includes(field) ? enNumericCompare : arCompare;
  // Stable: sittings with the same value keep their order by time and court.
  return items.map((it, i) => ({ it, i, v: rollValue(it, field) })).sort((a, b) => (a.v ? 0 : 1) - (b.v ? 0 : 1) || cmp(a.v, b.v) || a.i - b.i).map(x => x.it);
}
