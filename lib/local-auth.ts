import { backend, loadBackend } from './supabase-client';
import { clearBoot } from './boot-cache';

export type LocalUser = { id: string; username: string; role: 'owner' | 'editor'; mustChangePassword: boolean };
const storageKey = 'mawatheeq.local-session.v1';
// While the owner works inside a staff account, the owner's own session waits here to be restored.
const ownerKey = 'mawatheeq.owner-session.v1';
export const sessionEvent = 'mawatheeq-session-changed';
let token = '';

function announce() { window.dispatchEvent(new Event(sessionEvent)); }
function saveToken(value: string) {
  token = value;
  if (value) localStorage.setItem(storageKey, value); else { localStorage.removeItem(storageKey); clearBoot(); }
  announce();
}
async function sessionRequest<T = unknown>(endpoint: string, action: string, data: Record<string, unknown> = {}): Promise<T> {
  await loadBackend();
  const current = token || localStorage.getItem(storageKey) || '';
  if (!current) throw new Error('يرجى تسجيل الدخول أولاً.');
  const { data: result, error } = await backend().rpc(endpoint, { p_token: current, p_action: action, p_data: data });
  if (error) {
    if (error.code === '28000' && current === (localStorage.getItem(storageKey) || '')) saveToken('');
    throw Object.assign(new Error(error.message), { code: error.code });
  }
  return result as T;
}
export const localRequest = <T = unknown>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_local_request', action, data);
export const clientRequest = <T = unknown>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_client_request', action, data);
export const officeRequest = <T = unknown>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_office_request', action, data);
export const attendanceRequest = <T = unknown>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_attendance_request', action, data);
export const commentRequest =<T = unknown>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_comment_request', action, data);
export const chatRequest = <T = unknown>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_chat_request', action, data);
export const caseFileRequest = <T = unknown>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_case_file_request', action, data);
export const departmentRequest = <T = unknown>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_department_request', action, data);
export const booksRequest = <T = unknown>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_books_request', action, data);
/** The current session token, for edge functions that check it in the database themselves. */
export const sessionToken = () => token || localStorage.getItem(storageKey) || '';
export const mailRequest = <T = unknown>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_mail_request', action, data);
export async function restoreSession(): Promise<LocalUser | null> {
  await loadBackend();
  token = localStorage.getItem(storageKey) || '';
  if (!token) return null;
  try { return await localRequest<LocalUser>('session'); }
  catch (error) { if (!token) return null; throw error; }
}
export async function signIn(username: string, password: string): Promise<LocalUser> {
  await loadBackend();
  const { data, error } = await backend().rpc('mawatheeq_local_login', { p_username: username.trim(), p_password: password });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'تعذر تسجيل الدخول.');
  if (!data?.token || !data?.user) throw new Error('تعذر بدء الجلسة.');
  saveToken(data.token);
  return data.user as LocalUser;
}
export async function signOut(): Promise<void> {
  if (isSwitchedSession()) return returnToOwner();
  try { if (token || localStorage.getItem(storageKey)) await localRequest('logout'); }
  finally { saveToken(''); }
}
export function isSwitchedSession(): boolean {
  try { return !!localStorage.getItem(ownerKey); } catch { return false; }
}
/** Owner only: open a staff account without its password. The owner's session is kept to return to. */
export async function switchToUser(id: string): Promise<LocalUser> {
  const owner = token || localStorage.getItem(storageKey) || '';
  const result = await officeRequest<{ token: string; user: LocalUser }>('switch_user', { id });
  localStorage.setItem(ownerKey, owner);
  saveToken(result.token);
  return result.user;
}
/** Ends the staff session opened by the owner and restores the owner's own session. */
export async function returnToOwner(): Promise<void> {
  const owner = localStorage.getItem(ownerKey) || '';
  try { await localRequest('logout'); } catch { /* The switched session also expires on its own. */ }
  localStorage.removeItem(ownerKey);
  saveToken(owner);
}
export async function changePassword(currentPassword: string, newPassword: string): Promise<LocalUser> {
  return localRequest<LocalUser>('password', { currentPassword, newPassword });
}
export async function fileRequest(action: 'upload' | 'download' | 'cleanup' | 'chat_upload' | 'chat_download' | 'case_upload' | 'case_download' | 'case_delete', data: Record<string, unknown>) {
  await loadBackend();
  const current = token || localStorage.getItem(storageKey) || '';
  const { data: result, error } = await backend().functions.invoke('local-files', { body: { action, sessionToken: current, ...data } });
  if (error || result?.error) throw new Error(result?.error || 'تعذر الوصول إلى ملف PDF.');
  return result as { path: string; token?: string; url?: string };
}
