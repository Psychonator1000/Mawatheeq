// Staff chat: types and helpers shared by the chat panel. All reads and writes go through mawatheeq_chat_request,
// which checks the session, membership and every reference on the server.
export type ChatRefType = 'user' | 'case' | 'client' | 'work';
export type ChatRef = { type: ChatRefType; id: string; label: string; ok?: boolean; sub?: string };
export type ChatFile = { path: string; name: string; size: number; mime: string };
export type ChatMessage = { id: number; kind: 'message' | 'event'; senderId: string; senderName: string; mine: boolean; body: string; deleted: boolean; createdAt: string; editedAt: string | null; editable: boolean; file: ChatFile | null; refs: ChatRef[] };
export type ChatConversation = { id: string; kind: 'direct' | 'group'; title: string; lastAt: string; isMember: boolean; members: { id: string; name: string }[]; last: { body: string; sender: string; mine: boolean; kind: string } | null; unread: number };
export type ChatSummary = { owner: boolean; conversations: ChatConversation[] };
export type ChatPerson = { id: string; name: string; username: string };

export const MAX_FILE = 5 * 1024 * 1024;
export const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.ms-excel'];
export const refToken = (r: Pick<ChatRef, 'type' | 'label'>) => (r.type === 'user' ? '@' : '#') + r.label;

/** A conversation's name for this reader: the group title, or the other person's name. */
export function conversationName(c: ChatConversation, me: string) {
  if (c.kind === 'group') return c.title || 'مجموعة';
  return c.members.filter(m => m.id !== me).map(m => m.name).join('، ') || c.members.map(m => m.name).join('، ') || 'محادثة';
}
/** The reference being typed just before the caret: «#كود» or «@اسم». */
export function typedTrigger(text: string, caret: number): { start: number; char: '#' | '@'; query: string } | null {
  const m = /(^|\s)([#@])([^\s#@]{0,30})$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[3].length - 1, char: m[2] as '#' | '@', query: m[3] } : null;
}
/** Split a message into text and reference chips, in order. */
export function bodyParts(body: string, refs: ChatRef[]): (string | ChatRef)[] {
  let parts: (string | ChatRef)[] = [body];
  for (const r of [...refs].sort((a, b) => b.label.length - a.label.length)) {
    const token = refToken(r); let used = false;
    parts = parts.flatMap(p => { if (typeof p !== 'string' || !p.includes(token)) return [p]; used = true; const bits = p.split(token); return bits.flatMap((b, i) => i ? [r, b] : [b]); });
    if (!used) parts.push(' ', r);
  }
  return parts.filter(p => p !== '');
}
export const fileSize = (n: number) => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
export function chatTime(iso: string) {
  const d = new Date(iso), now = new Date(), sameDay = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat('ar-KW', sameDay ? { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuwait' } : { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuwait' }).format(d);
}
