'use client';
import {useMemo,useState} from 'react';
import {toast} from 'sonner';
import {officeRequest} from '@/lib/local-auth';
import {LEGAL_SECTIONS,type Permissions} from '@/lib/permissions';
import type {Member} from '@/lib/office';
import type {CaseRecord} from '@/lib/domain';
import {generatePassword,personName,suggestUsername} from '@/lib/staff-accounts';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';

type Row={label:string;cases:string[];include:boolean;username:string;displayName:string};
const CASE_SECTIONS=LEGAL_SECTIONS.filter(s=>s!=='documents');

/** Creates one account per lawyer named on the cases. Each account gets a random password; the owner can switch
 *  into it without the password, and can set a password to hand over when the lawyer signs in alone. */
export default function LawyerAccounts({members,records,onClose,onCreated}:{members:Member[];records:CaseRecord[];onClose:()=>void;onCreated:()=>void}){
 const linked=useMemo(()=>new Set(members.map(m=>(m.displayName||'').trim()).filter(Boolean)),[members]);
 const [rows,setRows]=useState<Row[]>(()=>{
  const byLawyer=new Map<string,string[]>();
  for(const c of records){const label=(c.lawyer||'').replace(/\s+/g,' ').trim();if(label)byLawyer.set(label,[...(byLawyer.get(label)||[]),c.id])}
  const taken=members.map(m=>m.username);
  return [...byLawyer].sort((a,b)=>b[1].length-a[1].length).filter(([label])=>!linked.has(label)).map(([label,cases])=>{const username=suggestUsername(label,taken);taken.push(username);return {label,cases,include:true,username,displayName:label}});
 });
 const [scope,setScope]=useState<'own'|'all'|'none'>('own'),[canEdit,setCanEdit]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[failures,setFailures]=useState<string[]>([]);
 const chosen=rows.filter(r=>r.include);
 const patch=(i:number,next:Partial<Row>)=>setRows(rs=>rs.map((r,j)=>j===i?{...r,...next}:r));
 async function create(){
  setBusy(true);setFailures([]);setProgress(0);const failed:string[]=[];let made=0;
  for(const row of chosen){
   try{
    const permissions:Omit<Permissions,'revision'>=scope==='none'?{sections:[],caseScope:'selected',caseIds:[],canEdit:false,canExport:false}
     :{sections:CASE_SECTIONS,caseScope:scope==='all'?'all':'selected',caseIds:scope==='all'?[]:row.cases,canEdit,canExport:false};
    const password=generatePassword();
    const created=await officeRequest<Member>('create_member',{username:row.username.trim().toLowerCase(),password,permissions});
    await officeRequest('set_member_password',{id:created.id,password,mustChange:false});
    await officeRequest('set_display_name',{id:created.id,displayName:row.displayName});
    made++;
   }catch(e){failed.push(`${personName(row.label)}: ${(e as Error).message}`)}
   setProgress(p=>p+1);
  }
  setBusy(false);setFailures(failed);onCreated();
  if(made)toast.success(`أُنشئ ${made} حساباً للمحامين.`);
  if(!failed.length)onClose();
 }
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)onClose()}}><DialogContent dir="rtl" className="office-dialog permissions-dialog lawyer-accounts"><DialogHeader><DialogTitle>حسابات المحامين</DialogTitle><DialogDescription>حساب لكل محامٍ مذكور في القضايا. تُنشأ بكلمات مرور عشوائية لا يلزمك حفظها: يمكنك الدخول إلى أي حساب منها دون كلمة مرور، وعندما يحتاج المحامي الدخول بنفسه اختر له كلمة مرور من زر «كلمة المرور».</DialogDescription></DialogHeader>
  {!rows.length?<p className="subtitle">لكل محامٍ مذكور في القضايا حساب مرتبط بالفعل.</p>:<>
   <fieldset className="permission-group" disabled={busy}><legend>ما يراه كل محامٍ</legend>
    <label className="checkbox-line"><input type="radio" name="lawyer-scope" checked={scope==='own'} onChange={()=>setScope('own')}/>صفحة القضايا، وقضاياه هو فقط</label>
    <label className="checkbox-line"><input type="radio" name="lawyer-scope" checked={scope==='all'} onChange={()=>setScope('all')}/>صفحة القضايا، وجميع القضايا</label>
    <label className="checkbox-line"><input type="radio" name="lawyer-scope" checked={scope==='none'} onChange={()=>setScope('none')}/>بلا صفحات الآن (أحددها لاحقاً)</label>
    {scope!=='none'&&<label className="checkbox-line"><input type="checkbox" checked={canEdit} onChange={e=>setCanEdit(e.target.checked)}/>السماح بالتعديل</label>}
    {scope==='own'&&<p className="subtitle">«قضاياه فقط» تشمل القضايا المسجلة باسمه الآن. القضايا الجديدة تضيفها له من «تعديل الصلاحيات».</p>}
   </fieldset>
   <div className="table-wrap"><table className="office-table"><thead><tr><th aria-label="إنشاء"/><th>المحامي في القضايا</th><th>الاسم الظاهر</th><th>اسم الدخول</th></tr></thead><tbody>
    {rows.map((r,i)=><tr key={r.label}><td><input type="checkbox" aria-label={'إنشاء حساب '+r.label} checked={r.include} disabled={busy} onChange={e=>patch(i,{include:e.target.checked})}/></td><td>{r.label}<small>{r.cases.length} قضية</small></td>
     <td><input aria-label={'الاسم الظاهر '+r.label} value={r.displayName} disabled={busy} maxLength={80} onChange={e=>patch(i,{displayName:e.target.value})}/></td>
     <td><input aria-label={'اسم الدخول '+r.label} dir="ltr" value={r.username} disabled={busy} pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{2,31}" onChange={e=>patch(i,{username:e.target.value})}/></td></tr>)}
   </tbody></table></div>
   {failures.length>0&&<div className="notice" role="alert"><b>لم تُنشأ هذه الحسابات:</b><ul>{failures.map(f=><li key={f}>{f}</li>)}</ul></div>}
   <button className="btn primary" disabled={busy||!chosen.length} onClick={()=>void create()}>{busy?`جارٍ الإنشاء ${progress} من ${chosen.length}…`:`إنشاء ${chosen.length} حساب`}</button>
  </>}
 </DialogContent></Dialog>;
}
