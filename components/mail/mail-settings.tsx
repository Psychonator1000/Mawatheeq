import {useMemo,useState} from 'react';
import {Plus,Plug,Trash2,Pause,Play,RefreshCw,ShieldCheck} from 'lucide-react';
import {toast} from 'sonner';
import {mailRequest} from '@/lib/local-auth';
import {MAIL_WORKSPACES,PROVIDERS,isAddress,mailFunction,mailChanged,type MailAccount,type MailContext,type MailVisibility,type MailWorkspace,type Provider} from '@/lib/mail';
import {Field,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import Needs from '../needs';
import {EditorDialog} from '../departments/shared';

const fail=(e:unknown)=>toast.error((e as Error).message);
const ago=(iso:string|null)=>iso?new Date(iso).toLocaleString('ar-KW',{dateStyle:'short',timeStyle:'short'}):'لم يُجلب بعد';
type Edit=Partial<MailAccount>&{workspace:MailWorkspace;ownerId:string;provider:Provider;address:string;password:string};

/** Mailboxes (all for the administrator, one's own for others) and, for the administrator, who sees whose mail in each section. */
export default function MailSettings({ctx,workspace,onClose,onChanged}:{ctx:MailContext;workspace:MailWorkspace;onClose:()=>void;onChanged:()=>void}){
 const [tab,setTab]=useState<'boxes'|'access'>('boxes'),[edit,setEdit]=useState<Edit|null>(null),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState('');
 const mine=ctx.admin?ctx.accounts:ctx.accounts.filter(a=>a.ownerId===ctx.me);
 const blank=(ws:MailWorkspace):Edit=>({workspace:ws,ownerId:ctx.admin?'':ctx.me,provider:'gmail',address:'',displayName:'',label:'',username:'',password:'',imapHost:PROVIDERS.gmail.imap,imapPort:993,imapSecurity:'ssl',smtpHost:PROVIDERS.gmail.smtp,smtpPort:465,sinceDays:30,markSeen:true});
 const act=(id:string,fn:()=>Promise<unknown>,done:string)=>{setBusy(id);fn().then(()=>{toast.success(done);onChanged();mailChanged()},fail).finally(()=>setBusy(''))};
 return <EditorDialog title={ctx.admin?'إعدادات البريد':'بريدي'} description={ctx.admin?'صناديق البريد في كل قسم، ومن يرى بريد زملائه.':'اربط بريدك بالأقسام التي تعمل فيها؛ يظهر لك وحدك ما لم يسمح المسؤول لغيرك.'} busy={!!busy} onClose={onClose}>
  {ctx.admin&&<div className="department-tabs view-switch" role="group" aria-label="إعدادات البريد">{([['boxes','صناديق البريد'],['access','من يرى بريد من']] as const).map(([k,l])=><button key={k} className={'btn '+(tab===k?'primary':'')} aria-pressed={tab===k} onClick={()=>setTab(k)}>{l}</button>)}</div>}
  {tab==='boxes'&&<>
   <div className="actions"><button className="btn primary" onClick={()=>setEdit(blank(ctx.workspaces.includes(workspace)?workspace:ctx.workspaces[0]))}><Plus size={15}/> {ctx.admin?'ربط بريد':'ربط بريدي'}</button></div>
   {!mine.length?<Empty title="لا يوجد بريد مرتبط" text={ctx.admin?'اربط بريد القسم المشترك (مثل secretary@النطاق) أو بريد كل موظف في قسمه.':'اربط بريدك ليظهر في صفحة البريد في قسمك.'}/>:
   <div className="table-wrap"><table className="office-table mail-boxes"><thead><tr><th>البريد</th><th>القسم</th><th>لمن</th><th>آخر جلب</th><th></th></tr></thead>
    <tbody>{mine.map(a=><tr key={a.id} className={a.active?'':'ledger-void'}><td><b dir="ltr">{a.address}</b>{a.label&&<small> · {a.label}</small>}{!a.canSend&&<small className="muted"> · عرض فقط</small>}</td><td>{MAIL_WORKSPACES[a.workspace]}</td><td>{a.ownerId?a.ownerName:'مشترك للقسم'}</td>
     <td>{a.lastError?<span className="tag" title={a.lastError}>خطأ: {a.lastError.slice(0,60)}</span>:a.active?ago(a.lastSyncAt):<span className="tag amber">موقوف</span>}</td>
     <td><div className="actions">
      <button className="btn" onClick={()=>setEdit({...a,password:''} as Edit)}>تعديل</button>
      <button className="btn" disabled={!!busy||!a.active} onClick={()=>act(a.id,()=>mailFunction('sync',{force:true,accountId:a.id}),'جُلب البريد')}><RefreshCw size={14}/> جلب الآن</button>
      <button className="btn" disabled={!!busy} onClick={()=>act(a.id,()=>mailRequest('set_active',{id:a.id,active:!a.active}),a.active?'أُوقف الجلب':'استؤنف الجلب')}>{a.active?<><Pause size={14}/> إيقاف</>:<><Play size={14}/> تفعيل</>}</button>
      {confirm===a.id?<button className="btn danger" disabled={!!busy} onClick={()=>act(a.id,()=>mailRequest('delete_account',{id:a.id}),'حُذف البريد ورسائله من التطبيق')}>تأكيد الحذف</button>
       :<button className="btn" title="يحذف الرسائل المحفوظة في التطبيق فقط؛ لا يمس البريد على الخادم" onClick={()=>setConfirm(a.id)}><Trash2 size={14}/> حذف</button>}</div></td></tr>)}</tbody></table></div>}
   <p className="muted">لا يحذف التطبيق شيئاً من البريد الأصلي. ما يُفتح في التطبيق يظهر مقروءاً في البريد الأصلي خلال دقيقة تقريباً، ما لم يُطفأ هذا الخيار في إعدادات الصندوق. كلمات المرور محفوظة مشفّرة في الخادم ولا تُعرض مرة أخرى.</p></>}
  {tab==='access'&&ctx.admin&&<Visibility ctx={ctx} initial={workspace} onChanged={onChanged}/>}
  {edit&&<BoxEditor ctx={ctx} initial={edit} onClose={()=>setEdit(null)} onSaved={()=>{setEdit(null);onChanged();mailChanged()}}/>}
 </EditorDialog>;
}

function BoxEditor({ctx,initial,onClose,onSaved}:{ctx:MailContext;initial:Edit;onClose:()=>void;onSaved:()=>void}){
 const [e,setE]=useState<Edit>(initial),[busy,setBusy]=useState(false),[tested,setTested]=useState('');
 const set=(p:Partial<Edit>)=>{setE(x=>({...x,...p}));setTested('')};
 const preset=(p:Provider)=>set({provider:p,imapHost:PROVIDERS[p].imap||e.imapHost,smtpHost:PROVIDERS[p].smtp,imapPort:PROVIDERS[p].imapPort,smtpPort:PROVIDERS[p].smtpPort,imapSecurity:'ssl'});
 const workspaces=ctx.admin?(Object.keys(MAIL_WORKSPACES) as MailWorkspace[]):ctx.workspaces;
 const owners=useMemo(()=>ctx.members.filter(m=>m.workspaces.includes(e.workspace)),[ctx.members,e.workspace]);
 const host=(h?:string)=>!h||/^[A-Za-z0-9.-]{3,200}$/.test(h);
 const needs=[isAddress(e.address)?'':'اكتب عنوان البريد',e.imapHost?'':'اكتب خادم الوارد (IMAP)',host(e.imapHost)&&host(e.smtpHost)?'':'اسم الخادم غير صحيح',e.id||e.password?'':'اكتب كلمة المرور',
  e.smtpHost&&(e.smtpPort===587||e.smtpPort===25)?'الإرسال من الخادم يعمل بالمنفذ 465 (SSL) فقط':''];
 const account=()=>({id:e.id||'',revision:e.revision||0,workspace:e.workspace,ownerId:e.ownerId,label:e.label||'',address:e.address.trim(),displayName:e.displayName||'',provider:e.provider,
  imapHost:(e.imapHost||'').trim(),imapPort:Number(e.imapPort)||993,imapSecurity:e.imapSecurity||'ssl',smtpHost:(e.smtpHost||'').trim(),smtpPort:Number(e.smtpPort)||465,username:(e.username||e.address).trim(),sentFolder:e.sentFolder||'',sinceDays:Number(e.sinceDays)||30,markSeen:e.markSeen!==false});
 const test=()=>{setBusy(true);mailFunction<{sentFolder:string}>('test',{account:account(),password:e.password}).then(r=>{setTested(r.sentFolder||'—');toast.success('نجح الاتصال')},fail).finally(()=>setBusy(false))};
 const save=()=>{setBusy(true);mailFunction<MailAccount>('save',{account:account(),password:e.password}).then(a=>{toast.success('حُفظ البريد؛ يبدأ جلب رسائل آخر '+(a.sinceDays||30)+' يوماً');void mailFunction('sync',{force:true,accountId:a.id}).then(()=>mailChanged()).catch(()=>{});onSaved()},fail).finally(()=>setBusy(false))};
 const num=(label:string,value:number|undefined,on:(n:number)=>void)=><label className="field"><span>{label}</span><input dir="ltr" inputMode="numeric" value={value??''} onChange={x=>on(Number(x.target.value.replace(/\D/g,''))||0)}/></label>;
 return <EditorDialog title={e.id?'تعديل البريد':'ربط بريد'} description="يُختبر الاتصال بالخادم قبل الحفظ." busy={busy} onClose={onClose}>
  <div className="form-grid">
   <OfficeSelect label="القسم" value={e.workspace} onChange={v=>set({workspace:v as MailWorkspace,ownerId:ctx.admin&&e.ownerId&&!ctx.members.find(m=>m.id===e.ownerId)?.workspaces.includes(v as MailWorkspace)?'':e.ownerId})} options={workspaces.map(w=>[w,MAIL_WORKSPACES[w]])}/>
   {ctx.admin?<OfficeSelect label="لمن هذا البريد" value={e.ownerId} onChange={v=>set({ownerId:v})} empty="مشترك لكل من في القسم" options={owners.map(m=>[m.id,'بريد '+m.name])}/>
    :<label className="field"><span>لمن هذا البريد</span><input readOnly value="بريدي الخاص"/></label>}
   <OfficeSelect label="مزود البريد" value={e.provider} onChange={v=>preset(v as Provider)} options={(Object.keys(PROVIDERS) as Provider[]).map(p=>[p,PROVIDERS[p].label])}/>
   <label className="field"><span>عنوان البريد</span><input dir="ltr" value={e.address} onChange={x=>set({address:x.target.value,username:!e.username||e.username===e.address?x.target.value:e.username,
    ...(e.provider==='custom'&&!e.id&&/@[^@]+\.[^@]+$/.test(x.target.value)&&(!e.imapHost||e.imapHost.startsWith('mail.'))?{imapHost:'mail.'+x.target.value.split('@')[1],smtpHost:'mail.'+x.target.value.split('@')[1]}:{})})} placeholder="secretary@example.com"/></label>
   <Field label="الاسم الظاهر للمستلم" value={e.displayName||''} onChange={v=>set({displayName:v})} placeholder="مثل: مكتب مواثيق — السكرتارية"/>
   <Field label="وصف داخلي" value={e.label||''} onChange={v=>set({label:v})} placeholder="اختياري"/>
   <label className="field"><span>اسم المستخدم</span><input dir="ltr" value={e.username||''} onChange={x=>set({username:x.target.value})}/></label>
   <label className="field"><span>{e.id?'كلمة مرور جديدة (اتركها فارغة للإبقاء)':'كلمة المرور / كلمة مرور التطبيقات'}</span><input dir="ltr" type="password" autoComplete="new-password" value={e.password} onChange={x=>set({password:x.target.value})}/></label></div>
  <label className="check mail-seen"><input type="checkbox" checked={e.markSeen!==false} onChange={x=>set({markSeen:x.target.checked})}/> ما يُقرأ في التطبيق يظهر مقروءاً في البريد الأصلي أيضاً (Gmail وOutlook والهاتف)، وما يُعلَّم غير مقروء يعود كذلك</label>
  <p className="notice mail-provider-note">{PROVIDERS[e.provider].note}</p>
  <details className="mail-servers" open={e.provider==='custom'}><summary>إعدادات الخادم</summary><div className="form-grid">
   <label className="field"><span>خادم الوارد (IMAP)</span><input dir="ltr" value={e.imapHost||''} onChange={x=>set({imapHost:x.target.value})}/></label>{num('منفذ الوارد',e.imapPort,n=>set({imapPort:n}))}
   <OfficeSelect label="تشفير الوارد" value={e.imapSecurity||'ssl'} onChange={v=>set({imapSecurity:v as 'ssl'|'starttls'})} options={[['ssl','SSL/TLS'],['starttls','STARTTLS']]}/>
   <label className="field"><span>خادم الإرسال (SMTP)، اتركه فارغاً للعرض فقط</span><input dir="ltr" value={e.smtpHost||''} onChange={x=>set({smtpHost:x.target.value})}/></label>{num('منفذ الإرسال',e.smtpPort,n=>set({smtpPort:n}))}
   {num('جلب رسائل آخر (يوماً) عند الربط',e.sinceDays,n=>set({sinceDays:Math.min(365,Math.max(1,n))}))}</div></details>
  {tested&&<p className="notice ok" role="status">نجح الاتصال{tested!=='—'?` · مجلد الصادر: ${tested}`:' · لم يُعثر على مجلد الصادر، فيظهر الوارد فقط'}</p>}
  <Needs items={needs}/>
  <div className="actions"><button className="btn" disabled={busy||needs.some(Boolean)} onClick={test}><Plug size={15}/> اختبار الاتصال</button><button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={save}>{busy?'جارٍ الاتصال…':'حفظ'}</button><button className="btn" disabled={busy} onClick={onClose}>إلغاء</button></div>
 </EditorDialog>;
}

function Visibility({ctx,initial,onChanged}:{ctx:MailContext;initial:MailWorkspace;onChanged:()=>void}){
 const [ws,setWs]=useState<MailWorkspace>(initial),[rows,setRows]=useState<MailVisibility[]>(ctx.visibility),[busy,setBusy]=useState('');
 const people=ctx.members.filter(m=>m.workspaces.includes(ws)&&m.id!==ctx.me);
 const personal=ctx.accounts.filter(a=>a.workspace===ws&&a.ownerId);
 const get=(userId:string)=>rows.find(r=>r.userId===userId&&r.workspace===ws)||{userId,workspace:ws,inbox:false,sent:false,send:false};
 const toggle=(userId:string,key:'inbox'|'sent'|'send')=>{const cur=get(userId),next={...cur,[key]:!cur[key]};setBusy(userId);
  const put=(v:MailVisibility)=>setRows(r=>[...r.filter(x=>!(x.userId===userId&&x.workspace===ws)),v]);
  put(next);mailRequest('set_visibility',next).then(onChanged,e=>{put(cur);fail(e)}).finally(()=>setBusy(''))};
 return <section className="mail-access">
  <p className="muted"><ShieldCheck size={15}/> في كل قسم يرى كل من يدخله البريد المشترك وبريده الخاص. أما البريد الخاص بزملائه في القسم فلا يراه إلا من تسمح له هنا: الوارد والصادر كلٌّ على حدة، والرد والإرسال منه. مثال: موظف يغطي إجازة السكرتيرة يُمنح «الوارد» و«الإرسال» في قسم السكرتارية.</p>
  <OfficeSelect label="القسم" value={ws} onChange={v=>setWs(v as MailWorkspace)} options={(Object.keys(MAIL_WORKSPACES) as MailWorkspace[]).map(w=>[w,MAIL_WORKSPACES[w]])}/>
  <p className="muted">البريد الخاص في هذا القسم: {personal.length?personal.map(a=>`${a.ownerName} (${a.address})`).join('، '):'لا يوجد بعد'}</p>
  {!people.length?<Empty title="لا يوجد موظفون في هذا القسم" text="امنح الموظفين صفحة القسم من «فريق المكتب» أولاً."/>:
  <div className="table-wrap"><table className="office-table mail-access-table"><thead><tr><th>الموظف</th><th>يرى وارد زملائه</th><th>يرى صادر زملائه</th><th>يرد ويرسل من بريدهم</th></tr></thead>
   <tbody>{people.map(p=>{const r=get(p.id);return <tr key={p.id}><td>{p.name} <small className="muted">@{p.username}</small></td>
    {(['inbox','sent','send'] as const).map(k=><td key={k}><label className="check"><input type="checkbox" checked={r[k]} aria-busy={busy===p.id} aria-label={`${p.name}: ${k==='inbox'?'الوارد':k==='sent'?'الصادر':'الإرسال'}`} onChange={()=>toggle(p.id,k)}/> {r[k]?'مسموح':'لا'}</label></td>)}</tr>})}</tbody></table></div>}
 </section>;
}
