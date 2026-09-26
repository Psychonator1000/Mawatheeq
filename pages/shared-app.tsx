import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut, Users, RefreshCw } from 'lucide-react';
import Workspace from '@/components/workspace';
import { loadBackend, backend } from '@/lib/supabase-client';

type Member = { user_id: string; email: string; role: string };

function Members({ onClose }: { onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const { data, error } = await backend().rpc('mawatheeq_list_members');
    if (error) setMessage(error.message); else setMembers(data || []);
  }
  useEffect(() => { void refresh(); }, []);
  async function add(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    const { error } = await backend().rpc('mawatheeq_add_member', { p_email: email.trim() });
    if (error) setMessage(error.message); else { setEmail(''); setMessage('تم منح الوصول إلى سجلات المكتب المشتركة.'); await refresh(); }
    setBusy(false);
  }
  async function remove(member: Member) {
    if (!window.confirm(`إلغاء وصول ${member.email} إلى مساحة المكتب؟`)) return;
    setBusy(true);
    const { error } = await backend().rpc('mawatheeq_remove_member', { p_user_id: member.user_id });
    if (error) setMessage(error.message); else await refresh();
    setBusy(false);
  }
  return <div className="member-panel"><section className="auth-card" role="dialog" aria-modal="true" aria-label="أعضاء المكتب">
    <h1>أعضاء المكتب</h1><p>شارك رابط التطبيق، واطلب من الزميل إنشاء حساب وتأكيد بريده. أضف بريده هنا لمنحه الوصول إلى القضايا والمستندات المشتركة.</p>
    <form onSubmit={add}><label className="field"><span>البريد الإلكتروني للزميل</span><input type="email" dir="ltr" required value={email} onChange={event => setEmail(event.target.value)} /></label><button className="btn primary" disabled={busy}>منح الوصول</button></form>
    {message && <div className="auth-message" role="status">{message}</div>}
    {members.map(member => <div className="member-row" key={member.user_id}><span dir="ltr">{member.email}</span><span>{member.role === 'owner' ? 'مسؤول' : 'عضو'}</span>{member.role !== 'owner' && <button className="text-link" disabled={busy} onClick={() => void remove(member)}>إلغاء الوصول</button>}</div>)}
    <button className="btn" style={{ marginTop: 20 }} onClick={onClose}>إغلاق</button>
  </section></div>;
}

export default function SharedApp() {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'password'>('signin');
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const currentUserId = useRef(session?.user.id);
  currentUserId.current = session?.user.id;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void loadBackend().then(async client => {
      if (!active) return;
      const { data: subscription } = client.auth.onAuthStateChange((event, current) => {
        if (!active) return;
        setSession(current);
        if (event === 'PASSWORD_RECOVERY') setMode('password');
        if (event === 'SIGNED_OUT') { setRole(undefined); setShowMembers(false); }
      });
      unsubscribe = () => subscription.subscription.unsubscribe();
      const { data, error: sessionError } = await client.auth.getSession();
      if (!active) return;
      if (sessionError) throw sessionError;
      setSession(data.session); setReady(true);
    }).catch(reason => { if (active) setBootError(reason.message); });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  async function refreshMembership() {
    if (!session) return;
    const { data, error: membershipError } = await backend().from('mawatheeq_members').select('role').eq('user_id', session.user.id).maybeSingle();
    if (currentUserId.current !== session.user.id) return;
    if (membershipError) { setError('تعذر التحقق من صلاحية الوصول. أعد المحاولة.'); setRole(null); }
    else { setError(''); setRole(data?.role || null); }
  }
  useEffect(() => {
    setRole(undefined);
    if (!session) return;
    void refreshMembership();
    const timer = window.setInterval(() => void refreshMembership(), 60000);
    const focus = () => void refreshMembership();
    window.addEventListener('focus', focus);
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [session?.user.id]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const auth = backend().auth;
      const redirect = window.location.origin + window.location.pathname;
      if (mode === 'signin') {
        const result = await auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw new Error('تعذر تسجيل الدخول. راجع البريد وكلمة المرور وتأكيد الحساب.');
      } else if (mode === 'signup') {
        const result = await auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect } });
        if (result.error) throw result.error;
        setMessage('تحقق من بريدك لتأكيد الحساب، ثم اطلب من مسؤول المكتب منحك الوصول.');
      } else if (mode === 'reset') {
        const result = await auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect });
        if (result.error) throw result.error;
        setMessage('إذا كان الحساب مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور.');
      } else {
        const result = await auth.updateUser({ password });
        if (result.error) throw result.error;
        setMode('signin'); setMessage('تم تحديث كلمة المرور.');
      }
      setPassword('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر إتمام العملية.'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    const { error: signOutError } = await backend().auth.signOut();
    if (signOutError) setError(signOutError.message);
    else { setSession(null); setRole(undefined); setShowMembers(false); setMode('signin'); }
  }

  if (ready && session && role && mode !== 'password') return <>
    <Workspace key={session.user.id} />
    <div className="account-bar"><span className="account-email" dir="ltr">{session.user.email}</span>{role === 'owner' && <button className="text-link" onClick={() => setShowMembers(true)}><Users size={15} /> أعضاء المكتب</button>}<button className="text-link" onClick={() => void signOut()}><LogOut size={15} /> خروج</button></div>
    {showMembers && <Members onClose={() => setShowMembers(false)} />}
    {error && <div className="auth-message error" role="alert">{error}</div>}
  </>;

  return <main className="auth-page"><section className="auth-card">
    <div className="brand-mark">M</div><h1>مواثيق</h1><p>مساحة المكتب المشتركة للأحكام والتنفيذ والمستندات.</p>
    {bootError ? <><div className="auth-message error" role="alert">{bootError}</div><button className="btn" onClick={() => window.location.reload()}><RefreshCw /> إعادة المحاولة</button></> : !ready || (session && role === undefined && mode !== 'password') ? <p role="status">جارٍ فتح مساحة العمل…</p> : session && !role && mode !== 'password' ? <>
      <h2>بانتظار منح الوصول</h2><p>أرسل بريد حسابك إلى مسؤول المكتب ليضيفك إلى المساحة المشتركة.</p><p dir="ltr">{session.user.email}</p><div className="auth-links"><button className="btn primary" onClick={() => void refreshMembership()}>تحديث صلاحية الوصول</button><button className="btn" onClick={() => void signOut()}>تسجيل الخروج</button></div>
    </> : <>
      <h2 style={{ marginBottom: 20 }}>{mode === 'signin' ? 'تسجيل الدخول' : mode === 'signup' ? 'إنشاء حساب' : mode === 'reset' ? 'استعادة كلمة المرور' : 'كلمة مرور جديدة'}</h2>
      <form onSubmit={submit}>{mode !== 'password' && <label className="field"><span>البريد الإلكتروني</span><input type="email" dir="ltr" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>}{mode !== 'reset' && <label className="field"><span>كلمة المرور</span><input type="password" dir="ltr" required minLength={mode === 'signin' ? 1 : 12} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} /></label>}<button className="btn primary" disabled={busy}>{busy ? 'جارٍ الإرسال…' : mode === 'signin' ? 'فتح مساحة العمل' : mode === 'signup' ? 'إنشاء الحساب' : mode === 'reset' ? 'إرسال رابط الاستعادة' : 'حفظ كلمة المرور'}</button></form>
      <div className="auth-links">{mode !== 'signin' && <button className="text-link" onClick={() => { setMode('signin'); setError(''); setMessage(''); }}>تسجيل الدخول</button>}{mode === 'signin' && <><button className="text-link" onClick={() => { setMode('signup'); setError(''); setMessage(''); }}>إنشاء حساب</button><button className="text-link" onClick={() => { setMode('reset'); setError(''); setMessage(''); }}>نسيت كلمة المرور؟</button></>}</div>
    </>}
    {message && <div className="auth-message" role="status">{message}</div>}{error && <div className="auth-message error" role="alert">{error}</div>}
  </section></main>;
}
