import { useCallback, useEffect, useState } from 'react';
import { attendanceRequest } from './local-auth';
import type { AttAdjustment, AttEmployee, AttLeave, AttPunch, AttendanceSettings } from './attendance';

export type AttContext = { settings: AttendanceSettings; revision: number; today: string; canEdit: boolean; canManageDevices: boolean; isHr: boolean };
export type DeviceKind = 'attendance' | 'access' | 'both';
export type AttDevice = { id: string; name: string; host: string; port: number; location: string; enabled: boolean; kind?: DeviceKind; doorName?: string; unlockSeconds?: number; notes?: string; serial: string | null; info: Record<string, unknown>; status: 'online' | 'offline' | 'unknown'; lastSeen: string | null; lastSync: string | null; lastError: string | null; revision: number; userCount: number; pendingCommands: number };
export type AttDeviceUser = { pin: string; uid: number | null; name: string; role: number; card: string; syncedAt: string; employeeId: string | null };
export type AttCommand = { id: string; deviceId: string; kind: string; payload: Record<string, unknown>; status: 'pending' | 'running' | 'done' | 'failed'; result: Record<string, unknown> | null; error: string | null; requestedBy: string; createdAt: string; finishedAt: string | null };
export type AttBridge = { id: string; name: string; version: string | null; createdAt: string; lastSeen: string | null; revoked: boolean };
export const COMMAND_LABELS: Record<string, string> = { sync_logs: 'مزامنة كاملة للبصمات', fetch_users: 'قراءة مستخدمي الجهاز', read_info: 'قراءة معلومات الجهاز', set_time: 'ضبط ساعة الجهاز', add_user: 'إضافة مستخدم إلى الجهاز', update_user: 'تعديل مستخدم على الجهاز', delete_user: 'حذف مستخدم من الجهاز', unlock_door: 'فتح الباب عن بعد', restart: 'إعادة تشغيل الجهاز', voice_test: 'اختبار الصوت', clear_logs: 'حفظ البصمات ثم مسحها من الجهاز' };
export const DEVICE_KINDS: Record<DeviceKind, string> = { attendance: 'حضور وانصراف فقط', access: 'تحكم بباب فقط', both: 'حضور وتحكم بباب' };
export const COMMAND_STATUS: Record<AttCommand['status'], string> = { pending: 'بانتظار الجسر', running: 'قيد التنفيذ', done: 'تم', failed: 'تعذر' };

let available: Promise<boolean> | null = null;
/** Attendance appears once its migration is applied; until then HR and accounting behave as before. */
export function attendanceAvailable(): Promise<boolean> {
  available ??= attendanceRequest('context').then(() => true, (e: { code?: string }) => {
    if (e?.code !== 'PGRST202' && e?.code !== '42883') available = null;
    return false;
  });
  return available;
}

const monthRange = (month: string) => { const [y, m] = month.split('-').map(Number); return { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` }; };
export type AttMonth = { context: AttContext; employees: AttEmployee[]; punches: AttPunch[]; leaves: AttLeave[]; adjustments: AttAdjustment[] };

/** Everything needed to show a month of attendance and payroll, reloadable after edits. */
export function useAttendanceMonth(month: string) {
  const [data, setData] = useState<AttMonth | null>(null), [error, setError] = useState(''), [version, setVersion] = useState(0), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true; const range = monthRange(month);
    Promise.all([attendanceRequest<AttContext>('context'), attendanceRequest<AttEmployee[]>('employees'), attendanceRequest<AttPunch[]>('punches', range), attendanceRequest<AttLeave[]>('leaves', range), attendanceRequest<AttAdjustment[]>('adjustments', range)])
      .then(([context, employees, punches, leaves, adjustments]) => { if (active) { setData({ context, employees, punches, leaves, adjustments }); setError(''); } })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, version]);
  return { data, error, loading, reload: useCallback(() => setVersion(v => v + 1), []) };
}
/** Office wall clock "YYYY-MM-DDTHH:MM" in the attendance timezone. */
export function officeNow(timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
