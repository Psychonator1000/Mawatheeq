// Synthetic IMAP and SMTP servers on local sockets for the mail tests, and a socket connector for the mail code.
import net from 'node:net';

export async function startFakeMail({ user = 'amal@example.test', password = 'app-pass "x"' } = {}) {
  // ---- fake IMAP ----
  const folders = { INBOX: { validity: 11, msgs: [] }, 'Sent Items': { validity: 22, msgs: [] } };
  let nextUid = { INBOX: 1, 'Sent Items': 1 };
  const add = (folder, raw, date = new Date()) => folders[folder].msgs.push({ uid: nextUid[folder]++, raw: Buffer.from(raw), date, seen: false });
  const imapLog = [];
  const imap = net.createServer(sock => {
    let buf = Buffer.alloc(0), selected = null, pending = null;
    const send = s => sock.write(s);
    sock.write('* OK fake IMAP ready\r\n');
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (pending) {
          if (buf.length < pending.n + 2) return;
          const data = buf.subarray(0, pending.n); buf = buf.subarray(pending.n + 2);
          add(pending.folder, data); send(`${pending.tag} OK APPEND completed\r\n`); pending = null; continue;
        }
        const i = buf.indexOf('\r\n'); if (i < 0) return;
        const line = buf.subarray(0, i).toString('utf8'); buf = buf.subarray(i + 2);
        const [tag, ...rest] = line.split(' '); const cmd = rest.join(' '); imapLog.push(cmd.startsWith('LOGIN') ? 'LOGIN' : cmd);
        let m;
        const un = t => t.replace(/\\(.)/g, '$1');
        if ((m = cmd.match(/^LOGIN "((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)"$/))) send(un(m[1]) === user && un(m[2]) === password ? `${tag} OK LOGIN done\r\n` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
        else if (cmd === 'LIST "" "*"') send(`* LIST (\\HasNoChildren) "/" "INBOX"\r\n* LIST (\\HasNoChildren \\Sent) "/" "Sent Items"\r\n* LIST (\\HasNoChildren) "/" Archive\r\n${tag} OK LIST done\r\n`);
        else if ((m = cmd.match(/^(EXAMINE|SELECT) "(.*)"$/))) { m = [m[0], m[2]]; selected = folders[m[1]]; selected.writable = cmd.startsWith('SELECT'); send(`* ${selected.msgs.length} EXISTS\r\n* OK [UIDVALIDITY ${selected.validity}] ok\r\n* OK [UIDNEXT ${nextUid[m[1]]}] ok\r\n${tag} OK [READ-ONLY] EXAMINE done\r\n`); }
        else if ((m = cmd.match(/^UID SEARCH (.*)$/))) {
          let uids;
          const r = m[1].match(/^UID (\d+):\*$/);
          if (r) { uids = selected.msgs.filter(x => x.uid >= Number(r[1])).map(x => x.uid); if (!uids.length && selected.msgs.length) uids = [selected.msgs.at(-1).uid]; }
          else uids = selected.msgs.map(x => x.uid);
          send(`* SEARCH ${uids.join(' ')}\r\n${tag} OK SEARCH done\r\n`);
        } else if ((m = cmd.match(/^UID FETCH ([\d,]+) \((.*)\)$/))) {
          const want = m[1].split(',').map(Number);
          selected.msgs.forEach((x, k) => {
            if (!want.includes(x.uid)) return;
            if (m[2] === 'UID RFC822.SIZE') send(`* ${k + 1} FETCH (UID ${x.uid} RFC822.SIZE ${x.raw.length})\r\n`);
            else { const body = m[2].includes('HEADER') ? x.raw.subarray(0, x.raw.indexOf('\r\n\r\n') + 4) : x.raw; send(`* ${k + 1} FETCH (UID ${x.uid} BODY[] {${body.length}}\r\n`); sock.write(body); send(')\r\n'); }
          });
          send(`${tag} OK FETCH done\r\n`);
        } else if ((m = cmd.match(/^UID STORE ([\d,]+) ([+-])FLAGS\.SILENT \(\\Seen\)$/))) {
          // Flags change only in a folder opened with SELECT, as on a real server.
          if (!selected?.writable) send(`${tag} NO read-only\r\n`);
          else { const want = m[1].split(',').map(Number); for (const x of selected.msgs) if (want.includes(x.uid)) x.seen = m[2] === '+'; send(`${tag} OK STORE done\r\n`); }
        } else if ((m = cmd.match(/^APPEND "(.*)" \(\\Seen\) \{(\d+)\}$/))) { pending = { tag, folder: m[1], n: Number(m[2]) }; send('+ Ready\r\n'); }
        else if (cmd === 'LOGOUT') { send(`* BYE\r\n${tag} OK LOGOUT\r\n`); sock.end(); }
        else send(`${tag} BAD unknown\r\n`);
      }
    });
  });
  // ---- fake SMTP ----
  const smtpSent = [];
  const smtp = net.createServer(sock => {
    let data = null, mail = null;
    sock.write('220 fake SMTP\r\n');
    let buf = '';
    sock.on('data', d => {
      buf += d.toString('latin1');
      for (;;) {
        if (data !== null) { const end = buf.indexOf('\r\n.\r\n'); if (end < 0) return; data += buf.slice(0, end); buf = buf.slice(end + 5); smtpSent.push({ ...mail, raw: Buffer.from(data.replace(/^\.\./gm, '.'), 'latin1') }); data = null; sock.write('250 queued\r\n'); continue; }
        const i = buf.indexOf('\r\n'); if (i < 0) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (line.startsWith('EHLO')) sock.write('250-fake\r\n250-SIZE 1000000\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (line.startsWith('AUTH PLAIN ')) sock.write(Buffer.from(line.slice(11), 'base64').toString() === '\0' + user + '\0' + password ? '235 ok\r\n' : '535 bad credentials\r\n');
        else if (line.startsWith('MAIL FROM:')) { mail = { from: line.slice(10), to: [] }; sock.write('250 ok\r\n'); }
        else if (line.startsWith('RCPT TO:')) { mail.to.push(line.slice(8)); sock.write('250 ok\r\n'); }
        else if (line === 'DATA') { data = ''; sock.write('354 go\r\n'); }
        else if (line === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('500 what\r\n');
      }
    });
  });
  await new Promise(r => imap.listen(0, '127.0.0.1', r)); await new Promise(r => smtp.listen(0, '127.0.0.1', r));
  const IMAP_PORT = imap.address().port, SMTP_PORT = smtp.address().port;
  const connect = async (host, port) => {
    const sock = net.connect(port, host); await new Promise((r, j) => { sock.once('connect', r); sock.once('error', j); });
    const queue = []; let waiting = null, ended = false;
    sock.on('data', d => { if (waiting) { const w = waiting; waiting = null; w(new Uint8Array(d)); } else queue.push(new Uint8Array(d)); });
    sock.on('end', () => { ended = true; if (waiting) { const w = waiting; waiting = null; w(null); } });
    return { read: () => queue.length ? Promise.resolve(queue.shift()) : ended ? Promise.resolve(null) : new Promise(r => { waiting = r; }), write: d => new Promise(r => sock.write(d, () => r())), close: () => sock.destroy() };
  };


  return { folders, add, imapLog, smtpSent, IMAP_PORT, SMTP_PORT, connect, close: () => { imap.close(); smtp.close(); } };
}
