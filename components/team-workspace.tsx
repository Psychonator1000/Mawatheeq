import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import AccountMenu from './account-menu';
import {ChatSlot} from './chat-slot';
import BrandLogo from './brand-logo';
import OfficeStaff from './office-staff';
import {Toaster} from './ui/sonner';
import {officeRequest} from '@/lib/local-auth';
import {api} from './shared';
import type {OfficeContext} from '@/lib/office';
import type {CaseRecord} from '@/lib/domain';
import {ALL_POWERS,powersOf,type Permissions} from '@/lib/permissions';

/**
 * «فريق المكتب»: accounts, job roles, pages, cases and admin powers, on a page of its own for the owner and admins
 * holding the staff power. The case list is only used to pick cases and lawyer names, within the admin's own scope.
 */
export default function TeamWorkspace({access,owner}:{access:Permissions;owner:boolean}) {
 const [context,setContext]=useState<OfficeContext|null>(null),[records,setRecords]=useState<CaseRecord[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');
  Promise.all([officeRequest<OfficeContext>('context'),api('/api/cases').then((d:{cases:CaseRecord[]})=>d.cases).catch(()=>[] as CaseRecord[])])
   .then(([ctx,cases])=>{if(active){setContext(ctx);setRecords(cases)}}).catch(e=>{if(active)setError((e as Error).message)}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[version]);
 const refresh=()=>setVersion(v=>v+1);
 return <main className="department-shell theme-team" dir="rtl"><header className="department-topbar"><div className="department-brand"><BrandLogo/><span>مواثيق <small>فريق المكتب</small></span></div><div className="actions"><button className="btn" onClick={refresh} disabled={loading}><RefreshCw size={16}/> تحديث</button><ChatSlot/><AccountMenu/></div></header>
  <div className="department-content desk-page">
   {loading&&<p role="status">جارٍ تحميل فريق المكتب…</p>}{error&&<p className="notice" role="alert">{error}</p>}
   {context&&!context.canManage&&<p className="notice" role="status">{context.switchedBy?'أنت داخل هذا الحساب بالتبديل، وصلاحيات الإدارة لا تعمل في جلسات التبديل حمايةً للحسابات. لإدارة الفريق بصلاحيات هذا الحساب، عد إلى حسابك ثم سجّل الدخول باسم هذا الحساب وكلمة مروره.':'لا يملك هذا الحساب صلاحية إدارة الفريق. يمنحها مسؤول المكتب من «فريق المكتب».'}</p>}
   {context&&<OfficeStaff context={context} records={records} powers={owner?ALL_POWERS:powersOf(access)} onChanged={refresh}/>}
  </div><footer className="department-footer">مواثيق · فريق المكتب والصلاحيات</footer>
  <Toaster position="bottom-left" dir="rtl" theme="light"/></main>;
}
