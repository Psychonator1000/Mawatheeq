// A reminder to download a full backup at least weekly (owner, 11 November 2026): the free plan keeps no copies of
// its own. The date of the last backup taken on this computer is remembered here; the reminder shows to whoever may
// take backups when it is more than a week old (or none was taken here yet).
const KEY = 'mawatheeq.backup.last';
const WEEK = 7 * 24 * 60 * 60 * 1000;
export function lastBackup(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
export function markBackup() { try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* Reminded again next time. */ } }
export function backupDue(now = Date.now()) { const last = lastBackup(); return !last || now - Date.parse(last) > WEEK; }
