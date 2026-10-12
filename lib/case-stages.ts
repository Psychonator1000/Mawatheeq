// Court levels (درجات التقاضي): first instance → appeal → cassation. The case record holds the current level;
// each level the case has left is kept in `stages` exactly as it stood when the case moved on, with its own
// case number, court, judgment and procedures. The server stamps who closed it and when, and only the office
// owner may correct or undo a closed level.
import type { CaseRecord, Procedure } from './domain';

export const LEVELS = ['ابتدائي', 'استئناف', 'تمييز'] as const;
export type Level = typeof LEVELS[number];
/** The judgment type a level ends with. */
export const LEVEL_TYPE: Record<Level, string> = { 'ابتدائي': 'حكم أول درجة', 'استئناف': 'حكم استئناف', 'تمييز': 'حكم تمييز' };
export const LEVEL_TITLE: Record<Level, string> = { 'ابتدائي': 'أول درجة', 'استئناف': 'الاستئناف', 'تمييز': 'التمييز' };
/** Short names for steps and tags. The stored value «ابتدائي» is called «أول درجة» in the office. */
export const LEVEL_LABEL: Record<Level, string> = { 'ابتدائي': 'أول درجة', 'استئناف': 'استئناف', 'تمييز': 'تمييز' };
export const levelLabel = (l: string) => LEVEL_LABEL[l as Level] || l;

export type CaseStage = {
  id: string; level: Level;
  caseNumber: string; autoNumber: string; court: string; lawyer: string; role: string;
  type: string; date: string; outcome: string; ruling: string;
  appealRecorded: string; appealConfirmation: string; absent: string;
  copyDate: string; notificationDate: string; announcementDate: string; originalDate: string;
  procedures: Procedure[];
  /** Who took the case to the next level, and the note entered when moving it. */
  appealedBy: string; movedOn: string; note: string;
  /** Stamped by the server when the level is closed. */
  closedAt?: string; closedBy?: string;
};
export type MoveDetails = { caseNumber: string; autoNumber: string; court: string; appealedBy: string; movedOn: string; note: string };

const s = (v: unknown) => typeof v === 'string' ? v : v == null ? '' : String(v);
export const stagesOf = (c: CaseRecord): CaseStage[] => Array.isArray(c.stages) ? c.stages as CaseStage[] : [];

/** The level the case is at now: recorded when it was moved, otherwise read from its judgment type. */
export function currentLevel(c: CaseRecord): Level {
  if (LEVELS.includes(c.stage as Level)) return c.stage as Level;
  const type = c.type === 'حكم ابتدائي' ? 'حكم أول درجة' : c.type;
  return type === 'حكم تمييز' ? 'تمييز' : type === 'حكم استئناف' ? 'استئناف' : 'ابتدائي';
}
export function nextLevel(c: CaseRecord): Level | null {
  const i = LEVELS.indexOf(currentLevel(c));
  return i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
}
/** Moved to a new level and still waiting for that level's judgment. */
export const awaitingJudgment = (c: CaseRecord) => stagesOf(c).length > 0 && !c.date;

/** Close the current level into the history and open the next one with its own number and court. */
export function moveToNextLevel(c: CaseRecord, d: MoveDetails, id = crypto.randomUUID()): CaseRecord {
  const level = currentLevel(c), next = nextLevel(c);
  if (!next) throw new Error('القضية في التمييز، وهي آخر درجة.');
  const closed: CaseStage = {
    id, level, caseNumber: s(c.caseNumber), autoNumber: s(c.autoNumber), court: s(c.court), lawyer: s(c.lawyer), role: s(c.role),
    type: s(c.type), date: s(c.date), outcome: s(c.outcome), ruling: s(c.ruling),
    appealRecorded: s(c.appealRecorded), appealConfirmation: s(c.appealConfirmation), absent: s(c.absent),
    copyDate: s(c.copyDate), notificationDate: s(c.notificationDate), announcementDate: s(c.announcementDate), originalDate: s(c.originalDate),
    procedures: [...(c.procedures || [])], appealedBy: d.appealedBy, movedOn: d.movedOn, note: d.note.trim(),
  };
  return {
    ...c, stages: [...stagesOf(c), closed], stage: next, type: LEVEL_TYPE[next],
    caseNumber: d.caseNumber.trim(), autoNumber: d.autoNumber.trim(), court: d.court.trim(),
    date: '', outcome: 'غير محدد', ruling: '', procedures: [],
    appealRecorded: '', appealConfirmation: '', noActionConfirmation: '', absent: '',
    copyDate: '', notificationDate: '', announcementDate: '', originalDate: '',
  };
}

/** Owner only: reopen the last closed level, while the new level has no judgment or procedures yet. */
export function canUndoMove(c: CaseRecord) { return stagesOf(c).length > 0 && !c.date && !(c.procedures || []).length && !s(c.ruling); }
export function undoLastMove(c: CaseRecord): CaseRecord {
  const stages = stagesOf(c), last = stages[stages.length - 1];
  if (!last || !canUndoMove(c)) throw new Error('لا يمكن التراجع بعد تسجيل حكم أو إجراءات في الدرجة الجديدة.');
  return {
    ...c, stages: stages.slice(0, -1), stage: last.level, type: last.type, caseNumber: last.caseNumber, autoNumber: last.autoNumber, court: last.court,
    lawyer: last.lawyer || c.lawyer, role: last.role || c.role, date: last.date, outcome: last.outcome, ruling: last.ruling,
    appealRecorded: last.appealRecorded, appealConfirmation: last.appealConfirmation, absent: last.absent,
    copyDate: last.copyDate, notificationDate: last.notificationDate, announcementDate: last.announcementDate, originalDate: last.originalDate,
    procedures: last.procedures,
  };
}

/** Every case number the case has carried, for search and the pinned summary. */
export const allCaseNumbers = (c: CaseRecord) => [...stagesOf(c).map(x => x.caseNumber), s(c.caseNumber)].filter(Boolean);
