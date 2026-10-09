import { backend, loadBackend } from './supabase-client';

export type LocalUser = { id: string; username: string; role: 'owner' | 'editor'; mustChangePassword: boolean };
const storageKey = 'mawatheeq.local-session.v1';
export const sessionEvent = 'mawatheeq-session-changed';
let token = '';

function announce() { window.dispatchEvent(new Event(sessionEvent)); }
function saveToken(value: string) {
  token = value;
  if (value) localStorage.setItem(storageKey, value); else localStorage.removeItem(storageKey);
  announce();
}
async function sessionRequest<T = any>(endpoint: string, action: string, data: Record<string, unknown> = {}): Promise<T> {
  await loadBackend();
  const current = token || localStorage.getItem(storageKey) || '';
  if (!current) throw new Error('يرجى تسجيل الدخول أولاً.');
  const { data: result, error } = await backend().rpc(endpoint, { p_token: current, p_action: action, p_data: data });
  if (error) {
    if (error.code === '28000' && current === (localStorage.getItem(storageKey) || '')) saveToken('');
    throw new Error(error.message);
  }
  return result as T;
}
export const localRequest = <T = any>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_local_request', action, data);
export const clientRequest = <T = any>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_client_request', action, data);
export const officeRequest = <T = any>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_office_request', action, data);
export const departmentRequest = <T = any>(action: string, data: Record<string, unknown> = {}) => sessionRequest<T>('mawatheeq_department_request', action, data);
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
  try { if (token || localStorage.getItem(storageKey)) await localRequest('logout'); }
  finally { saveToken(''); }
}
export async function changePassword(currentPassword: string, newPassword: string): Promise<LocalUser> {
  return localRequest<LocalUser>('password', { currentPassword, newPassword });
}
export async function fileRequest(action: 'upload' | 'download' | 'cleanup', data: Record<string, unknown>) {
  await loadBackend();
  const current = token || localStorage.getItem(storageKey) || '';
  const { data: result, error } = await backend().functions.invoke('local-files', { body: { action, sessionToken: current, ...data } });
  if (error || result?.error) throw new Error(result?.error || 'تعذر الوصول إلى ملف PDF.');
  return result as { path: string; token?: string; url?: string };
}
