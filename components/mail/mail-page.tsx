import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Mail,Send,Reply,ReplyAll,Forward,Paperclip,RefreshCw,Settings2,Check,RotateCcw,EyeOff,Image as ImageIcon,X,CornerDownLeft,Inbox,AlertTriangle} from 'lucide-react';
import {toast} from 'sonner';
import {mailRequest} from '@/lib/local-auth';
import {MAIL_WORKSPACES,addressText,framedHtml,mailChanged,mailFunction,onMailChanged,parseAddresses,personOf,quoteFor,sizeText,syncMail,uploadAttachment,
 type MailAccount,type MailContext,type MailMessage,type MailSummary,type MailWorkspace} from '@/lib/mail';
import {Field,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import FilterSelect from '../filter-select';
import Needs from '../needs';
import {EditorDialog} from '../departments/shared';

const MailSettings=lazy(()=>import('./mail-settings'));
const fail=(e:unknown)=>toast.error((e as Error).message);
const stamp=(iso:string)=>{const d=new Date(iso),now=new Date();return d.toDateString()===now.toDateString()?d.toLocaleTimeString('ar-KW',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('ar-KW',{day:'numeric',month:'short',year:d.getFullYear()===now.getFullYear()?undefined:'numeric'})};
const full=(iso:string)=>new Date(iso).toLocaleString('ar-KW',{dateStyle:'medium',timeStyle:'short'});

type Draft={accountId:string;to:string;cc:string;subject:string;text:string;replyToId?:string;inReplyTo?:string;references?:string;attachments:{path:string;name:string;mime:string;size:number}[]};

/**
 * «البريد» of a section: the mail of the section's mailboxes that this person may read, incoming and outgoing, with who read
 * each message, who answered it and who follows it up. Replies go out from the section's (or colleague's) address.
 */
export default function MailPage({workspace,focusId}:{workspace:MailWorkspace;focusId?:string}){
 const [ctx,setCtx]=useState<MailContext|null>(null),[error,setError]=useState(''),[rows,setRows]=useState<MailSummary[]|null>(null),[more,setMore]=useState(false);
 const [account,setAccount]=useState(''),[folder,setFolder]=useState<'inbox'|'sent'|'all'>(focusId?'all':'inbox'),[filter,setFilter]=useState(''),[q,setQ]=useState('');
 const [selected,setSelected]=useState(focusId||''),[message,setMessage]=useState<MailMessage|null>(null),[draft,setDraft]=useState<Draft|null>(null),[settings,setSettings]=useState(false),[fetching,setFetching]=useState(false),[v,setV]=useState(0);
 // The open message (kept until the next one loads, hidden once nothing is selected).
 const shown=message&&message.id===selected?message:null;
 const loadCtx=useCallback(()=>mailRequest<MailContext>('context').then(c=>{setCtx(c);setError('')}).catch(e=>setError((e as Error).message)),[]);
 useEffect(()=>{void loadCtx()},[loadCtx]);
 const accounts=useMemo(()=>(ctx?.accounts||[]).filter(a=>a.workspace===workspace&&a.rights.length>0),[ctx,workspace]);
 const byId=useMemo(()=>new Map((ctx?.accounts||[]).map(a=>[a.id,a])),[ctx]);
 const senders=accounts.filter(a=>a.rights.includes('send')&&a.canSend&&a.active);
 const me=ctx?.members.find(m=>m.id===ctx.me);
 // The list follows the filters and refreshes when new mail arrives.
 useEffect(()=>{if(!ctx)return;let live=true;const t=setTimeout(()=>{mailRequest<MailSummary[]>('list',{workspace,accountId:account,folder,filter,q,limit:60}).then(r=>{if(live){setRows(r);setMore(r.length===60)}}).catch(e=>{if(live)setError((e as Error).message)})},q?250:0);
  return()=>{live=false;clearTimeout(t)}},[ctx,workspace,account,folder,filter,q,v]);
 useEffect(()=>onMailChanged(()=>setV(x=>x+1)),[]);
 useEffect(()=>{if(!selected)return;let live=true;mailRequest<MailMessage>('get',{id:selected}).then(m=>{if(!live)return;setMessage(m);if(m.folder==='inbox'){setRows(r=>r&&r.map(x=>x.id===m.id?{...x,read:true}:x));mailChanged()}}).catch(e=>{if(live){fail(e);setSelected('')}});return()=>{live=false}},[selected]);
 const loadMore=()=>{if(!rows?.length)return;mailRequest<MailSummary[]>('list',{workspace,accountId:account,folder,filter,q,limit:60,before:rows[rows.length-1].sentAt}).then(r=>{setRows(x=>[...(x||[]),...r]);setMore(r.length===60)},fail)};
 const fetchNow=()=>{setFetching(true);void syncMail(true).then(()=>{setV(x=>x+1);return loadCtx()}).finally(()=>setFetching(false))};
 const changed=(m:Partial<MailSummary>&{id:string})=>{setRows(r=>r&&r.map(x=>x.id===m.id?{...x,...m}:x));setMessage(x=>x&&x.id===m.id?{...x,...m}:x)};
 const sign=me?'\n\n'+me.name:'';
 const compose=(d:Partial<Draft>={})=>setDraft({accountId:senders[0]?.id||'',to:'',cc:'',subject:'',text:sign,attachments:[],...d});
 function replyTo(m:MailMessage,mode:'reply'|'all'|'forward'){
  const acc=byId.get(m.accountId),own=(acc?.address||'').toLowerCase(),from=senders.some(s=>s.id===m.accountId)?m.accountId:senders[0]?.id||'';
  const re=()=>m.subject.replace(/^((re|fw|fwd|رد|إعادة توجيه)\s*:\s*)+/i,'');
  if(mode==='forward'){compose({accountId:from,subject:'إعادة توجيه: '+re(),text:sign+`\n\n---------- رسالة معاد توجيهها ----------\nمن: ${personOf(m)} <${m.fromAddr}>\nالتاريخ: ${full(m.sentAt)}\nالموضوع: ${m.subject}\nإلى: ${addressText(m.to)}\n\n${m.text}`,
   attachments:m.attachmentList.filter(a=>a.path).map(a=>({path:a.path,name:a.name,mime:a.mime,size:a.size}))});return}
  const to=m.folder==='sent'?addressText(m.to):(m.replyTo||m.fromAddr);
  const cc=mode==='all'?addressText([...m.to,...m.cc].filter(a=>a.address.toLowerCase()!==own&&a.address.toLowerCase()!==to.toLowerCase())):'';
  compose({accountId:from,to,cc,subject:'رد: '+re(),text:sign+quoteFor(m,full(m.sentAt)),replyToId:m.folder==='inbox'?m.id:'',inReplyTo:m.messageId,references:m.messageId});
 }
 if(error&&!ctx)return <section className="panel"><p className="notice" role="alert">{error}</p></section>;
 if(!ctx)return <section className="panel"><p role="status">جارٍ تحميل البريد…</p></section>;
 const broken=accounts.filter(a=>a.lastError&&(ctx.admin||a.ownerId===ctx.me));
 return <section className="panel mail-page">
  <div className="department-toolbar"><h2><Mail size={20}/> بريد {MAIL_WORKSPACES[workspace]}</h2><div className="actions">
   <button className="btn" onClick={fetchNow} disabled={fetching||!accounts.length}><RefreshCw size={15} className={fetching?'spin':''}/> {fetching?'جارٍ الجلب…':'جلب البريد'}</button>
   <button className="btn" onClick={()=>setSettings(true)}><Settings2 size={15}/> {ctx.admin?'إعدادات البريد':'بريدي'}</button>
   <button className="btn primary" disabled={!senders.length} title={senders.length?undefined:'لا يوجد بريد في هذا القسم تملك صلاحية الإرسال منه'} onClick={()=>compose()}><Send size={15}/> رسالة جديدة</button></div></div>
  {broken.map(a=><p key={a.id} className="notice mail-error"><AlertTriangle size={15}/> {a.address}: {a.lastError}</p>)}
  {!accounts.length?<Empty title="لا يوجد بريد مرتبط بهذا القسم" text={ctx.admin?'أضف بريد القسم المشترك أو بريد الموظفين من «إعدادات البريد».':'اربط بريدك من «بريدي»، أو اطلب من مسؤول المكتب ربط بريد القسم أو السماح لك ببريد زملائك.'}/>:<>
  <div className="department-filters mail-filters">
   {accounts.length>1&&<FilterSelect label="البريد" value={account} onChange={setAccount} empty="كل صناديق القسم" options={accounts.map(a=>({value:a.id,label:a.label||a.address,hint:a.ownerId?a.ownerName:'مشترك'}))}/>}
   <div className="department-tabs view-switch mail-folders" role="group" aria-label="المجلد">{([['inbox','الوارد'],['sent','الصادر'],['all','الكل']] as const).map(([k,l])=><button key={k} className={'btn '+(folder===k?'primary':'')} aria-pressed={folder===k} onClick={()=>setFolder(k)}>{l}</button>)}</div>
   <OfficeSelect label="عرض" value={filter} onChange={setFilter} empty="كل الرسائل" options={[['unread','غير المقروءة'],['open','بانتظار المتابعة'],['mine','المسندة إليّ']]}/>
   <Field label="بحث في البريد" value={q} onChange={setQ} placeholder="المرسل أو العنوان أو النص"/></div>
  <div className={'mail-split'+(shown?' reading':'')}>
   <div className="mail-list" role="list" aria-label="الرسائل">{!rows?<p role="status">جارٍ التحميل…</p>:!rows.length?<Empty title="لا توجد رسائل" text={filter||q?'غيّر التصفية أو البحث.':'تظهر هنا الرسائل بعد جلبها من الخادم.'}/>:<>
    {rows.map(r=>{const acc=byId.get(r.accountId);return <button key={r.id} role="listitem" className={'mail-row'+(r.read?'':' unread')+(selected===r.id?' active':'')} onClick={()=>setSelected(r.id)}>
     <span className="mail-row-top"><b>{r.folder==='sent'?'إلى: '+(r.to.map(t=>t.name||t.address).join('، ')||'—'):personOf(r)}</b><time>{stamp(r.sentAt)}</time></span>
     <span className="mail-subject">{r.subject||'(بلا عنوان)'}</span><span className="mail-snippet">{r.snippet}</span>
     <span className="mail-tags">{accounts.length>1&&acc&&<span className="tag">{acc.ownerId?acc.ownerName:acc.label||'مشترك'}</span>}{r.folder==='sent'&&<span className="tag">صادر{r.sentBy?' · '+r.sentBy:''}</span>}{r.attachments>0&&<Paperclip size={13} aria-label="مرفقات"/>}
      {r.repliedAt&&<span className="tag green"><CornerDownLeft size={12}/> رد {r.repliedBy}</span>}{r.assignedName&&<span className="tag amber">{r.assignedName}</span>}{r.folder==='inbox'&&r.state==='done'&&!r.repliedAt&&<span className="tag green">تمت</span>}</span></button>})}
    {more&&<button className="btn mail-more" onClick={loadMore}>رسائل أقدم</button>}</>}</div>
   <div className="mail-reader">{shown?<Reader key={shown.id} m={shown} account={byId.get(shown.accountId)} ctx={ctx} workspace={workspace} onClose={()=>setSelected('')} onReply={mode=>replyTo(shown,mode)} onChanged={changed}/>
    :<div className="mail-placeholder"><Inbox size={34}/><p>اختر رسالة لعرضها.</p></div>}</div>
  </div></>}
  {draft&&<Composer draft={draft} senders={senders} onClose={()=>setDraft(null)} onSent={()=>{setDraft(null);setFolder(f=>f);setV(x=>x+1);if(selected){const id=selected;setSelected('');setTimeout(()=>setSelected(id))}}}/>}
  {settings&&<Suspense fallback={null}><MailSettings ctx={ctx} workspace={workspace} onClose={()=>setSettings(false)} onChanged={()=>{void loadCtx();setV(x=>x+1)}}/></Suspense>}
 </section>;
}

function Reader({m,account,ctx,workspace,onClose,onReply,onChanged}:{m:MailMessage;account?:MailAccount;ctx:MailContext;workspace:MailWorkspace;onClose:()=>void;onReply:(mode:'reply'|'all'|'forward')=>void;onChanged:(m:Partial<MailSummary>&{id:string})=>void}){
 const [images,setImages]=useState(false),[note,setNote]=useState(m.note),[busy,setBusy]=useState(false);
 const people=ctx.members.filter(p=>p.workspaces.includes(workspace));
 const remote=/<img[^>]+src=["']?https?:/i.test(m.html);
 const set=(data:Record<string,unknown>,done:string)=>{setBusy(true);mailRequest<MailSummary&{note:string}>('set_state',{id:m.id,...data}).then(r=>{onChanged(r);if('note' in data)setNote(r.note);toast.success(done)},fail).finally(()=>setBusy(false))};
 const download=(i:number)=>{mailFunction<{url:string}>('attachment',{messageId:m.id,index:i}).then(r=>{const a=document.createElement('a');a.href=r.url;a.rel='noopener';a.click()},fail)};
 return <article className="mail-message">
  <header><div className="mail-message-head"><h3>{m.subject||'(بلا عنوان)'}</h3><button className="icon-btn" aria-label="إغلاق الرسالة" onClick={onClose}><X size={18}/></button></div>
   <dl className="mail-meta"><dt>من</dt><dd>{m.fromName?<>{m.fromName} <small dir="ltr">&lt;{m.fromAddr}&gt;</small></>:<span dir="ltr">{m.fromAddr}</span>}{m.sentBy&&<small> · أرسلها {m.sentBy}</small>}</dd>
    <dt>إلى</dt><dd dir="auto">{addressText(m.to)||'—'}</dd>{m.cc.length>0&&<><dt>نسخة</dt><dd dir="auto">{addressText(m.cc)}</dd></>}
    <dt>التاريخ</dt><dd>{full(m.sentAt)}</dd><dt>صندوق البريد</dt><dd>{account?.address||'—'}{account&&<small> · {account.ownerId?'بريد '+account.ownerName:'مشترك للقسم'}</small>}</dd></dl>
   <div className="actions mail-actions">{m.canSend&&<><button className="btn primary" onClick={()=>onReply('reply')}><Reply size={15}/> رد</button><button className="btn" onClick={()=>onReply('all')}><ReplyAll size={15}/> رد على الكل</button><button className="btn" onClick={()=>onReply('forward')}><Forward size={15}/> إعادة توجيه</button></>}
    {m.folder==='inbox'&&<button className="btn" onClick={()=>{mailRequest('mark',{ids:[m.id],read:false}).then(()=>{onChanged({id:m.id,read:false});mailChanged();onClose()},fail)}}><EyeOff size={15}/> غير مقروءة</button>}
    {m.folder==='inbox'&&<button className="btn" disabled={busy} onClick={()=>set({state:m.state==='done'?'open':'done'},m.state==='done'?'أُعيد فتح الرسالة':'عُلّمت الرسالة منتهية')}>{m.state==='done'?<><RotateCcw size={15}/> إعادة فتح</>:<><Check size={15}/> تمت المتابعة</>}</button>}</div>
  </header>
  <div className="mail-follow">{m.repliedAt&&<span className="tag green"><CornerDownLeft size={12}/> رد عليها {m.repliedBy} · {full(m.repliedAt)}</span>}
   {m.readBy.length>0&&<small className="muted">قرأها: {m.readBy.map(r=>`${r.name} (${stamp(r.at)})`).join('، ')}</small>}
   <OfficeSelect label="المتابِع" value={m.assignedTo} onChange={v=>set({assignedTo:v},v?'أُسندت الرسالة':'أُلغي الإسناد')} empty="بلا إسناد" options={people.map(p=>[p.id,p.name])}/>
   <label className="field mail-note"><span>ملاحظة داخلية</span><span className="mail-note-row"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="لا تُرسل مع البريد"/>{note!==m.note&&<button className="btn" disabled={busy} onClick={()=>set({note},'حُفظت الملاحظة')}>حفظ</button>}</span></label></div>
  {m.attachmentList.length>0&&<ul className="mail-attachments">{m.attachmentList.map((a,i)=><li key={i}><button className="btn" disabled={!a.path} title={a.path?undefined:'المرفق أكبر من 15 ميجابايت؛ افتحه من بريدك مباشرة'} onClick={()=>download(i)}><Paperclip size={14}/> {a.name} <small>{sizeText(a.size)}</small></button></li>)}</ul>}
  {m.html?<>{remote&&!images&&<button className="btn mail-images" onClick={()=>setImages(true)}><ImageIcon size={14}/> عرض الصور الخارجية</button>}
   <iframe className="mail-frame" title="نص الرسالة" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={framedHtml(m.html,images)}/></>
   :<div className="mail-text" dir="auto">{m.text||'(رسالة بلا نص)'}</div>}
 </article>;
}

function Composer({draft,senders,onClose,onSent}:{draft:Draft;senders:MailAccount[];onClose:()=>void;onSent:()=>void}){
 const [d,setD]=useState(draft),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(0);
 const file=useRef<HTMLInputElement>(null);
 const to=parseAddresses(d.to),cc=parseAddresses(d.cc);
 const needs=[d.accountId?'':'اختر البريد الذي تُرسل منه',to.list.length?'':'اكتب عنوان المستلم',to.bad.length||cc.bad.length?'عناوين غير صحيحة: '+[...to.bad,...cc.bad].join('، '):'',d.subject.trim()||d.text.trim()?'':'اكتب الموضوع أو النص',uploading?'انتظر اكتمال رفع المرفقات':''];
 const attach=async(files:FileList)=>{for(const f of Array.from(files)){if(f.size>15*1024*1024){toast.error(`${f.name}: الحد 15 ميجابايت للملف.`);continue}
  setUploading(n=>n+1);try{const path=await uploadAttachment(d.accountId,f);setD(x=>({...x,attachments:[...x.attachments,{path,name:f.name,mime:f.type||'application/octet-stream',size:f.size}]}))}catch(e){fail(e)}finally{setUploading(n=>n-1)}}};
 const send=()=>{setBusy(true);mailFunction('send',{message:{accountId:d.accountId,to:to.list,cc:cc.list,subject:d.subject.trim(),text:d.text,replyToId:d.replyToId||'',inReplyTo:d.inReplyTo||'',references:d.references||'',attachments:d.attachments}})
  .then(()=>{toast.success('أُرسلت الرسالة');mailChanged();onSent()},fail).finally(()=>setBusy(false))};
 const from=senders.find(s=>s.id===d.accountId);
 return <EditorDialog title={d.replyToId||d.inReplyTo?'رد':'رسالة جديدة'} description={from?`تُرسل من ${from.displayName?from.displayName+' · ':''}${from.address}`:'اختر البريد الذي تُرسل منه.'} busy={busy} onClose={onClose}>
  <div className="form-grid mail-compose">
   <OfficeSelect label="من" value={d.accountId} onChange={v=>setD({...d,accountId:v,attachments:v===d.accountId?d.attachments:d.attachments.filter(a=>!a.path.startsWith('outgoing/'))})} options={senders.map(s=>[s.id,(s.label||s.address)+(s.ownerId?' · '+s.ownerName:'')])}/>
   <label className="field wide"><span>إلى</span><input dir="ltr" value={d.to} onChange={e=>setD({...d,to:e.target.value})} placeholder="name@example.com، عدة عناوين بفاصلة"/></label>
   <label className="field wide"><span>نسخة</span><input dir="ltr" value={d.cc} onChange={e=>setD({...d,cc:e.target.value})}/></label>
   <Field label="الموضوع" value={d.subject} onChange={v=>setD({...d,subject:v})} wide/>
   <label className="field wide"><span>النص</span><textarea className="mail-body" dir="auto" rows={12} value={d.text} onChange={e=>setD({...d,text:e.target.value})}/></label></div>
  <div className="mail-compose-files">{d.attachments.map((a,i)=><span key={a.path} className="tag"><Paperclip size={12}/> {a.name} <small>{sizeText(a.size)}</small><button className="icon-btn" aria-label={'إزالة '+a.name} onClick={()=>setD({...d,attachments:d.attachments.filter((_,k)=>k!==i)})}><X size={12}/></button></span>)}
   {uploading>0&&<span className="muted" role="status">جارٍ رفع {uploading}…</span>}
   <input ref={file} type="file" multiple hidden onChange={e=>{if(e.target.files)void attach(e.target.files);e.target.value=''}}/><button className="btn" disabled={!d.accountId} onClick={()=>file.current?.click()}><Paperclip size={15}/> إرفاق ملف</button></div>
  <Needs items={needs}/>
  <div className="actions"><button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={send}><Send size={15}/> {busy?'جارٍ الإرسال…':'إرسال'}</button><button className="btn" disabled={busy} onClick={onClose}>إلغاء</button></div>
 </EditorDialog>;
}
