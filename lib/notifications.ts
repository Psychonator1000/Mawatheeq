import type { CaseRecord, caseState } from './domain';
import type { WorkItem } from './office';

export type NoticeTone = 'danger' | 'warning' | 'info';
export type Notice = { id: string; tone: NoticeTone; title: string; detail: string; view: string; caseId?: string; workId?: string; mentionId?: number };
type MentionFeed = { items: { id: number; targetType: 'case' | 'work'; targetId: string; author: string; authorName?: string; body: string }[]; lastRead: number };
type CaseState = Pick<ReturnType<typeof caseState>, 'alert' | 'remaining'>;

const caseLabel = (c: CaseRecord) => c.code || c.autoNumber || c.clientEntityName || c.client || 'قضية';
const toneRank: Record<NoticeTone, number> = { danger: 0, warning: 1, info: 2 };

/** In-app alerts built from records the signed-in user can already see. */
export function buildNotices({ cases, stateOf, work, userId, today, showDeadlines, showWork, mentions }: {
  cases: CaseRecord[]; stateOf: (c: CaseRecord) => CaseState; work: WorkItem[]; userId: string; today: string; showDeadlines: boolean; showWork: boolean; mentions?: MentionFeed | null;
}): Notice[] {
  const notices: Notice[] = [];
  for (const m of mentions?.items || []) {
    if (m.id <= mentions!.lastRead) continue;
    const text = m.body.replace(/\s+/g, ' ').trim();
    notices.push({ id: 'mention-' + m.id, tone: 'warning', mentionId: m.id, view: m.targetType === 'case' ? 'cases' : 'work', caseId: m.targetType === 'case' ? m.targetId : undefined, workId: m.targetType === 'work' ? m.targetId : undefined,
      title: 'أشار إليك ' + (m.authorName || m.author), detail: text.length > 90 ? text.slice(0, 90) + '…' : text });
  }
  const active = cases.filter(c => !c.archived);
  if (showWork) {
    for (const w of work) {
      if (w.assigneeId !== userId || w.status === 'done' || w.status === 'cancelled' || !/^\d{4}-\d{2}-\d{2}$/.test(w.dueDate) || w.dueDate > today) continue;
      const overdue = w.dueDate < today;
      notices.push({
        id: 'work-' + w.id, tone: overdue || w.priority === 'urgent' ? 'danger' : 'warning', view: 'work', workId: w.id, caseId: w.caseId || undefined,
        title: (w.kind === 'hearing' ? 'جلسة' : 'مهمة') + (overdue ? ' متأخرة: ' : ' اليوم: ') + w.title,
        detail: (overdue ? 'كان موعدها ' + w.dueDate : 'موعدها اليوم') + (w.dueTime ? ' · ' + w.dueTime : '') + (w.location ? ' · ' + w.location : ''),
      });
    }
  }
  if (showDeadlines) {
    let expired = 0;
    for (const c of active) {
      const s = stateOf(c);
      if (s.alert === 'انتهت المهلة') expired++;
      else if (s.alert === 'خلال خمسة أيام' && s.remaining !== null)
        notices.push({ id: 'deadline-' + c.id, tone: s.remaining <= 1 ? 'danger' : 'warning', view: 'deadlines', caseId: c.id, title: 'مهلة الطعن تقترب: ' + caseLabel(c), detail: s.remaining === 0 ? 'آخر يوم اليوم' : 'متبقي ' + s.remaining + ' يوم' });
      for (const p of c.procedures || [])
        if (p.followup === today) notices.push({ id: 'followup-' + c.id + '-' + p.id, tone: 'info', view: 'deadlines', caseId: c.id, title: 'متابعة اليوم: ' + caseLabel(c), detail: p.text || 'إجراء مسجل' });
    }
    if (expired) notices.push({ id: 'deadline-expired', tone: 'info', view: 'deadlines', title: expired + ' قضية انتهت مهلة الطعن فيها', detail: 'راجعها في المواعيد والمتابعة' });
  }
  return notices.sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || a.id.localeCompare(b.id));
}

/** The signed-in user's open work, grouped for the overview. */
export function myWork(work: WorkItem[], userId: string, today: string, horizon: string) {
  const mine = work.filter(w => w.assigneeId === userId && w.status !== 'done' && w.status !== 'cancelled' && /^\d{4}-\d{2}-\d{2}$/.test(w.dueDate))
    .sort((a, b) => (a.dueDate + a.dueTime).localeCompare(b.dueDate + b.dueTime) || a.id.localeCompare(b.id));
  return { overdue: mine.filter(w => w.dueDate < today), today: mine.filter(w => w.dueDate === today), upcoming: mine.filter(w => w.dueDate > today && w.dueDate <= horizon) };
}
