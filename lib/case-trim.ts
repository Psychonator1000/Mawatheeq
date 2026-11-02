// Cases read from a light list (see «cases_page» with «light»): older sessions left on the server.
const TRIM_KEYS = ['proceduresTrimmed', 'proceduresKept', 'proceduresTotal'] as const;

/** Is this a case read from a light list, without its older sessions? */
export const isTrimmed = (c: object) => Boolean((c as { proceduresTrimmed?: unknown })?.proceduresTrimmed);

/**
 * `c` (from a light list, perhaps edited since) with the older entries of `whole` put back before the ones it showed,
 * as they stand now: edited, removed or added. The marks of a light copy go.
 */
export function restoreHistory<T extends object>(c: T, whole: Record<string, unknown>): T {
  const r = c as Record<string, unknown>, kept = new Set((r.proceduresKept as string[] | undefined) || []);
  const older = ((whole.procedures as { id: string }[] | undefined) || []).filter(p => !kept.has(p.id));
  const out: Record<string, unknown> = { ...r, procedures: [...older, ...((r.procedures as unknown[]) || [])] };
  for (const k of TRIM_KEYS) delete out[k];
  return out as T;
}
