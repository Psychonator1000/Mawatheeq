// Recently opened case IDs for quick search; a per-device convenience that stores no case details.
const key = (userId: string) => 'mawatheeq.recent-cases.v1.' + userId;
export function recentCaseIds(userId: string): string[] {
  try { const ids = JSON.parse(localStorage.getItem(key(userId)) || '[]'); return Array.isArray(ids) ? ids.filter(id => typeof id === 'string').slice(0, 6) : []; }
  catch { return []; }
}
export function rememberCase(userId: string, id: string) {
  if (!userId || !id) return;
  try { localStorage.setItem(key(userId), JSON.stringify([id, ...recentCaseIds(userId).filter(x => x !== id)].slice(0, 6))); } catch { /* Optional convenience only. */ }
}
