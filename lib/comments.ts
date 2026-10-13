import { useEffect, useState } from 'react';
import { commentRequest } from './local-auth';
import type { ChatRef } from './chat';

export type CommentTarget = { targetType: 'case' | 'work'; targetId: string };
export type CommentPerson = { id: string; username: string; name?: string };
/** parentId, authorName, names and refs arrive once the replies migration is applied; older servers omit them. */
export type Comment = CommentTarget & { id: number; parentId?: number | null; body: string; deleted: boolean; authorId: string; author: string; authorName?: string; mentions: CommentPerson[]; refs?: ChatRef[]; createdAt: string };
export type MentionFeed = { items: Comment[]; lastRead: number };

let available: Promise<boolean> | null = null;
/** Comments appear only once the backend migration is applied; until then the app behaves as before. */
export function commentsAvailable(): Promise<boolean> {
  available ??= commentRequest<MentionFeed>('mentions').then(() => true, (e: { code?: string }) => {
    if (e?.code !== 'PGRST202' && e?.code !== '42883') available = null; // Retry later on transient errors.
    return false;
  });
  return available;
}
export function useCommentsAvailable(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => { let active = true; void commentsAvailable().then(v => { if (active) setOn(v); }); return () => { active = false; }; }, []);
  return on;
}
export const fetchMentions = () => commentRequest<MentionFeed>('mentions');
