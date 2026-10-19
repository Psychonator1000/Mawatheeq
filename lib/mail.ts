import { useEffect, useState } from 'react';
import { backend, loadBackend } from './supabase-client';
import { mailRequest, sessionToken } from './local-auth';
import type { WorkspaceId } from './departments';

export type MailWorkspace = WorkspaceId;
export type MailRight = 'inbox' | 'sent' | 'send';
export type MailAccount = {
  id: string; workspace: MailWorkspace; ownerId: string; ownerName: string; label: string; address: string; displayName: string;
  provider: Provider; active: boolean; canSend: boolean; markSeen: boolean; lastSyncAt: string | null; lastError: string; lastErrorAt: string | null; revision: number; rights: MailRight[];
  imapHost?: string; imapPort?: number; imapSecurity?: 'ssl' | 'starttls'; smtpHost?: string; smtpPort?: number; username?: string; sentFolder?: string; sinceDays?: number;
};
export type MailPerson = { id: string; name: string; username: string; workspaces: MailWorkspace[] };
export type MailVisibility = { userId: string; workspace: MailWorkspace; inbox: boolean; sent: boolean; send: boolean };
export type MailContext = { me: string; admin: boolean; workspaces: MailWorkspace[]; accounts: MailAccount[]; members: MailPerson[]; visibility: MailVisibility[] };
export type MailAddress = { name?: string; address: string };
export type MailSummary = {
  id: string; accountId: string; folder: 'inbox' | 'sent'; fromName: string; fromAddr: string; to: MailAddress[]; subject: string; sentAt: string; snippet: string;
  attachments: number; state: 'open' | 'done'; assignedTo: string; assignedName: string; sentBy: string; repliedAt: string | null; repliedBy: string; read: boolean;
};
export type MailMessage = MailSummary & {
  cc: MailAddress[]; replyTo: string; messageId: string; inReplyTo: string; text: string; html: string; note: string; canSend: boolean;
  attachmentList: { name: string; size: number; mime: string; path: string }[]; readBy: { name: string; at: string }[];
};
export type MailCounts = { total: number; byWorkspace: Partial<Record<MailWorkspace, number>>; latest: { id: string; workspace: MailWorkspace; accountId: string; fromName: string; fromAddr: string; subject: string; sentAt: string }[]; errors: { id: string; address: string; error: string }[] };

export const MAIL_WORKSPACES: Record<MailWorkspace, string> = { legal: 'القضايا', secretary: 'السكرتارية', collections: 'التحصيل', accounting: 'المحاسبة', hr: 'الموارد البشرية', archive: 'الأرشيف' };

export type Provider = 'gmail' | 'outlook' | 'yahoo' | 'zoho' | 'icloud' | 'custom';
/** Server settings for common providers, and what the person needs to know to connect one. */
export const PROVIDERS: Record<Provider, { label: string; imap: string; smtp: string; imapPort: number; smtpPort: number; note: string }> = {
  gmail: { label: 'Gmail / Google Workspace', imap: 'imap.gmail.com', smtp: 'smtp.gmail.com', imapPort: 993, smtpPort: 465,
    note: 'فعّل التحقق بخطوتين في حساب Google، ثم أنشئ «كلمة مرور التطبيقات» من إعدادات الأمان والصقها هنا. كلمة مرور الحساب العادية لا تعمل.' },
  outlook: { label: 'Outlook / Microsoft 365 / Hotmail', imap: 'outlook.office365.com', smtp: '', imapPort: 993, smtpPort: 465,
    note: 'أوقفت Microsoft الدخول بكلمة المرور لبرامج البريد الخارجية في أغلب الحسابات. إن رُفض الاتصال: من إعدادات Outlook حوّل البريد تلقائياً إلى صندوق بريد آخر مرتبط هنا (مثل Gmail أو بريد الاستضافة).' },
  yahoo: { label: 'Yahoo Mail', imap: 'imap.mail.yahoo.com', smtp: 'smtp.mail.yahoo.com', imapPort: 993, smtpPort: 465,
    note: 'أنشئ «كلمة مرور التطبيقات» من إعدادات أمان الحساب في Yahoo واستخدمها هنا.' },
  zoho: { label: 'Zoho Mail', imap: 'imap.zoho.com', smtp: 'smtp.zoho.com', imapPort: 993, smtpPort: 465,
    note: 'فعّل IMAP من إعدادات Zoho Mail. إن كان التحقق بخطوتين مفعّلاً فاستخدم «كلمة مرور خاصة بالتطبيق».' },
  icloud: { label: 'iCloud Mail', imap: 'imap.mail.me.com', smtp: '', imapPort: 993, smtpPort: 465,
    note: 'أنشئ «كلمة مرور خاصة بالتطبيق» من appleid.apple.com. يعرض التطبيق بريد iCloud، أما الإرسال فيتطلب المنفذ 587 غير المسموح من الخادم، فيُرسل من بريد iCloud مباشرة.' },
  custom: { label: 'بريد النطاق أو الاستضافة (cPanel وغيره)', imap: '', smtp: '', imapPort: 993, smtpPort: 465,
    note: 'خوادم IMAP وSMTP تجدها في لوحة الاستضافة تحت «حسابات البريد» › «إعداد برنامج البريد». غالباً mail.اسم-النطاق، المنفذ 993 للوارد و465 للإرسال (SSL).' },
};

const MAIL_EVENT = 'mawatheeq-mail-changed';
export const OPEN_MAIL_EVENT = 'mawatheeq-open-mail';
const pendingKey = 'mawatheeq.mail-open';
export const mailChanged = () => window.dispatchEvent(new Event(MAIL_EVENT));
export function onMailChanged(fn: () => void) { window.addEventListener(MAIL_EVENT, fn); return () => window.removeEventListener(MAIL_EVENT, fn); }
/** Asks the hub to show a workspace's mail page (switching workspace if needed), optionally with one message open. */
export function openMail(workspace: MailWorkspace, id = '') {
  try { sessionStorage.setItem(pendingKey, JSON.stringify({ workspace, id })); } catch { /* the event still carries it */ }
  window.dispatchEvent(new CustomEvent(OPEN_MAIL_EVENT, { detail: { workspace, id } }));
}
export function takePendingMail(workspace: MailWorkspace): { id: string } | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
    if (p?.workspace !== workspace) return null;
    sessionStorage.removeItem(pendingKey); return { id: p.id || '' };
  } catch { return null; }
}

let available: Promise<boolean> | null = null;
/** Mail appears once its migration is applied; until then nothing about it shows. */
export function mailAvailable(): Promise<boolean> {
  available ??= mailRequest('counts').then(() => true, (e: { code?: string }) => { if (e?.code !== 'PGRST202' && e?.code !== '42883') available = null; return false; });
  return available;
}
export function useMailAvailable() { const [ok, setOk] = useState(false); useEffect(() => { let live = true; void mailAvailable().then(v => { if (live) setOk(v); }); return () => { live = false; }; }, []); return ok; }

/** Calls the «mail» edge function, which reaches the mail servers; the session token is checked in the database. */
export async function mailFunction<T = unknown>(action: 'sync' | 'test' | 'save' | 'send' | 'upload' | 'attachment', data: Record<string, unknown> = {}): Promise<T> {
  await loadBackend();
  const { data: result, error } = await backend().functions.invoke('mail', { body: { action, sessionToken: sessionToken(), ...data } });
  if (error || result?.error) {
    let message = result?.error || '';
    const ctx = (error as { context?: Response } | null)?.context;
    if (!message && ctx && typeof ctx.json === 'function') { try { message = (await ctx.json()).error || ''; } catch { /* not JSON */ } }
    throw new Error(message || 'تعذر الوصول إلى خدمة البريد. حاول مرة أخرى بعد قليل.');
  }
  return result as T;
}

/** Uploads an attachment for a message being written and returns its storage path. */
export async function uploadAttachment(accountId: string, file: File): Promise<string> {
  const r = await mailFunction<{ path: string; token: string }>('upload', { accountId, name: file.name, size: file.size });
  const { error } = await backend().storage.from('mawatheeq-mail').uploadToSignedUrl(r.path, r.token, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error('تعذر رفع المرفق: ' + error.message);
  return r.path;
}

const syncKey = 'mawatheeq.mail-sync-at';
let syncing: Promise<void> | null = null;
/**
 * Fetches new mail for the mailboxes this person can read. Only one open window does it per minute; batches continue until
 * nothing is waiting. Announces a change when anything arrived.
 */
export function syncMail(force = false): Promise<void> {
  if (syncing) return syncing;
  try { if (!force && Date.now() - Number(localStorage.getItem(syncKey) || 0) < 50000) return Promise.resolve(); localStorage.setItem(syncKey, String(Date.now())); } catch { /* storage blocked: sync anyway */ }
  syncing = (async () => {
    for (let round = 0; round < 6; round++) {
      const r = await mailFunction<{ added: number; more: boolean }>('sync', { force: force && round === 0 });
      if (r.added) mailChanged();
      if (!r.more) break;
    }
  })().catch(() => { /* errors are kept on each mailbox and shown in the bell */ }).finally(() => { syncing = null; });
  return syncing;
}

export const isAddress = (s: string) => /^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$/.test(s.trim());
/** "Name <a@b.c>, d@e.f" → addresses; anything unreadable is returned in `bad`. */
export function parseAddresses(text: string): { list: MailAddress[]; bad: string[] } {
  const list: MailAddress[] = [], bad: string[] = [];
  for (const raw of text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)) {
    const m = raw.match(/^(.*)<([^>]+)>$/);
    const address = (m ? m[2] : raw).trim(), name = m ? m[1].trim().replace(/^"|"$/g, '') : '';
    if (isAddress(address)) list.push({ name, address: address.toLowerCase() }); else bad.push(raw);
  }
  return { list, bad };
}
export const addressText = (a: MailAddress[]) => a.map(x => x.name ? `${x.name} <${x.address}>` : x.address).join(', ');
export const personOf = (m: { fromName: string; fromAddr: string }) => m.fromName || m.fromAddr || '—';
export function sizeText(n: number) { return n < 1024 ? n + ' بايت' : n < 1048576 ? Math.round(n / 1024) + ' ك.ب' : (n / 1048576).toFixed(1) + ' م.ب'; }
/** Text quoted under a reply. */
export function quoteFor(m: MailMessage, when: string) {
  return `\n\n${when} كتب ${personOf(m)}:\n` + (m.text || '').split('\n').map(l => '> ' + l).join('\n');
}
/** HTML of a received message, shown in a sandboxed frame: no scripts ever, and outside pictures only when asked. */
export function framedHtml(html: string, images: boolean) {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data:${images ? ' https: http:' : ''}; font-src data:`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.6;margin:12px;color:#222;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}

// One poller per window, shared by the bell and the page tabs: fetch mail every minute (and on returning to the window), then read the counts.
let counts: MailCounts | null = null, timer = 0, stopChange: (() => void) | null = null;
const subscribers = new Set<(c: MailCounts | null) => void>();
async function readCounts() { try { counts = await mailRequest<MailCounts>('counts'); subscribers.forEach(fn => fn(counts)); } catch { /* keep the last counts */ } }
const tick = () => { void syncMail().finally(() => void readCounts()); };
export function useMailCounts(enabled: boolean) {
  const [value, setValue] = useState<MailCounts | null>(counts);
  useEffect(() => {
    if (!enabled) return;
    subscribers.add(setValue);
    if (subscribers.size === 1) { tick(); timer = window.setInterval(tick, 60000); window.addEventListener('focus', tick); stopChange = onMailChanged(() => void readCounts()); }
    return () => {
      subscribers.delete(setValue);
      if (!subscribers.size) { clearInterval(timer); window.removeEventListener('focus', tick); stopChange?.(); stopChange = null; }
    };
  }, [enabled]);
  return value;
}
