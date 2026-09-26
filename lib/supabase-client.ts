import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assetUrl } from './asset-url';

let client: SupabaseClient | undefined;
let initializing: Promise<SupabaseClient> | undefined;

export function loadBackend(): Promise<SupabaseClient> {
  if (client) return Promise.resolve(client);
  if (!initializing) initializing = (async () => {
    const response = await fetch(assetUrl('/app-config.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error('تعذر تحميل إعدادات مساحة العمل.');
    const config = await response.json() as { supabaseUrl?: unknown; supabasePublishableKey?: unknown };
    if (typeof config.supabaseUrl !== 'string' || !config.supabaseUrl || typeof config.supabasePublishableKey !== 'string' || !config.supabasePublishableKey) {
      throw new Error('لم تُفعّل مساحة العمل المشتركة بعد. يرجى التواصل مع مسؤول المكتب.');
    }
    if (new URL(config.supabaseUrl).protocol !== 'https:' || !config.supabasePublishableKey.startsWith('sb_publishable_')) {
      throw new Error('إعدادات الاتصال تحتاج مراجعة مسؤول المكتب.');
    }
    client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return client;
  })().catch(error => { initializing = undefined; throw error; });
  return initializing;
}

export function backend(): SupabaseClient {
  if (!client) throw new Error('يرجى تسجيل الدخول أولاً.');
  return client;
}
