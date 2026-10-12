// Matching a lawyer account to the lawyer name written on the cases («المحامي»), with the same spelling
// normalization the server uses (ي/ى, أ/ا, ة/ه, extra spaces).
import type { CaseRecord } from './domain';
import type { Permissions } from './permissions';

// Kept in step with mawatheeq_private.normalized() on the server.
export const lawyerKey = (v: unknown) => String(v ?? '').normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[\u064B-\u065Fـ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Distinct lawyer names on the cases with how many cases carry each, busiest first. */
export function lawyerLabels(records: Pick<CaseRecord, 'lawyer'>[]): [string, number][] {
  const m = new Map<string, number>();
  for (const c of records) { const l = String(c.lawyer || '').replace(/\s+/g, ' ').trim(); if (l) m.set(l, (m.get(l) || 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]);
}

/**
 * The case lawyer name an account stands for: the same name, or else the only case name that is the account name
 * shortened or extended by whole words («ا/ ايه» ↔ «ا/ ايه زينهم»). Never guesses between several candidates.
 */
export function matchLawyer(name: string, labels: string[]): string | undefined {
  const k = lawyerKey(name); if (!k) return undefined;
  const exact = labels.find(l => lawyerKey(l) === k); if (exact) return exact;
  const near = labels.filter(l => { const lk = lawyerKey(l); return lk && (k.startsWith(lk + ' ') || lk.startsWith(k + ' ')); });
  return near.length === 1 ? near[0] : undefined;
}

/** How many of the loaded cases an account can open. */
export function visibleCases(p: Pick<Permissions, 'caseScope' | 'caseIds' | 'lawyerNames'>, records: Pick<CaseRecord, 'id' | 'lawyer'>[]) {
  if (p.caseScope === 'all') return records.length;
  const ids = new Set(p.caseIds), names = new Set((p.lawyerNames || []).map(lawyerKey));
  return records.filter(c => ids.has(c.id) || (names.size > 0 && names.has(lawyerKey(c.lawyer)))).length;
}
