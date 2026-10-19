// Minimal IMAP and SMTP clients and a MIME message builder. They run over any byte stream (`Conn`), so the edge function
// gives them TLS sockets and the tests give them plain sockets to synthetic servers.

export type Conn = {
  read(): Promise<Uint8Array | null>;
  write(data: Uint8Array): Promise<void>;
  close(): void;
  /** Upgrades the stream to TLS after STARTTLS; absent where the transport cannot. */
  startTls?: () => Promise<Conn>;
  /** False on an unencrypted stream; passwords are never sent over one. */
  secure?: boolean;
};
export type Connect = (host: string, port: number, tls: boolean) => Promise<Conn>;
export type Address = { name?: string; address: string };

const enc = new TextEncoder();
const dec = new TextDecoder();
const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s; };

export class MailError extends Error {
  kind: 'auth' | 'connect' | 'protocol' | 'timeout';
  constructor(kind: MailError['kind'], message: string) { super(message); this.kind = kind; }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<T>((_, reject) => { t = setTimeout(() => reject(new MailError('timeout', what)), ms); })]).finally(() => clearTimeout(t));
}

/** Buffered reader: CRLF lines and exact byte counts (IMAP literals). */
class Reader {
  private buf = new Uint8Array(0);
  conn: Conn;
  timeout: number;
  constructor(conn: Conn, timeout: number) { this.conn = conn; this.timeout = timeout; }
  private async more() {
    const chunk = await withTimeout(this.conn.read(), this.timeout, 'انتهت مهلة الرد من خادم البريد.');
    if (!chunk) throw new MailError('connect', 'أغلق خادم البريد الاتصال.');
    const next = new Uint8Array(this.buf.length + chunk.length); next.set(this.buf); next.set(chunk, this.buf.length); this.buf = next;
  }
  async line(): Promise<string> {
    for (;;) {
      for (let i = 0; i + 1 < this.buf.length; i++) if (this.buf[i] === 13 && this.buf[i + 1] === 10) {
        const out = this.buf.subarray(0, i); this.buf = this.buf.slice(i + 2); return dec.decode(out);
      }
      await this.more();
    }
  }
  async bytes(n: number): Promise<Uint8Array> {
    while (this.buf.length < n) await this.more();
    const out = this.buf.slice(0, n); this.buf = this.buf.slice(n); return out;
  }
  /** Drops anything buffered, for the switch to TLS. */
  reset(conn: Conn) { this.conn = conn; this.buf = new Uint8Array(0); }
}

export type ImapLine = { text: string; literals: Uint8Array[] };
const quote = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

export class Imap {
  private conn: Conn;
  private reader: Reader;
  private tag = 0;
  capabilities: string[] = [];
  private constructor(conn: Conn, timeout: number) { this.conn = conn; this.reader = new Reader(conn, timeout); }

  static async open(connect: Connect, o: { host: string; port: number; security: 'ssl' | 'starttls'; username: string; password: string; timeout?: number }) {
    let conn: Conn;
    try { conn = await withTimeout(connect(o.host, o.port, o.security === 'ssl'), o.timeout ?? 20000, 'انتهت مهلة الاتصال بخادم البريد.'); }
    catch (e) { throw e instanceof MailError ? e : new MailError('connect', `تعذر الاتصال بخادم البريد ${o.host}:${o.port}.`); }
    const c = new Imap(conn, o.timeout ?? 20000);
    const hello = await c.reader.line();
    if (!/^\* (OK|PREAUTH)/i.test(hello)) { conn.close(); throw new MailError('protocol', 'خادم البريد لا يقبل الاتصال.'); }
    if (o.security === 'starttls') {
      await c.command('STARTTLS');
      if (!conn.startTls) throw new MailError('connect', 'تعذر تشفير الاتصال (STARTTLS).');
      c.conn = await conn.startTls(); c.reader.reset(c.conn);
    }
    if (c.conn.secure === false) { c.close(); throw new MailError('connect', 'الاتصال بخادم البريد غير مشفر؛ استخدم SSL أو STARTTLS.'); }
    try { await c.command(`LOGIN ${quote(o.username)} ${quote(o.password)}`); }
    catch (e) { c.close(); throw e instanceof MailError && e.kind === 'protocol' ? new MailError('auth', 'رفض خادم البريد اسم المستخدم أو كلمة المرور.') : e; }
    return c;
  }

  /** Sends a command and collects untagged responses until its tagged completion. */
  async command(cmd: string, literal?: Uint8Array): Promise<ImapLine[]> {
    const tag = 'm' + (++this.tag);
    await this.conn.write(enc.encode(`${tag} ${cmd}\r\n`));
    const out: ImapLine[] = [];
    for (;;) {
      let text = await this.reader.line();
      if (text.startsWith('+')) {
        if (!literal) throw new MailError('protocol', 'رد غير متوقع من خادم البريد.');
        await this.conn.write(literal); await this.conn.write(enc.encode('\r\n')); literal = undefined; continue;
      }
      if (text.startsWith(tag + ' ')) {
        if (!/^\S+ OK/i.test(text)) throw new MailError('protocol', text.slice(tag.length + 1, 200));
        return out;
      }
      const literals: Uint8Array[] = [];
      let m: RegExpMatchArray | null;
      while ((m = text.match(/\{(\d+)\}$/))) {
        literals.push(await this.reader.bytes(Number(m[1])));
        text = text.slice(0, -m[0].length) + '\u0000' + await this.reader.line();
      }
      out.push({ text, literals });
    }
  }

  /** The Sent folder: the \Sent special-use flag, else a common name. */
  async findSent(): Promise<string> {
    const lines = await this.command('LIST "" "*"');
    const names = lines.map(l => {
      const m = l.text.match(/^\* LIST \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) (.+)$/i);
      if (!m) return null;
      let name = m[2].trim();
      if (name === '\u0000') name = dec.decode(l.literals[0]);
      else if (name.startsWith('"')) name = name.slice(1, -1).replace(/\\(.)/g, '$1');
      return { flags: m[1].toLowerCase(), name };
    }).filter((x): x is { flags: string; name: string } => !!x);
    const flagged = names.find(n => /\\sent\b/.test(n.flags));
    if (flagged) return flagged.name;
    const common = ['Sent', 'Sent Items', 'Sent Messages', 'Sent Mail', '[Gmail]/Sent Mail', 'INBOX.Sent', 'INBOX/Sent', 'Elementos enviados'];
    for (const c of common) { const hit = names.find(n => n.name.toLowerCase() === c.toLowerCase()); if (hit) return hit.name; }
    return '';
  }

  /** Opens a folder read-only (EXAMINE), or read-write (SELECT) to change flags. */
  async examine(folder: string, write = false) {
    const lines = await this.command(`${write ? 'SELECT' : 'EXAMINE'} ${quote(folder)}`);
    let validity = 0, exists = 0, uidNext = 0;
    for (const l of lines) {
      const v = l.text.match(/UIDVALIDITY (\d+)/i); if (v) validity = Number(v[1]);
      const n = l.text.match(/UIDNEXT (\d+)/i); if (n) uidNext = Number(n[1]);
      const e = l.text.match(/^\* (\d+) EXISTS/i); if (e) exists = Number(e[1]);
    }
    return { validity, exists, uidNext };
  }

  async search(criteria: string): Promise<number[]> {
    const lines = await this.command('UID SEARCH ' + criteria);
    const out: number[] = [];
    for (const l of lines) if (/^\* SEARCH/i.test(l.text)) for (const x of l.text.slice(8).trim().split(/\s+/)) if (/^\d+$/.test(x)) out.push(Number(x));
    return [...new Set(out)].sort((a, b) => a - b);
  }

  async sizes(uids: number[]): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    if (!uids.length) return out;
    for (const l of await this.command(`UID FETCH ${uids.join(',')} (UID RFC822.SIZE)`)) {
      const u = l.text.match(/UID (\d+)/i), s = l.text.match(/RFC822\.SIZE (\d+)/i);
      if (u && s) out.set(Number(u[1]), Number(s[1]));
    }
    return out;
  }

  /** Whole messages (or headers only), without marking them read. */
  async fetch(uids: number[], headersOnly = false): Promise<Map<number, Uint8Array>> {
    const out = new Map<number, Uint8Array>();
    if (!uids.length) return out;
    for (const l of await this.command(`UID FETCH ${uids.join(',')} (UID BODY.PEEK[${headersOnly ? 'HEADER' : ''}])`)) {
      const u = l.text.match(/UID (\d+)/i);
      if (u && l.literals.length) out.set(Number(u[1]), l.literals[l.literals.length - 1]);
    }
    return out;
  }

  /** Marks messages read or unread on the server. */
  async setSeen(uids: number[], seen: boolean) {
    for (let i = 0; i < uids.length; i += 200) await this.command(`UID STORE ${uids.slice(i, i + 200).join(',')} ${seen ? '+' : '-'}FLAGS.SILENT (\\Seen)`);
  }

  async append(folder: string, raw: Uint8Array) { await this.command(`APPEND ${quote(folder)} (\\Seen) {${raw.length}}`, raw); }

  async logout() { try { await this.command('LOGOUT'); } catch { /* closing anyway */ } this.close(); }
  close() { try { this.conn.close(); } catch { /* already closed */ } }
}

/** IMAP SEARCH date: 05-Oct-2026. */
export function imapDate(d: Date) {
  return `${String(d.getUTCDate()).padStart(2, '0')}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

export class Smtp {
  private conn: Conn;
  private reader: Reader;
  private constructor(conn: Conn, timeout: number) { this.conn = conn; this.reader = new Reader(conn, timeout); }

  private async reply(): Promise<{ code: number; text: string }> {
    let text = '';
    for (;;) {
      const line = await this.reader.line();
      text += line.slice(4) + '\n';
      if (!/^\d{3}-/.test(line)) return { code: Number(line.slice(0, 3)), text };
    }
  }
  private async cmd(line: string, expect: number[], hide = false): Promise<string> {
    await this.conn.write(enc.encode(line + '\r\n'));
    const r = await this.reply();
    if (!expect.includes(r.code)) throw new MailError(r.code === 535 || r.code === 534 ? 'auth' : 'protocol', (hide ? '' : line.split(' ')[0] + ': ') + r.code + ' ' + r.text.trim().slice(0, 200));
    return r.text;
  }

  static async open(connect: Connect, o: { host: string; port: number; username: string; password: string; timeout?: number; hostname?: string }) {
    if (o.port === 25 || o.port === 587) throw new MailError('connect', `المنفذ ${o.port} غير مسموح للإرسال من الخادم. استخدم المنفذ 465 (SSL).`);
    let conn: Conn;
    try { conn = await withTimeout(connect(o.host, o.port, o.port === 465), o.timeout ?? 20000, 'انتهت مهلة الاتصال بخادم الإرسال.'); }
    catch (e) { throw e instanceof MailError ? e : new MailError('connect', `تعذر الاتصال بخادم الإرسال ${o.host}:${o.port}.`); }
    const s = new Smtp(conn, o.timeout ?? 20000);
    const hello = await s.reply();
    if (hello.code !== 220) { conn.close(); throw new MailError('protocol', 'خادم الإرسال لا يقبل الاتصال.'); }
    const me = o.hostname || 'mawatheeq.local';
    let caps = await s.cmd('EHLO ' + me, [250]);
    if (o.port !== 465 && /STARTTLS/i.test(caps) && conn.startTls) {
      await s.cmd('STARTTLS', [220]); s.conn = await conn.startTls(); s.reader.reset(s.conn);
      caps = await s.cmd('EHLO ' + me, [250]);
    }
    if (s.conn.secure === false) { s.close(); throw new MailError('connect', 'خادم الإرسال لا يدعم التشفير؛ استخدم المنفذ 465 (SSL).'); }
    const plain = btoa(latin1(enc.encode('\u0000' + o.username + '\u0000' + o.password)));
    try {
      if (/AUTH[ =][^\n]*PLAIN/i.test(caps) || !/AUTH[ =][^\n]*LOGIN/i.test(caps)) await s.cmd('AUTH PLAIN ' + plain, [235], true);
      else { await s.cmd('AUTH LOGIN', [334]); await s.cmd(btoa(latin1(enc.encode(o.username))), [334], true); await s.cmd(btoa(latin1(enc.encode(o.password))), [235], true); }
    } catch (e) { s.close(); throw e instanceof MailError && e.kind !== 'timeout' ? new MailError('auth', 'رفض خادم الإرسال اسم المستخدم أو كلمة المرور.') : e; }
    return s;
  }

  async send(from: string, recipients: string[], raw: Uint8Array) {
    await this.cmd(`MAIL FROM:<${from}>`, [250]);
    for (const r of recipients) await this.cmd(`RCPT TO:<${r}>`, [250, 251]);
    await this.cmd('DATA', [354]);
    // Dot-stuffing: a line starting with "." gets another.
    const text = latin1(raw).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    const bytes = new Uint8Array(text.length); for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    await this.conn.write(bytes);
    await this.cmd((text.endsWith('\r\n') ? '' : '\r\n') + '.', [250]);
  }
  async quit() { try { await this.cmd('QUIT', [221]); } catch { /* closing anyway */ } this.close(); }
  close() { try { this.conn.close(); } catch { /* already closed */ } }
}

// ---- MIME ----
export function base64(bytes: Uint8Array): string { return btoa(latin1(bytes)); }
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');
/** RFC 2047 encoded words for non-ASCII header text, split on whole characters. */
export function encodeWord(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const parts: string[] = []; let cur = '';
  for (const ch of s) { if (enc.encode(cur + ch).length > 45) { parts.push(cur); cur = ''; } cur += ch; }
  if (cur) parts.push(cur);
  return parts.map(p => `=?UTF-8?B?${base64(enc.encode(p))}?=`).join('\r\n ');
}
export const formatAddress = (a: Address) => a.name ? `${/^[\w .-]*$/.test(a.name) ? `"${a.name}"` : encodeWord(a.name)} <${a.address}>` : a.address;
const boundary = () => '=_mw_' + crypto.randomUUID().replace(/-/g, '');

export type OutgoingMessage = {
  from: Address; to: Address[]; cc?: Address[]; subject: string; text: string; html?: string;
  messageId: string; inReplyTo?: string; references?: string; date?: Date;
  attachments?: { name: string; mime: string; data: Uint8Array }[];
};
// Message ids that came from the browser: anything else is dropped so no header can be smuggled in.
const ids = (v?: string) => v && /^<[^<>\s]+>( <[^<>\s]+>)*$/.test(v) && v.length <= 4000 ? v : '';
const mimeType = (v: string) => /^[\w.+-]+\/[\w.+-]+$/.test(v) ? v : 'application/octet-stream';
export function buildMessage(m: OutgoingMessage): Uint8Array {
  m = { ...m, inReplyTo: ids(m.inReplyTo), references: ids(m.references) };
  const h = [
    'From: ' + formatAddress(m.from),
    'To: ' + m.to.map(formatAddress).join(', '),
    ...(m.cc?.length ? ['Cc: ' + m.cc.map(formatAddress).join(', ')] : []),
    'Subject: ' + encodeWord(m.subject),
    'Date: ' + (m.date || new Date()).toUTCString().replace('GMT', '+0000'),
    'Message-ID: ' + m.messageId,
    ...(m.inReplyTo ? ['In-Reply-To: ' + m.inReplyTo] : []),
    ...(m.references || m.inReplyTo ? ['References: ' + (m.references || m.inReplyTo)] : []),
    'MIME-Version: 1.0',
  ];
  const part = (type: string, body: string) => `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(base64(enc.encode(body)))}`;
  const alt = boundary();
  let body = m.html
    ? `Content-Type: multipart/alternative; boundary="${alt}"\r\n\r\n--${alt}\r\n${part('text/plain', m.text)}--${alt}\r\n${part('text/html', m.html)}--${alt}--\r\n`
    : part('text/plain', m.text);
  if (m.attachments?.length) {
    const mix = boundary();
    body = `Content-Type: multipart/mixed; boundary="${mix}"\r\n\r\n--${mix}\r\n${body}` + m.attachments.map(a => {
      const ascii = /^[\x20-\x7e]*$/.test(a.name) && !/["\\]/.test(a.name);
      const disp = ascii ? `filename="${a.name}"` : `filename*=UTF-8''${encodeURIComponent(a.name)}`;
      return `--${mix}\r\nContent-Type: ${mimeType(a.mime || '')}; name="${ascii ? a.name : encodeWord(a.name)}"\r\nContent-Disposition: attachment; ${disp}\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(base64(a.data))}`;
    }).join('') + `--${mix}--\r\n`;
  }
  return enc.encode(h.join('\r\n') + '\r\n' + body);
}

/** Plain text written in the app as a right-to-left HTML part. */
export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><body><div dir="auto" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.7;white-space:pre-wrap">${esc}</div></body></html>`;
}
