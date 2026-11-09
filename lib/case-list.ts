// The judgments register's list in one place: which cases a view shows (the archive, the category, the deadlines of a
// day, the filter bar, the outcome, type and lawyer pickers, a figure picked on the analysis page) and in what order
// (the column sort, then a code typed in the search first). The register page uses it, and the database's
// «cases_list» answers the same question a page at a time; scripts/verify-case-list.mjs requires both to agree.
import { caseState, inCaseCategory, type CaseRecord, type Rules } from './domain.ts';
import { codeFirst, matchesCaseFilters, sortCases, type CaseFilters, type CaseSort } from './case-browse.ts';
import { analysisValue } from './office.ts';

export type DeadlineFilter = 'overdue' | 'soon' | 'followup';
export type ListQuery = {
  view: 'cases' | 'deadlines'; archive: boolean; filters: CaseFilters; outcome: string; type: string; lawyer: string;
  /** The deadlines view: which deadlines, and on which day they are reckoned. */
  deadlineFilter: DeadlineFilter | string; reportDate: string; sort: CaseSort;
};

/** The cases a register view shows, in its order. `dueWork`: cases with open work due on the report day. */
export function listCases(records: CaseRecord[], rules: Rules, q: ListQuery, today: string, dueWork: Set<string> = new Set()): CaseRecord[] {
  const day = q.view === 'deadlines' ? q.reportDate : today;
  const filtered = records.filter(c => {
    if (Boolean(c.archived) !== q.archive) return false;
    if (q.view === 'cases' && !inCaseCategory(c, q.filters.category, rules)) return false;
    if (q.view === 'deadlines') {
      const s = caseState(c, rules, q.reportDate);
      const hit = q.deadlineFilter === 'overdue' ? s.alert === 'انتهت المهلة' : q.deadlineFilter === 'soon' ? s.alert === 'خلال خمسة أيام'
        : (c.procedures || []).some(p => String(p.followup || '') === q.reportDate) || dueWork.has(c.id);
      if (!hit) return false;
    }
    const s = caseState(c, rules, today);
    return matchesCaseFilters(c, q.filters)
      && (!q.filters.analysisField || analysisValue(c, s, q.filters.analysisField) === q.filters.analysisValue)
      && (!q.outcome || s.outcome === q.outcome)
      && (!q.type || (c.type || 'يحتاج مراجعة') === q.type)
      && (!q.lawyer || c.lawyer === q.lawyer);
  });
  const remaining = (c: CaseRecord) => {
    const s = caseState(c, rules, day);
    return q.view === 'cases' && q.filters.category === 'execution' ? s.executionRemaining : s.days === 0 ? null : s.remaining;
  };
  return codeFirst(sortCases(filtered, q.sort, remaining), q.filters.search);
}
