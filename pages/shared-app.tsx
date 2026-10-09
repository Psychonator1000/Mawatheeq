import { useEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, LogOut, RefreshCw } from 'lucide-react';
import WorkspaceHub from '@/components/workspace-hub';
import {workspaceStorageKey} from '@/lib/departments';
import { restoreSession, signIn, signOut, changePassword, localRequest, sessionEvent, type LocalUser } from '@/lib/local-auth';
import type { Permissions } from '@/lib/permissions';

export default function SharedApp() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    async function refresh() {
      const current = ++generation.current;
      try {
        const found = await restoreSession();
        if (active && current === generation.current) setUser(found);
      } catch (reason) {
        if (active && current === generation.current) setError(reason instanceof Error ? reason.message : 'تعذر الاتصال.');
      } finally { if (active && current === generation.current) setReady(true); }
    }
    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener(sessionEvent, onRefresh);
    window.addEventListener('storage', onRefresh);
    window.addEventListener('focus', onRefresh);
    const timer = window.setInterval(onRefresh, 60000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(sessionEvent, onRefresh);
      window.removeEventListener('storage', onRefresh);
      window.removeEventListener('focus', onRefresh);
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const found = await signIn(username, password);
      sessionStorage.removeItem(workspaceStorageKey);
      ++generation.current;
      setUser(found); setReady(true); setPassword('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل الدخول.'); }
    finally { setBusy(false); }
  }
  async function updatePassword(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (newPassword !== confirmPassword) throw new Error('كلمتا المرور الجديدتان غير متطابقتين.');
      const updated = await changePassword(password, newPassword);
      sessionStorage.removeItem(workspaceStorageKey);
      ++generation.current;
      setUser(updated); setChangingPassword(false);
      setPassword(''); setNewPassword(''); setConfirmPassword('');
      setMessage('تم تغيير كلمة المرور وتسجيل خروج الجلسات الأخرى.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تغيير كلمة المرور.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await signOut(); }
    catch { /* The local session is cleared even when the network is unavailable. */ }
    finally {
      ++generation.current;
      sessionStorage.removeItem(workspaceStorageKey);
      setUser(null); setReady(true); setChangingPassword(false); setBusy(false);
      setPassword(''); setNewPassword(''); setConfirmPassword(''); setMessage(''); setError('');
    }
  }

  const passwordRequired = !!user?.mustChangePassword;
  const passwordForm = user && (passwordRequired || changingPassword);
  if (ready && user && !passwordForm) return <>
    <AuthorizedWorkspace key={user.id} owner={user.role==='owner'} />
    <div className="account-bar"><span className="account-email" dir="ltr">{user.username}</span><button className="text-link" onClick={() => { setChangingPassword(true); setMessage(''); setError(''); }}><KeyRound size={15} /> تغيير كلمة المرور</button><button className="text-link" disabled={busy} onClick={() => void logout()}><LogOut size={15} /> خروج</button></div>
    {error && <div className="auth-message error" role="alert">{error}</div>}
  </>;

  return <main className="auth-page"><section className="auth-card">
    <div className="brand-mark">M</div><h1>مواثيق</h1><p>مساحة المكتب المشتركة للأحكام والتنفيذ والمستندات.</p>
    {!ready ? <p role="status">جارٍ فتح مساحة العمل…</p> : passwordForm ? <>
      <h2>تغيير كلمة المرور</h2><p>{passwordRequired ? 'عيّن كلمة مرور خاصة بك لفتح مساحة المكتب.' : 'تُسجّل الجلسات الأخرى خروجها عند تغيير كلمة المرور.'}</p>
      <form onSubmit={updatePassword}>
        <label className="field"><span>كلمة المرور الحالية</span><input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label className="field"><span>كلمة المرور الجديدة</span><input type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={72} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
        <label className="field"><span>تأكيد كلمة المرور الجديدة</span><input type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={72} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
        <p>12 حرفاً على الأقل.</p><button className="btn primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}</button>
      </form>
      <div className="auth-links">{!passwordRequired && <button className="text-link" onClick={() => { setChangingPassword(false); setPassword(''); setNewPassword(''); setConfirmPassword(''); setError(''); }}>العودة إلى المكتب</button>}<button className="text-link" disabled={busy} onClick={() => void logout()}>تسجيل الخروج</button></div>
    </> : <>
      <h2 style={{ marginBottom: 20 }}>تسجيل الدخول</h2>
      <form onSubmit={submit}>
        <label className="field"><span>اسم المستخدم</span><input type="text" dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={32} value={username} onChange={event => setUsername(event.target.value)} /></label>
        <label className="field"><span>كلمة المرور</span><input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button className="btn primary" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'فتح مساحة العمل'}</button>
      </form>
      <p style={{ marginTop: 20 }}>أدخل اسم المستخدم وكلمة المرور الخاصين بالمكتب.</p>
    </>}
    {message && <div className="auth-message" role="status">{message}</div>}
    {error && <div className="auth-message error" role="alert">{error}</div>}
    {error && !ready && <button className="btn" onClick={() => window.location.reload()}><RefreshCw size={16} /> إعادة المحاولة</button>}
  </section></main>;
}

function AuthorizedWorkspace({owner}:{owner:boolean}) {
  const [access,setAccess]=useState<Permissions|null>(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;localRequest<Permissions>('access').then(value=>{if(active)setAccess(value)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
  if(!access)return <main className="auth-page"><section className="auth-card"><h1>مواثيق</h1>{error?<><p role="alert">{error}</p><button className="btn" onClick={()=>location.reload()}>إعادة المحاولة</button></>:<p role="status">جارٍ تحميل صلاحياتك…</p>}</section></main>;
  return <WorkspaceHub access={access} owner={owner}/>;
}
