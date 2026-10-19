// What the mail function does, with its outside world passed in: sockets, the MIME parser, the database and storage.
import { Imap, MailError, Smtp, buildMessage, imapDate, textToHtml, type Address, type Connect } from './protocol.ts';

export type Parsed = {
  messageId?: string; inReplyTo?: string; subject?: string; date?: string;
  from?: { name?: string; address?: string }; to?: { name?: string; address?: string }[]; cc?: { name?: string; address?: string }[]; replyTo?: { address?: string }[];
  text?: string; html?: string;
  attachments: { filename?: string | null; mimeType?: string; disposition?: string | null; contentId?: string; content: ArrayBuffer | Uint8Array | string }[];
};
export type Deps = {
  connect: Connect;
  parse: (raw: Uint8Array) => Promise<Parsed>;
  rpc: <T = unknown>(action: string, data?: Record<string, unknown>) => Promise<T>;
  upload: (path: string, data: Uint8Array, mime: string) => Promise<void>;
  download: (path: string) => Promise<Uint8Array>;
  now?: () => Date;
};
export type DueAccount = {
  id: string; address: string; imapHost: string; imapPort: number; imapSecurity: 'ssl' | 'starttls'; username: string; password: string;
  sentFolder: string; sinceDays: number; inboxValidity: number | null; inboxUid: number; sentValidity: number | null; sentUid: number; first: boolean;
};

const BATCH = 20, BUDGET = 12 * 1024 * 1024, BIG = 15 * 1024 * 1024, ATTACH = 15 * 1024 * 1024, FIRST_LIMIT = 200;

export function friendlyError(e: unknown): string {
  if (e instanceof MailError) {
    if (e.kind === 'auth') return e.message + ' في Gmail وYahoo وiCloud استخدم «كلمة مرور التطبيقات» من إعدادات الأمان، لا كلمة مرور الحساب.';
    return e.message;
  }
  return 'تعذر الوصول إلى البريد: ' + String((e as Error)?.message || e).slice(0, 200);
}

const bytesOf = (c: ArrayBuffer | Uint8Array | string) => typeof c === 'string' ? new TextEncoder().encode(c) : c instanceof Uint8Array ? c : new Uint8Array(c);
const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'file';
const addr = (a?: { name?: string; address?: string }) => ({ name: a?.name || '', address: (a?.address || '').toLowerCase() });
const snippetOf = (p: Parsed) => (p.text || (p.html || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '))
  .replace(/\s+/g, ' ').trim().slice(0, 240);

/** Turns a fetched message into the row the database keeps; attachments go to storage, small inline pictures into the HTML. */
async function toRow(deps: Deps, accountId: string, folder: string, validity: number, uid: number, raw: Uint8Array, size: number, partial: boolean) {
  const p = await deps.parse(raw);
  let html = p.html || '';
  const attachments: { name: string; size: number; mime: string; path: string }[] = [];
  let i = 0;
  for (const a of p.attachments || []) {
    const data = bytesOf(a.content), mime = a.mimeType || 'application/octet-stream';
    const cid = (a.contentId || '').replace(/^<|>$/g, '');
    if (cid && html.includes('cid:' + cid) && data.length <= 300 * 1024 && mime.startsWith('image/')) {
      let bin = ''; for (let k = 0; k < data.length; k += 8192) bin += String.fromCharCode(...data.subarray(k, k + 8192));
      html = html.split('cid:' + cid).join(`data:${mime};base64,${btoa(bin)}`); continue;
    }
    const name = a.filename || `attachment-${i + 1}`;
    let path = '';
    if (data.length <= ATTACH) { path = `${accountId}/${folder}/${validity}-${uid}/${i}-${safeName(name)}`; await deps.upload(path, data, mime); }
    attachments.push({ name, size: data.length, mime, path }); i++;
  }
  const text = (p.text || '') + (partial ? '\n\n[الرسالة كبيرة جداً؛ عُرضت عناوينها فقط. افتحها من بريدك مباشرة.]' : '');
  return {
    uid, messageId: p.messageId || '', inReplyTo: p.inReplyTo || '', fromName: p.from?.name || '', fromAddr: (p.from?.address || '').toLowerCase(),
    to: (p.to || []).map(addr), cc: (p.cc || []).map(addr), replyTo: (p.replyTo?.[0]?.address || '').toLowerCase(),
    subject: p.subject || '', date: p.date && !isNaN(Date.parse(p.date)) ? new Date(p.date).toISOString() : null,
    snippet: snippetOf(p) || (partial ? 'رسالة كبيرة' : ''), text, html: html.length > 500000 ? '' : html, attachments, size,
  };
}

/** Fetches what is new in one mailbox's inbox and sent folder, a batch at a time. Returns whether more is waiting. */
export async function syncAccount(deps: Deps, acc: DueAccount): Promise<{ more: boolean; added: number }> {
  const imap = await Imap.open(deps.connect, { host: acc.imapHost, port: acc.imapPort, security: acc.imapSecurity, username: acc.username, password: acc.password });
  let more = false, added = 0, budget = BUDGET, count = BATCH;
  try {
    // Messages opened (or marked unread) in the app since the last fetch, when the mailbox's switch is on.
    const pending = await deps.rpc<{ validity: number | null; items: { id: string; uid: number; seen: boolean }[] }>('pending_seen', { accountId: acc.id });
    if (pending?.items?.length) {
      const box = await imap.examine('INBOX', true);
      if (box.validity === pending.validity) {
        await imap.setSeen(pending.items.filter(p => p.seen).map(p => p.uid), true);
        await imap.setSeen(pending.items.filter(p => !p.seen).map(p => p.uid), false);
      }
      await deps.rpc('seen_done', { accountId: acc.id, ids: pending.items.map(p => p.id) });
    }
    for (const folder of ['inbox', 'sent'] as const) {
      const name = folder === 'inbox' ? 'INBOX' : acc.sentFolder || await imap.findSent();
      if (!name) continue;
      const box = await imap.examine(name);
      const known = folder === 'inbox' ? acc.inboxValidity : acc.sentValidity;
      const last = known === box.validity ? (folder === 'inbox' ? acc.inboxUid : acc.sentUid) : 0;
      let uids: number[] = [];
      if (box.exists) {
        const since = new Date((deps.now?.() || new Date()).getTime() - acc.sinceDays * 86400000);
        uids = (last ? await imap.search(`UID ${last + 1}:*`) : await imap.search('SINCE ' + imapDate(since))).filter(u => u > last);
        if (!last && uids.length > FIRST_LIMIT) uids = uids.slice(-FIRST_LIMIT);
      }
      const sizes = await imap.sizes(uids.slice(0, count));
      const take: number[] = [];
      for (const u of uids.slice(0, count)) { const s = sizes.get(u) ?? 0; if (take.length && budget - Math.min(s, BIG) < 0) break; take.push(u); budget -= Math.min(s, BIG); }
      if (take.length < uids.length) more = true;
      count -= take.length;
      const small = take.filter(u => (sizes.get(u) ?? 0) <= BIG), big = take.filter(u => (sizes.get(u) ?? 0) > BIG);
      const raws = new Map([...await imap.fetch(small), ...await imap.fetch(big, true)]);
      const messages = [];
      for (const u of take) {
        const raw = raws.get(u);
        if (raw) messages.push(await toRow(deps, acc.id, folder, box.validity, u, raw, sizes.get(u) ?? raw.length, big.includes(u)));
      }
      const r = await deps.rpc<{ added: number }>('ingest', { accountId: acc.id, folder, validity: box.validity, lastUid: take.length ? take[take.length - 1] : last, messages, sentFolder: folder === 'sent' ? name : '' });
      added += r?.added || 0;
      if (count <= 0 || budget <= 0) { if (folder === 'inbox') more = true; break; }
    }
  } finally { await imap.logout(); }
  return { more, added };
}

/** Logs in to the incoming server (and the sending one when set) without changing anything; finds the Sent folder. */
export async function testAccount(deps: Deps, s: { imapHost: string; imapPort: number; imapSecurity: 'ssl' | 'starttls'; smtpHost: string; smtpPort: number; username: string; password: string; sentFolder?: string }) {
  const imap = await Imap.open(deps.connect, { host: s.imapHost, port: s.imapPort, security: s.imapSecurity, username: s.username, password: s.password });
  let sentFolder = s.sentFolder || '';
  try { if (!sentFolder) sentFolder = await imap.findSent(); await imap.examine('INBOX'); } finally { await imap.logout(); }
  if (s.smtpHost) { const smtp = await Smtp.open(deps.connect, { host: s.smtpHost, port: s.smtpPort, username: s.username, password: s.password }); await smtp.quit(); }
  return { sentFolder };
}

export type SendRequest = {
  accountId: string; to: Address[]; cc?: Address[]; subject: string; text: string; replyToId?: string; inReplyTo?: string; references?: string;
  attachments?: { path: string; name: string; mime: string; size: number }[];
};
type Credentials = { id: string; address: string; displayName: string; provider: string; imapHost: string; imapPort: number; imapSecurity: 'ssl' | 'starttls'; smtpHost: string; smtpPort: number; username: string; password: string; sentFolder: string; canSend: boolean };

/** Sends from a mailbox the person may send from, keeps a copy in its Sent folder, and records it in the section. */
export async function sendMail(deps: Deps, req: SendRequest) {
  const c = await deps.rpc<Credentials>('credentials', { accountId: req.accountId });
  if (!c.canSend) throw new MailError('auth', 'لا تملك صلاحية الإرسال من هذا البريد.');
  if (!c.smtpHost) throw new MailError('protocol', 'لم يُضبط خادم الإرسال لهذا البريد.');
  const to = req.to.filter(a => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(a.address)), cc = (req.cc || []).filter(a => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(a.address));
  if (!to.length) throw new MailError('protocol', 'اكتب عنوان المستلم.');
  if (to.length + cc.length > 50) throw new MailError('protocol', 'عدد المستلمين كبير.');
  if (req.attachments?.length) await deps.rpc('check_paths', { accountId: c.id, paths: req.attachments.map(a => a.path) });
  const files = [];
  for (const a of req.attachments || []) {
    files.push({ name: a.name, mime: a.mime || 'application/octet-stream', data: await deps.download(a.path) });
  }
  if (files.reduce((t, f) => t + f.data.length, 0) > 20 * 1024 * 1024) throw new MailError('protocol', 'مجموع المرفقات يتجاوز 20 ميجابايت.');
  const messageId = `<${crypto.randomUUID()}@${c.address.split('@')[1]}>`;
  const html = textToHtml(req.text);
  const raw = buildMessage({ from: { name: c.displayName, address: c.address }, to, cc, subject: req.subject, text: req.text, html, messageId, inReplyTo: req.inReplyTo, references: req.references, attachments: files });
  const smtp = await Smtp.open(deps.connect, { host: c.smtpHost, port: c.smtpPort, username: c.username, password: c.password });
  try { await smtp.send(c.address, [...to, ...cc].map(a => a.address), raw); } finally { await smtp.quit(); }
  // Gmail files sent mail itself; other servers need the copy put in Sent. A failure here does not undo the sending.
  if (c.provider !== 'gmail') {
    try {
      const imap = await Imap.open(deps.connect, { host: c.imapHost, port: c.imapPort, security: c.imapSecurity, username: c.username, password: c.password });
      try { const folder = c.sentFolder || await imap.findSent(); if (folder) await imap.append(folder, raw); } finally { await imap.logout(); }
    } catch { /* the message went out; only the server copy is missing */ }
  }
  return deps.rpc('record_sent', {
    accountId: c.id, replyToId: req.replyToId || '',
    message: { messageId, inReplyTo: req.inReplyTo || '', to, cc, subject: req.subject, text: req.text, html, snippet: req.text.replace(/\s+/g, ' ').slice(0, 240), size: raw.length,
      attachments: (req.attachments || []).map(a => ({ name: a.name, size: a.size, mime: a.mime, path: a.path })) },
  });
}

export type Storage = { signUpload: (path: string) => Promise<string>; signDownload: (path: string, name: string) => Promise<string> };
export const ACTIONS = ['sync', 'test', 'save', 'send', 'upload', 'attachment'];
type Body = Record<string, unknown> & { action: string; account?: Record<string, unknown>; password?: string; message?: SendRequest };
const fromDb = (e: unknown) => (e as { db?: boolean }).db ? { status: (e as { code?: string }).code === '28000' ? 401 : 403, data: { error: (e as Error).message, code: (e as { code?: string }).code } } : null;
const failed = (e: unknown, status = 500) => fromDb(e) || { status, data: { error: friendlyError(e) } };

/** One request from the app. `deps.rpc` must mark database errors with `db: true`. */
export async function handle(deps: Deps & Storage, body: Body): Promise<{ status: number; data: unknown }> {
  switch (body.action) {
    case 'sync': {
      // Mailboxes this person can read that are due; each is fetched and released even when it fails.
      let due: DueAccount[];
      try { due = await deps.rpc<DueAccount[]>('due', { force: !!body.force, accountId: body.accountId || '' }); } catch (e) { return failed(e); }
      let more = false, added = 0; const errors: { address: string; error: string }[] = [];
      for (const acc of due) {
        try { const r = await syncAccount(deps, acc); more ||= r.more; added += r.added; await deps.rpc('done', { accountId: acc.id, more: r.more }); }
        catch (e) { const msg = friendlyError(e); errors.push({ address: acc.address, error: msg }); await deps.rpc('done', { accountId: acc.id, error: msg }).catch(() => {}); }
      }
      return { status: 200, data: { synced: due.length, added, more, errors } };
    }
    case 'test':
    case 'save': {
      const a = body.account || {};
      let password = String(body.password || '');
      if (!password && a.id) { try { password = (await deps.rpc<{ password: string }>('credentials', { accountId: a.id })).password || ''; } catch (e) { return failed(e); } }
      if (!password) return { status: 400, data: { error: 'اكتب كلمة مرور البريد أو كلمة مرور التطبيقات.' } };
      let found: { sentFolder: string };
      try {
        found = await testAccount(deps, { imapHost: String(a.imapHost || ''), imapPort: Number(a.imapPort) || 993, imapSecurity: a.imapSecurity === 'starttls' ? 'starttls' : 'ssl',
          smtpHost: String(a.smtpHost || ''), smtpPort: Number(a.smtpPort) || 465, username: String(a.username || ''), password, sentFolder: String(a.sentFolder || '') });
      } catch (e) { return failed(e, 422); }
      if (body.action === 'test') return { status: 200, data: { ok: true, sentFolder: found.sentFolder } };
      try { return { status: 200, data: await deps.rpc('save_account', { account: { ...a, sentFolder: a.sentFolder || found.sentFolder }, password: body.password || '' }) }; }
      catch (e) { return failed(e); }
    }
    case 'send':
      try { return { status: 200, data: await sendMail(deps, body.message as SendRequest) }; } catch (e) { return failed(e, e instanceof MailError ? 422 : 500); }
    case 'upload':
      try {
        const r = await deps.rpc<{ path: string }>('upload_path', { accountId: body.accountId, name: body.name, size: body.size });
        return { status: 200, data: { path: r.path, token: await deps.signUpload(r.path) } };
      } catch (e) { return failed(e); }
    case 'attachment':
      try {
        const r = await deps.rpc<{ path: string; name: string }>('attachment', { messageId: body.messageId, index: body.index });
        return { status: 200, data: { url: await deps.signDownload(r.path, r.name), name: r.name } };
      } catch (e) { return failed(e); }
  }
  return { status: 400, data: { error: 'Unsupported' } };
}
