import {useEffect,useState,type ReactNode} from 'react';
import {RefreshCw} from 'lucide-react';
import {departmentPages,WORKSPACES,type Department,type CaseSummary} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {officeRequest} from '@/lib/local-auth';
import {officePages} from '@/lib/office-api';
import type {OfficeContext,WorkItem} from '@/lib/office';
import {Toaster} from '../ui/sonner';
import {EditorDialog,StatusMessage} from './shared';
import {clientName} from '@/lib/clients';
import Secretary from '../secretair';
import Collections from './collections';
import Accounting from './accounting';
import HR from './hr';
export default function DepartmentWorkspace({workspace,access,switchButton}:{workspace:Department;access:Permissions;switchButton:ReactNode}) {
 const [cases,setCases]=useState<CaseSummary[]>([]),[context,setContext]=useState<OfficeContext|null>(null),[work,setWork]=useState<WorkItem[]>([]);
 const [version,setVersion]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<CaseSummary|null>(null);
 useEffect(()=>{let active=true;setLoading(true);setError('');
  Promise.all([workspace==='hr'?[]:departmentPages<CaseSummary>(workspace,'cases_page'),workspace==='secretary'?officeRequest<OfficeContext>('context'):null,workspace==='secretary'?officePages<WorkItem>('work_page'):[]]).then(([c,ctx,w])=>{if(active){setCases(c);setContext(ctx);setWork(w)}}).catch(e=>{if(active){setCases([]);setWork([]);setError(e.message)}}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[workspace,version]);
 const refresh=()=>setVersion(v=>v+1),meta=WORKSPACES[workspace];
 return <main className={'department-shell theme-'+workspace} dir="rtl"><header className="department-topbar"><div className="department-brand"><span className="brand-mark">M</span><span>مواثيق <small>{meta.name}</small></span></div><div className="actions">{switchButton}<button className="btn" onClick={refresh} disabled={loading}><RefreshCw size={16}/> تحديث</button></div></header>
 <div className="department-content"><StatusMessage loading={loading} error={error}/>{!loading&&!error&&<>
 {!access.canEdit&&<p className="notice">حسابك للقراءة فقط في هذه المساحة.</p>}
 {workspace==='secretary'&&context&&<Secretary items={work} context={context} records={cases} onChanged={refresh} onOpenCase={setSelected}/>}
 {workspace==='collections'&&<Collections key={version} cases={cases} access={access}/>}
 {workspace==='accounting'&&<Accounting key={version} cases={cases} access={access}/>}
 {workspace==='hr'&&<HR key={version} access={access}/>}
 </>}</div><footer className="department-footer">مواثيق · {meta.name}{workspace!=='hr'&&' · '+(access.caseScope==='all'?'جميع القضايا':'القضايا المحددة لحسابك')}</footer>
 {selected&&<EditorDialog title="ملخص القضية" description="بيانات تعريف القضية المرتبطة بهذا العمل." busy={false} onClose={()=>setSelected(null)}><dl className="summary-grid"><dt>الكود</dt><dd>{selected.code||'—'}</dd><dt>الرقم الآلي</dt><dd>{selected.autoNumber||'—'}</dd><dt>الموكل</dt><dd>{clientName(selected)}</dd><dt>الخصم</dt><dd>{selected.opponent}</dd><dt>الحالة</dt><dd>{selected.archived?'مؤرشفة':'نشطة'}</dd></dl><button className="btn" onClick={()=>setSelected(null)}>إغلاق</button></EditorDialog>}
 <Toaster position="bottom-left" dir="rtl" theme="light"/></main>;
}
