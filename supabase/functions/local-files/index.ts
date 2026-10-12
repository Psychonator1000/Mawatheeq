import { createClient } from '@supabase/supabase-js';

const cors = {
  'Access-Control-Allow-Origin': 'https://psychonator1000.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// JWT verification is disabled because this endpoint verifies the application's
// opaque username session in Postgres before every privileged storage action.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const origin = req.headers.get('origin');
  if (origin && origin !== cors['Access-Control-Allow-Origin']) return reply({ error: 'Origin not allowed' }, 403);
  try {
    const text = await req.text();
    if (text.length > 4096) return reply({ error: 'Request too large' }, 413);
    const body = JSON.parse(text);
    if (!['upload', 'download', 'cleanup', 'chat_upload', 'chat_download'].includes(body.action) || !/^[a-f0-9]{64}$/.test(body.sessionToken || '')) return reply({ error: 'سجل الدخول أولاً.' }, 401);
    const secrets = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    const key = secrets.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!key) return reply({ error: 'Storage is not configured' }, 503);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // Chat attachments: the chat request checks membership, size and type, and returns the only path this session may use.
    if (body.action === 'chat_upload' || body.action === 'chat_download') {
      const upload = body.action === 'chat_upload';
      const { data: access, error: denied } = await admin.rpc('mawatheeq_chat_request', {
        p_token: body.sessionToken, p_action: upload ? 'file_upload' : 'file_download',
        p_data: upload ? { conversationId: body.conversationId, name: body.name, size: body.size, mime: body.mime } : { path: body.path },
      });
      if (denied || !access?.path) return reply({ error: denied?.message || 'لا تملك صلاحية الوصول إلى الملف.' }, 403);
      const chat = admin.storage.from('mawatheeq-chat');
      if (upload) {
        const { data, error } = await chat.createSignedUploadUrl(access.path, { upsert: false });
        if (error) throw error;
        return reply({ path: access.path, token: data.token });
      }
      const { data, error } = await chat.createSignedUrl(access.path, 60, body.download ? { download: String(body.name || true) } : undefined);
      if (error) throw error;
      return reply({ path: access.path, url: data.signedUrl });
    }
    const { data: access, error: denied } = await admin.rpc('mawatheeq_local_request', {
      p_token: body.sessionToken, p_action: 'file_' + body.action,
      p_data: body.action === 'cleanup' ? { path: body.path } : { id: body.id },
    });
    if (denied || !access?.path) return reply({ error: denied?.message || 'لا تملك صلاحية الوصول إلى الملف.' }, 403);
    const bucket = admin.storage.from('mawatheeq-documents');
    if (body.action === 'upload') {
      const { data, error } = await bucket.createSignedUploadUrl(access.path, { upsert: false });
      if (error) throw error;
      return reply({ path: access.path, token: data.token });
    }
    if (body.action === 'download') {
      const { data, error } = await bucket.createSignedUrl(access.path, 60);
      if (error) throw error;
      return reply({ path: access.path, url: data.signedUrl });
    }
    const { error } = await bucket.remove([access.path]);
    if (error) throw error;
    return reply({ path: access.path });
  } catch { return reply({ error: 'تعذر معالجة الملف.' }, 400); }
});
