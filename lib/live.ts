import type { RealtimeChannel } from '@supabase/supabase-js';
import { loadBackend } from './supabase-client';

/**
 * Live updates: after a change other people should see (a chat message, a file asked for, sent, received or
 * returned, a mention), the app sends one short ping on a shared office channel. Every open copy of the app that
 * hears it refreshes that part at once, fetching through its own permissions; the ping carries only which part
 * changed, never the content. The timed checks stay as the fallback when the channel is unavailable.
 */
export type LiveTopic = 'chat' | 'paper' | 'comments' | 'cases' | 'office';
export const LIVE_EVENT: Record<LiveTopic, string> = { chat: 'mawatheeq-live-chat', paper: 'mawatheeq-paper-files', comments: 'mawatheeq-live-comments', cases: 'mawatheeq-live-cases', office: 'mawatheeq-live-office' };

let channel: RealtimeChannel | null = null, ready = false;
const queued = new Set<LiveTopic>();

export async function startLive() {
  // Automated test browsers run against a stand-in backend, and the office server has no live channel: both keep the timed checks only.
  if (channel || navigator.webdriver) return;
  try {
    const client = await loadBackend();
    if (!/\.supabase\.co$/.test(new URL(String((client as unknown as { supabaseUrl: unknown }).supabaseUrl)).hostname)) return;
    channel = client.channel('mawatheeq-office', { config: { broadcast: { self: false } } });
    channel.on('broadcast', { event: 'changed' }, ({ payload }) => {
      const topic = (payload as { topic?: LiveTopic })?.topic;
      if (topic && topic in LIVE_EVENT) dispatchEvent(new Event(LIVE_EVENT[topic]));
    }).subscribe(status => {
      ready = status === 'SUBSCRIBED';
      if (ready) { for (const t of queued) void send(t); queued.clear(); }
    });
  } catch { channel = null; }
}

async function send(topic: LiveTopic) {
  try { await channel?.send({ type: 'broadcast', event: 'changed', payload: { topic } }); } catch { /* the timed checks still catch up */ }
}

/**
 * How long to wait before the next timed check. While the live channel is connected, changes arrive by ping and the
 * timed check is only a safety net, so it runs rarely; without the channel (the office server, test browsers) the
 * shorter interval keeps things current. A window nobody has used for ten minutes skips its checks until someone
 * comes back to it, which spares the database the work of copies left open on idle screens.
 */
export function pollEvery(fallbackMs: number, liveMs: number) { return ready ? liveMs : fallbackMs; }
const IDLE_MS = 10 * 60 * 1000;
let lastInput = Date.now();
export const userIdle = () => Date.now() - lastInput > IDLE_MS;
if (typeof window !== 'undefined') {
  const seen = () => {
    const wasIdle = userIdle(); lastInput = Date.now();
    // Coming back to an idle window catches up at once, the same way returning to the window does.
    if (wasIdle) window.dispatchEvent(new Event('focus'));
  };
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(type, seen, { passive: true, capture: true });
  let moved = 0;
  window.addEventListener('pointermove', () => { const now = Date.now(); if (now - moved > 5000) { moved = now; seen(); } }, { passive: true });
}

/** Tell everyone else that this part changed; this copy refreshes itself too. */
export function pingLive(topic: LiveTopic) {
  dispatchEvent(new Event(LIVE_EVENT[topic]));
  if (!channel) return;
  if (ready) void send(topic); else queued.add(topic);
}

const READS: Record<string, string[]> = {
  mawatheeq_chat_request: ['summary', 'messages', 'search', 'people', 'file_download', 'conversation', 'read'],
  mawatheeq_comment_request: ['list', 'mentions', 'feed', 'search', 'mentionable'],
};
/** Which part a successful request changed, if others should hear about it. */
const CASE_WRITES = ['save_case', 'import_cases', 'import_register', 'import_roll', 'import_workbook', 'save_rules', 'save_document'];
const OFFICE_READS = ['context', 'access_history', 'work_history', 'case_file'];
export function liveTopicOf(endpoint: string, action: string, data: Record<string, unknown>): LiveTopic | null {
  if (endpoint === 'mawatheeq_local_request') return CASE_WRITES.includes(action) ? 'cases' : null;
  if (endpoint === 'mawatheeq_office_request') return OFFICE_READS.includes(action) || /_page$|_history$|^export/.test(action) ? null : 'office';
  if (endpoint === 'mawatheeq_chat_request') return READS[endpoint].includes(action) ? null : 'chat';
  if (endpoint === 'mawatheeq_comment_request') return READS[endpoint].includes(action) || action === 'mark_mentions_read' ? null : 'comments';
  if (endpoint === 'mawatheeq_department_request' && data.workspace === 'archive')
    return ['records_page', 'people', 'cases_page', 'check_export', 'history', 'desk_mine', 'desk_case', 'desk_journeys', 'log_clears'].includes(action) ? null : 'paper';
  return null;
}
