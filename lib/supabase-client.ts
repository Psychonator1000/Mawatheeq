import type { SupabaseClient } from '@supabase/supabase-js';
import { assetUrl } from './asset-url';

// The app's every request to the database is a plain call (`rpc` below), so the database library itself is not part
// of opening the app: it is fetched only for file uploads, the two server functions and the live channel, once the
// app is up. That library is about a quarter of what a slow computer has to read before the first screen.
type Config = { url: string; key: string };
let config: Promise<Config> | undefined;
let client: Promise<SupabaseClient> | undefined;

function loadConfig(): Promise<Config> {
  return config ??= (async () => {
    const response = await fetch(assetUrl('/app-config.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error('تعذر تحميل إعدادات مساحة العمل.');
    const c = await response.json() as { supabaseUrl?: unknown; supabasePublishableKey?: unknown; office?: unknown };
    // The office server serves the app and its API from the same address on the local network.
    if (c.office === true) c.supabaseUrl = window.location.origin;
    if (typeof c.supabaseUrl !== 'string' || !c.supabaseUrl || typeof c.supabasePublishableKey !== 'string' || !c.supabasePublishableKey) {
      throw new Error('لم تُفعّل مساحة العمل المشتركة بعد. يرجى التواصل مع مسؤول المكتب.');
    }
    if (c.office !== true && (new URL(c.supabaseUrl).protocol !== 'https:' || !c.supabasePublishableKey.startsWith('sb_publishable_'))) {
      throw new Error('إعدادات الاتصال تحتاج مراجعة مسؤول المكتب.');
    }
    return { url: c.supabaseUrl.replace(/\/+$/, ''), key: c.supabasePublishableKey };
  })().catch(error => { config = undefined; throw error; });
}

/** Reads and checks the connection settings (an unusable setup is reported before anything else is tried). */
export const checkConfig = () => loadConfig().then(() => undefined);

export type CallError = { message: string; code?: string };
/** A database function called directly, answering like the database library did: `{ data }` or `{ error }`. */
export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<{ data: T | null; error: CallError | null }> {
  const { url, key } = await loadConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: 'POST', body: JSON.stringify(args),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  } catch (error) { return { data: null, error: { message: (error as Error).message || 'تعذر الاتصال بالخادم.' } }; }
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const e = (body && typeof body === 'object' ? body : {}) as { message?: unknown; code?: unknown };
    return { data: null, error: { message: typeof e.message === 'string' && e.message ? e.message : response.statusText || 'تعذر تنفيذ الطلب.', code: typeof e.code === 'string' ? e.code : undefined } };
  }
  return { data: body as T, error: null };
}

/** The database library, for uploads, the server functions and the live channel; fetched the first time one is used. */
export function loadBackend(): Promise<SupabaseClient> {
  return client ??= (async () => {
    const [{ url, key }, { createClient }] = await Promise.all([loadConfig(), import('@supabase/supabase-js')]);
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  })().catch(error => { client = undefined; throw error; });
}
