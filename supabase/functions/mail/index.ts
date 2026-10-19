import { createClient } from '@supabase/supabase-js';
import PostalMime from 'postal-mime';
import type { Conn } from './protocol.ts';
import { ACTIONS, friendlyError, handle, type Deps, type Parsed, type Storage } from './core.ts';

const cors = {
  'Access-Control-Allow-Origin': 'https://psychonator1000.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function wrap(c: Deno.TcpConn | Deno.TlsConn, host: string): Conn {
  return {
    secure: 'handshake' in c,
    async read() { const buf = new Uint8Array(65536); const n = await c.read(buf); return n === null ? null : buf.subarray(0, n); },
    async write(data) { let off = 0; while (off < data.length) off += await c.write(data.subarray(off)); },
    close() { try { c.close(); } catch { /* closed */ } },
    startTls: 'handshake' in c ? undefined : async () => wrap(await Deno.startTls(c as Deno.TcpConn, { hostname: host }), host),
  };
}

// Mail servers only: nothing inside a private network, and only the usual mail ports.
const PORTS = [143, 993, 465, 587, 2525];
function privateIp(ip: string) {
  const m = ip.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return true;
  const a = Number(m[1]), b = Number(m[2]);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
}
async function connect(host: string, port: number, tls: boolean) {
  const h = host.toLowerCase();
  const refuse = () => { throw new Error('عنوان خادم البريد أو منفذه غير مسموح.'); };
  if (!PORTS.includes(port) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) || /\.(localhost|local|internal|lan|home|arpa)$/.test(h)) refuse();
  if (/^[\d.]+$/.test(h) ? privateIp(h) : (await Deno.resolveDns(h, 'A').catch(() => [] as string[])).some(privateIp)) refuse();
  return wrap(tls ? await Deno.connectTls({ hostname: host, port }) : await Deno.connect({ hostname: host, port }), host);
}

// JWT verification is disabled: like «local-files», every action is checked in Postgres against the app's session token.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const origin = req.headers.get('origin');
  if (origin && origin !== cors['Access-Control-Allow-Origin']) return reply({ error: 'Origin not allowed' }, 403);
  try {
    const text = await req.text();
    if (text.length > 400000) return reply({ error: 'الرسالة كبيرة جداً.' }, 413);
    const body = JSON.parse(text);
    if (!ACTIONS.includes(body.action) || !/^[a-f0-9]{64}$/.test(body.sessionToken || '')) return reply({ error: 'سجل الدخول أولاً.' }, 401);
    const secrets = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    const key = secrets.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!key) return reply({ error: 'Mail is not configured' }, 503);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const bucket = admin.storage.from('mawatheeq-mail');
    const deps: Deps & Storage = {
      connect,
      parse: async raw => await PostalMime.parse(raw) as unknown as Parsed,
      rpc: async (action, data = {}) => {
        const { data: out, error } = await admin.rpc('mawatheeq_mail_service', { p_token: body.sessionToken, p_action: action, p_data: data });
        if (error) throw Object.assign(new Error(error.message), { code: error.code, db: true });
        return out;
      },
      upload: async (path, data, mime) => { const { error } = await bucket.upload(path, data, { contentType: mime, upsert: true }); if (error) throw error; },
      download: async path => { const { data, error } = await bucket.download(path); if (error) throw error; return new Uint8Array(await data.arrayBuffer()); },
      signUpload: async path => { const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: false }); if (error) throw error; return data.token; },
      signDownload: async (path, name) => { const { data, error } = await bucket.createSignedUrl(path, 60, { download: name }); if (error) throw error; return data.signedUrl; },
    };
    const out = await handle(deps, body);
    return reply(out.data, out.status);
  } catch (e) {
    return reply({ error: friendlyError(e) }, 500);
  }
});
