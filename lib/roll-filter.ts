// Advanced roll filter: print only certain clients, opponents, lawyers or courts, or everything except them.
// Each rule names a field, a mode and one or more values; a sitting is printed when it passes every rule.
import { arCompare, type CaseRecord } from './domain.ts';
import { normalizeSearch } from './case-browse.ts';
import { clientName } from './clients.ts';

export type RollField = 'client' | 'opponent' | 'lawyer' | 'court' | 'role';
export const ROLL_FIELDS: [RollField, string][] = [['client', 'الموكل'], ['opponent', 'الخصم'], ['lawyer', 'المستشار'], ['court', 'المحكمة'], ['role', 'صفة الموكل']];
export type RollMode = 'only' | 'except';
export const ROLL_MODES: [RollMode, string][] = [['only', 'فقط'], ['except', 'ما عدا']];
export type RollRule = { id: string; field: RollField; mode: RollMode; values: string[] };
export type RollItem = { c: CaseRecord; court?: string };

export function rollValue(item: RollItem, field: RollField): string {
  const c = item.c;
  if (field === 'client') return clientName(c) || '';
  if (field === 'opponent') return String(c.opponent || '');
  if (field === 'lawyer') return String(c.lawyer || '');
  if (field === 'court') return String(item.court || c.court || '');
  return String(c.role || '');
}
/** The distinct values of a field among the given sittings, for picking. */
export function rollOptions(items: RollItem[], field: RollField): string[] {
  const seen = new Map<string, string>();
  for (const i of items) { const v = rollValue(i, field).trim(); if (v && !seen.has(normalizeSearch(v))) seen.set(normalizeSearch(v), v); }
  return [...seen.values()].sort(arCompare);
}
/** True when the sitting passes every rule that has values. */
export function passesRollRules(item: RollItem, rules: RollRule[]): boolean {
  for (const r of rules) {
    if (!r.values.length) continue;
    const v = normalizeSearch(rollValue(item, r.field).trim());
    const hit = r.values.some(x => normalizeSearch(x) === v);
    if (r.mode === 'only' ? !hit : hit) return false;
  }
  return true;
}
