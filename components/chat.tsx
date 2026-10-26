'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,Bell,Download,Eye,FileText,LogOut,MessageCircle,Paperclip,Pencil,Plus,Search,Send,Trash2,UserPlus,Users,X} from 'lucide-react';
import {toast} from 'sonner';
import {chatRequest,fileRequest} from '@/lib/local-auth';
import {backend} from '@/lib/supabase-client';
import {requestOpen} from '@/lib/open-record';
import {useChatSlot} from './chat-slot';
import {Popover,PopoverContent,PopoverTrigger} from './ui/popover';
import {LIVE_EVENT,startLive} from '@/lib/live';
import {CHAT_WITH_EVENT,FILE_TYPES,MAX_FILE,bodyParts,chatTime,conversationName,fileSize,refToken,triggerRefs,typedTrigger,type ChatConversation,type ChatMessage,type ChatPerson,type ChatRef,type ChatSummary} from '@/lib/chat';

const FAST=5000,SLOW=30000,HIDDEN=60000;
const missing=(e:unknown)=>/Could not find the function|PGRST202|404/.test(String((e as Error)?.message||e));

/**
 * Staff chat: one-to-one and group conversations that can point at cases, clients, tasks and people. Its button sits
 * in the page header beside the mail and notification icons.
 */
export default function Chat({userId}:{userId:string}){
 const [available,setAvailable]=useState(true),[open,setOpen]=useState(false),[summary,setSummary]=useState<ChatSummary|null>(null);
 const [active,setActive]=useState<string|null>(null),[view,setView]=useState<'list'|'new'|'group'|'info'>('list');
 const unread=summary?.conversations.reduce((n,c)=>n+c.unread,0)||0,lastUnread=useRef(-1);
 const refresh=useCallback(async()=>{try{const s=await chatRequest<ChatSummary>('summary');setSummary(s);
  // A browser notification when new messages arrive while the app is in the background.
  const total=s.conversations.reduce((n,c)=>n+c.unread,0);
  if(lastUnread.current>=0&&total>lastUnread.current&&document.hidden&&'Notification' in window&&Notification.permission==='granted'){const c=s.conversations.find(x=>x.unread>0&&x.last&&!x.last.mine);if(c)new Notification('رسالة جديدة · '+conversationName(c,userId),{body:c.last?.body||'',tag:'mawatheeq-chat'})}
  lastUnread.current=total}catch(e){if(missing(e))setAvailable(false)}},[userId]);
 // A colleague's message arrives at once over the live channel; the timed check is the fallback.
 useEffect(()=>{void startLive()},[]);
 useEffect(()=>{let timer=0;const tick=()=>{void refresh();timer=window.setTimeout(tick,document.hidden?HIDDEN:open?FAST:SLOW)};tick();const wake=()=>{clearTimeout(timer);tick()};addEventListener('focus',wake);addEventListener(LIVE_EVENT.chat,wake);return()=>{clearTimeout(timer);removeEventListener('focus',wake);removeEventListener(LIVE_EVENT.chat,wake)}},[refresh,open]);
 // Escape closes the panel when focus is in it or nowhere in particular (not while a case file or dialog has focus).
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{const a=document.activeElement;if(e.key==='Escape'&&!e.defaultPrevented&&(!a||a===document.body||panel.current?.contains(a))){e.preventDefault();setOpen(false)}};addEventListener('keydown',key);return()=>removeEventListener('keydown',key)},[open]);
 // A name elsewhere in the app (a discussion, for example) opens a one-to-one chat with that colleague.
 useEffect(()=>{const go=async(e:Event)=>{const id=(e as CustomEvent<string>).detail;if(!id||id===userId)return;
  try{const r=await chatRequest<{id:string}>('start_direct',{userId:id});reopenChat(userId,r.id);await refresh();setView('list');setActive(r.id);setOpen(true)}
  catch(err){toast.error(missing(err)?'المحادثات غير مفعّلة بعد.':(err as Error).message)}};
  addEventListener(CHAT_WITH_EVENT,go);return()=>removeEventListener(CHAT_WITH_EVENT,go)},[userId,refresh]);
 const host=useWindowHost(),slot=useChatSlot(),[peek,setPeek]=useState(false);
 // Like the mail: the header button shows the latest conversations, and «فتح المحادثات» (or any of them) opens the
 // chat window, with the list beside the open conversation.
 if(!available)return null;
 const conv=summary?.conversations.find(c=>c.id===active)||null;
 const label=unread?`المحادثات، ${unread} غير مقروءة`:'المحادثات',count=unread>99?'99+':unread;
 const latest=[...(summary?.conversations||[])].filter(c=>c.isMember&&c.last).sort((a,b)=>b.unread-a.unread||Date.parse(b.lastAt)-Date.parse(a.lastAt)).slice(0,6);
 const openWindow=(id?:string)=>{setPeek(false);if(id){reopenChat(userId,id);setActive(id)}setView('list');setOpen(true)};
 const main=conv&&view==='list'?<Conversation key={conv.id} conv={conv} me={userId} onLeave={()=>setOpen(false)} onBack={()=>setActive(null)} onInfo={()=>setView('info')} onChanged={refresh} onDirect={async id=>{const r=await chatRequest<{id:string}>('start_direct',{userId:id});reopenChat(userId,r.id);await refresh();setActive(r.id)}}/>
  :view==='new'||view==='group'?<NewChat group={view==='group'} onCancel={()=>setView('list')} onCreated={async id=>{reopenChat(userId,id);await refresh();setView('list');setActive(id)}}/>
  :view==='info'&&conv?<GroupInfo conv={conv} me={userId} onBack={()=>setView('list')} onChanged={async left=>{await refresh();setView('list');if(left)setActive(null)}}/>
  :<div className="chat-pick"><MessageCircle size={34} aria-hidden/><b>اختر محادثة من القائمة</b><small>أو ابدأ محادثة جديدة مع زميل أو مجموعة.</small><button type="button" className="btn primary" onClick={()=>setView('new')}><Plus size={16}/> ابدأ محادثة</button></div>;
 return <>
  {slot&&createPortal(<Popover open={peek} onOpenChange={setPeek}><PopoverTrigger asChild><button type="button" className={'icon-btn notice-trigger chat-trigger'+(open||peek?' open':'')} aria-label={label} aria-expanded={peek}><MessageCircle/>{unread>0&&<span key={'chat-'+unread} className="notice-count chat-count" aria-hidden="true">{count}</span>}</button></PopoverTrigger>
   <PopoverContent align="end" dir="rtl" className="notice-panel chat-latest"><div className="notice-head"><b>المحادثات</b><small>{unread?`${unread} رسالة غير مقروءة`:'لا رسائل جديدة'}</small></div>
    {latest.length>0?<ul className="notice-list">{latest.map(c=><li key={c.id}><button type="button" className={'notice-item info chat-latest-item'+(c.unread?' unread':'')} onClick={()=>openWindow(c.id)}>
     <span className="chat-avatar" aria-hidden>{c.kind==='group'?<Users size={15}/>:conversationName(c,userId).replace(/^ا[/.]\s*/,'').slice(0,1)}</span>
     <span><b>{conversationName(c,userId)}</b><small>{c.last?(c.last.mine?'أنت: ':c.kind==='group'?c.last.sender+': ':'')+c.last.body:''}</small></span>
     <span className="chat-row-meta"><small>{chatTime(c.lastAt)}</small>{c.unread>0&&<span className="chat-badge inline">{c.unread}</span>}</span></button></li>)}</ul>
     :<p className="chat-latest-empty">لا محادثات بعد.</p>}
    <div className="mail-panel-foot"><button type="button" className="btn" onClick={()=>{setPeek(false);setActive(null);setView('new');setOpen(true)}}><Plus size={15}/> محادثة جديدة</button><button type="button" className="btn primary" onClick={()=>openWindow()}>فتح المحادثات</button></div>
   </PopoverContent></Popover>,slot!)}
  {createPortal(<>
  {open&&<div className={'chat-scrim'+(host?' in-window':'')} onClick={()=>setOpen(false)} aria-hidden/>}
  {open&&<section className={'chat-panel chat-window'+(host?' in-window':'')+(conv&&view==='list'||view!=='list'?' has-main':'')} role="dialog" aria-label="المحادثات" dir="rtl" ref={panel}>
   <aside className="chat-side"><ConversationList key={userId} summary={summary} me={userId} active={active} onOpen={id=>{reopenChat(userId,id);setActive(id);setView('list')}} onNew={()=>setView('new')} onGroup={()=>setView('group')} onClose={()=>setOpen(false)}/></aside>
   <div className="chat-main">{main}</div>
  </section>}
  </>,host??document.body)}
 </>;
}

/** An open record window traps focus and clicks, so the chat lives inside the topmost one while it is open. */
function useWindowHost(){
 const [host,setHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{let frame=0;const pick=()=>{const all=document.querySelectorAll<HTMLElement>('[data-record-window]');setHost(all.length?all[all.length-1]:null)};
  pick();const watch=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(pick)});watch.observe(document.body,{childList:true});
  return()=>{watch.disconnect();cancelAnimationFrame(frame)}},[]);
 return host;
}
/** Conversations closed from the list on this device, with the time of their last message when closed. */
const closedKey=(me:string)=>'mawatheeq.chat-closed.'+me;
const readClosed=(me:string):Record<string,string>=>{try{const v=JSON.parse(localStorage.getItem(closedKey(me))||'{}');return v&&typeof v==='object'?v:{}}catch{return {}}};
const writeClosed=(me:string,next:Record<string,string>)=>{try{localStorage.setItem(closedKey(me),JSON.stringify(next))}catch{/* kept for this visit only */}};
/** Opening a conversation yourself (from search, a new chat or a name) puts it back in the list, like Discord. */
const reopenChat=(me:string,id:string)=>{const c=readClosed(me);if(c[id]){delete c[id];writeClosed(me,c)}};
function ConversationList({summary,me,active,onOpen,onNew,onGroup,onClose}:{summary:ChatSummary|null;me:string;active?:string|null;onOpen:(id:string)=>void;onNew:()=>void;onGroup:()=>void;onClose:()=>void}){
 // Read on every render: the list stays beside the open conversation, and opening or starting a chat elsewhere
 // brings a closed one back.
 const [q,setQ]=useState(''),[,bump]=useState(0),closed=readClosed(me);
 const saveClosed=(next:Record<string,string>)=>{writeClosed(me,next);bump(n=>n+1)};
 // Closing removes a conversation from the list only; its messages stay. It returns when a new message arrives,
 // when you open it again (from a new chat or a name), and searching always finds it.
 const at=(v:string)=>{const t=Date.parse(v);return Number.isNaN(t)?0:t};
 // The mark is the server time of the last message when closed (never this computer's clock, which may run ahead),
 // and a conversation with unread messages always shows.
 const isClosed=(c:ChatConversation)=>!!closed[c.id]&&!c.unread&&at(c.lastAt)<=at(closed[c.id]);
 const matches=(summary?.conversations||[]).filter(c=>(conversationName(c,me)+' '+c.members.map(m=>m.name).join(' ')).includes(q.trim()));
 const list=matches.filter(c=>q.trim()||!isClosed(c));
 const mine=list.filter(c=>c.isMember),review=list.filter(c=>!c.isMember);
 const canNotify='Notification' in window&&Notification.permission==='default';
 const row=(c:ChatConversation)=><div key={c.id} className="chat-row-wrap"><button type="button" aria-current={c.id===active||undefined} className={'chat-row'+(c.unread?' unread':'')+(isClosed(c)?' closed':'')+(c.id===active?' on':'')} onClick={()=>onOpen(c.id)}>
  <span className="chat-avatar" aria-hidden>{c.kind==='group'?<Users size={16}/>:conversationName(c,me).replace(/^ا[/.]\s*/,'').slice(0,1)}</span>
  <span className="chat-row-text"><b>{conversationName(c,me)}</b><small>{c.last?(c.last.kind==='event'?'':c.last.mine?'أنت: ':c.kind==='group'?c.last.sender+': ':'')+c.last.body:'لا رسائل بعد'}</small></span>
  <span className="chat-row-meta"><small>{chatTime(c.lastAt)}</small>{c.unread>0&&<span className="chat-badge inline">{c.unread}</span>}</span></button>
  {!isClosed(c)&&<button type="button" className="chat-row-close" onClick={()=>saveClosed({...closed,[c.id]:c.lastAt})} aria-label={'إغلاق '+conversationName(c,me)} title="إغلاق المحادثة (تبقى محفوظة)"><X size={14}/></button>}</div>;
 return <>
  <header className="chat-head"><h2>المحادثات</h2><div className="chat-head-actions"><button type="button" className="icon-btn" onClick={onNew} aria-label="محادثة جديدة" title="محادثة جديدة"><Plus size={18}/></button><button type="button" className="icon-btn" onClick={onGroup} aria-label="مجموعة جديدة" title="مجموعة جديدة"><Users size={18}/></button><button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق المحادثات"><X size={18}/></button></div></header>
  <div className="chat-search searchbox"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث في المحادثات" aria-label="بحث في المحادثات"/></div>
  <div className="chat-scroll">
   {!summary&&<p className="chat-empty" role="status">جارٍ التحميل…</p>}
   {summary&&!mine.length&&!review.length&&<div className="chat-empty"><p>لا محادثات بعد.</p><button type="button" className="btn primary" onClick={onNew}><Plus size={16}/> ابدأ محادثة</button></div>}
   {mine.map(row)}
   {review.length>0&&<><h3 className="chat-section"><Eye size={14}/> مراجعة المسؤول ({review.length})</h3>{review.map(row)}</>}
  </div>
  <footer className="chat-foot">{canNotify&&<button type="button" className="text-link" onClick={()=>void Notification.requestPermission()}><Bell size={13}/> تفعيل تنبيهات الرسائل</button>}<small>المحادثات خاصة بأعضائها، ويمكن لمسؤول المكتب مراجعتها.</small></footer>
 </>;
}

function Conversation({conv,me,onBack,onInfo,onChanged,onDirect,onLeave}:{onLeave:()=>void;conv:ChatConversation;me:string;onBack:()=>void;onInfo:()=>void;onChanged:()=>void;onDirect:(id:string)=>void}){
 const [messages,setMessages]=useState<ChatMessage[]>([]),[loaded,setLoaded]=useState(false),[text,setText]=useState(''),[refs,setRefs]=useState<ChatRef[]>([]);
 const [viewing,setViewing]=useState<{file:NonNullable<ChatMessage['file']>;url:string}|null>(null);
 const [editing,setEditing]=useState<ChatMessage|null>(null),[busy,setBusy]=useState(false),[file,setFile]=useState<File|null>(null);
 const [trigger,setTrigger]=useState<ReturnType<typeof typedTrigger>>(null),[suggest,setSuggest]=useState<ChatRef[]>([]),[pick,setPick]=useState(0);
 const scroller=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),fileInput=useRef<HTMLInputElement>(null),lastId=useRef(0);
 const readOnly=!conv.isMember;
 // Fetch the conversation, then only what is new every few seconds.
 const load=useCallback(async(full=false)=>{try{
  const fresh=await chatRequest<ChatMessage[]>('messages',{conversationId:conv.id,...(full?{}:{after:lastId.current})});
  if(full)setMessages(fresh);else if(fresh.length)setMessages(m=>[...m.filter(x=>!fresh.some(f=>f.id===x.id)),...fresh]);
  const top=fresh.at(-1)?.id||0;if(top>lastId.current){lastId.current=top;if(conv.isMember)void chatRequest('read',{conversationId:conv.id,lastId:top}).then(onChanged)}
  setLoaded(true)}catch(e){toast.error((e as Error).message)}},[conv.id,conv.isMember,onChanged]);
 useEffect(()=>{lastId.current=0;void load(true);
  // Edits and deletions of recent messages are picked up by a full reload every 30 seconds.
  let n=0;const t=window.setInterval(()=>{if(!document.hidden)void load(++n%6===0)},FAST);const live=()=>void load(false);addEventListener(LIVE_EVENT.chat,live);return()=>{clearInterval(t);removeEventListener(LIVE_EVENT.chat,live)}},[load]);
 useEffect(()=>{const el=scroller.current;if(el)el.scrollTop=el.scrollHeight},[messages.length]);
 useEffect(()=>{if(!trigger){setSuggest([]);return}const t=window.setTimeout(()=>{void chatRequest<ChatRef[]>('search',{q:trigger.query||(trigger.char==='@'?'ا':'')}).then(r=>{setSuggest(triggerRefs(trigger.char,r).slice(0,8));setPick(0)}).catch(()=>setSuggest([]))},trigger.query?220:0);return()=>clearTimeout(t)},[trigger]);
 function onType(v:string){setText(v);const caret=input.current?.selectionStart??v.length;setTrigger(typedTrigger(v,caret));setRefs(r=>r.filter(x=>v.includes(refToken(x))))}
 function choose(r:ChatRef){if(!trigger)return;const before=text.slice(0,trigger.start),after=text.slice(trigger.start+1+trigger.query.length);const token=refToken(r)+' ';
  setText(before+token+after.replace(/^\s/,''));setRefs(x=>[...x.filter(y=>!(y.type===r.type&&y.id===r.id)),{type:r.type,id:r.id,label:r.label}]);setTrigger(null);requestAnimationFrame(()=>input.current?.focus())}
 async function send(){
  const body=text.trim();if(busy||(!body&&!file)||readOnly)return;setBusy(true);
  try{
   if(editing){await chatRequest('edit',{id:editing.id,body,refs});setEditing(null)}
   else{
    let filePath='';
    if(file){const up=await fileRequest('chat_upload',{conversationId:conv.id,name:file.name,size:file.size,mime:file.type}).catch(e=>{throw new Error(/سجل الدخول أولاً/.test(String(e?.message))?'إرفاق الملفات في المحادثات لم يُفعّل على الخادم بعد. أرسل الرسالة دون ملف.':e.message)});
     const {error}=await backend().storage.from('mawatheeq-chat').uploadToSignedUrl(up.path,up.token!,file,{contentType:file.type,upsert:false});if(error)throw new Error('تعذر رفع الملف: '+error.message);filePath=up.path}
    await chatRequest('send',{conversationId:conv.id,clientId:crypto.randomUUID(),body,refs,filePath});
   }
   setText('');setRefs([]);setFile(null);await load(true);onChanged();
  }catch(e){toast.error((e as Error).message)}finally{setBusy(false);requestAnimationFrame(()=>input.current?.focus())}
 }
 function onKey(e:React.KeyboardEvent<HTMLTextAreaElement>){
  if(suggest.length&&trigger){if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setPick(p=>(p+(e.key==='ArrowDown'?1:suggest.length-1))%suggest.length);return}if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();choose(suggest[pick]);return}if(e.key==='Escape'){e.preventDefault();setTrigger(null);return}}
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}
  if(e.key==='Escape'&&editing){e.preventDefault();setEditing(null);setText('');setRefs([])}
 }
 // A pasted screenshot or image is attached like a chosen file; pasted text pastes as usual.
 function onPaste(e:React.ClipboardEvent<HTMLTextAreaElement>){const f=[...e.clipboardData.files].find(x=>x.type.startsWith('image/'));if(!f||readOnly)return;e.preventDefault();
  const stamp=new Date().toISOString().slice(0,19).replace('T',' ').replace(/:/g,'-'),name=!f.name||/^image\.\w+$/i.test(f.name)?`لقطة شاشة ${stamp}.${f.type.split('/')[1]||'png'}`:f.name;attach(new File([f],name,{type:f.type}))}
 function attach(f:File|undefined){if(!f)return;if(f.size>MAX_FILE){toast.error('حجم الملف يجب ألا يتجاوز 5 ميغابايت.');return}if(!FILE_TYPES.includes(f.type)){toast.error('الصور وPDF وWord وExcel فقط.');return}setFile(f)}
 // Images and PDFs open in a viewer in the middle of the app; other files download.
 async function download(f:NonNullable<ChatMessage['file']>){try{if(viewable(f)){setViewing({file:f,url:''});const r=await fileRequest('chat_download',{path:f.path,name:f.name});setViewing(v=>v?.file.path===f.path?{file:f,url:r.url||''}:v);return}
  const r=await fileRequest('chat_download',{path:f.path,name:f.name,download:true});window.open(r.url,'_blank','noopener')}catch(e){setViewing(null);toast.error((e as Error).message)}}
 function openRef(r:ChatRef){if(!r.ok){toast.info('لا تملك صلاحية فتح هذا السجل.');return}if(r.type==='user'){if(r.id!==me)onDirect(r.id);return}requestOpen({type:r.type,id:r.id});onLeave()}
 const name=conversationName(conv,me);
 return <>
  {viewing&&<FileViewer file={viewing.file} url={viewing.url} onClose={()=>setViewing(null)}/>}
  <header className="chat-head"><button type="button" className="icon-btn" onClick={onBack} aria-label="رجوع إلى المحادثات"><ArrowRight size={18}/></button>
   <div className="chat-title"><b>{name}</b><small>{conv.kind==='group'?conv.members.map(m=>m.name).join('، '):readOnly?'مراجعة المسؤول':'محادثة خاصة'}</small></div>
   {conv.kind==='group'&&conv.isMember&&<button type="button" className="icon-btn" onClick={onInfo} aria-label="إدارة المجموعة"><UserPlus size={18}/></button>}
   </header>
  <div className="chat-scroll chat-messages" ref={scroller} aria-live="polite">
   {!loaded&&<p className="chat-empty" role="status">جارٍ التحميل…</p>}
   {loaded&&!messages.length&&<p className="chat-empty">ابدأ المحادثة. اكتب # للإشارة إلى قضية أو موكل أو مهمة، و@ لزميل.</p>}
   {messages.map((m,i)=>m.kind==='event'?<p key={m.id} className="chat-event">{m.body}</p>:
    <article key={m.id} className={'chat-msg'+(m.mine?' mine':'')+(m.deleted?' deleted':'')}>
     {!m.mine&&(i===0||messages[i-1].senderId!==m.senderId||messages[i-1].kind==='event')&&<b className="chat-sender">{m.senderName}</b>}
     {m.deleted?<p className="muted">حُذفت هذه الرسالة</p>:<p>{bodyParts(m.body,m.refs).map((p,k)=>typeof p==='string'?<span key={k}>{p}</span>:<button type="button" key={k} className={'chat-ref '+p.type+(p.ok?'':' locked')} onClick={()=>openRef(p)} title={p.ok?'فتح':'غير متاح لك'}>{refToken(p)}</button>)}</p>}
     {m.file&&!m.deleted&&<button type="button" className="chat-file" onClick={()=>void download(m.file!)}><FileText size={16}/><span>{m.file.name}<small>{fileSize(m.file.size)}</small></span></button>}
     <footer><small>{chatTime(m.createdAt)}{m.editedAt?' · عُدّلت':''}</small>{m.editable&&!readOnly&&<span className="chat-msg-actions"><button type="button" className="icon-btn" aria-label="تعديل الرسالة" onClick={()=>{setEditing(m);setText(m.body);setRefs(m.refs.filter(r=>r.ok));setFile(null);input.current?.focus()}}><Pencil size={13}/></button><button type="button" className="icon-btn" aria-label="حذف الرسالة" onClick={()=>{if(window.confirm('حذف هذه الرسالة؟'))void chatRequest('delete',{id:m.id}).then(()=>load(true)).catch(e=>toast.error(e.message))}}><Trash2 size={13}/></button></span>}</footer>
    </article>)}
  </div>
  {readOnly?<footer className="chat-foot"><small><Eye size={13}/> تراجع هذه المحادثة بصفتك مسؤول المكتب؛ لا يمكنك الكتابة فيها.</small></footer>:
  <form className="chat-compose" onSubmit={e=>{e.preventDefault();void send()}}>
   {editing&&<div className="chat-editing"><Pencil size={13}/> تعديل الرسالة <button type="button" className="text-link" onClick={()=>{setEditing(null);setText('');setRefs([])}}>إلغاء</button></div>}
   {file&&<div className="chat-editing"><Paperclip size={13}/> {file.name} · {fileSize(file.size)} <button type="button" className="text-link" onClick={()=>setFile(null)}>إزالة</button></div>}
   {trigger&&suggest.length>0&&<ul className="chat-suggest" role="listbox" aria-label="اقتراحات">{suggest.map((s,i)=><li key={s.type+s.id} role="option" aria-selected={i===pick}><button type="button" onMouseDown={e=>{e.preventDefault();choose(s)}}><b>{refToken(s)}</b><small>{s.sub}</small></button></li>)}</ul>}
   <div className="chat-compose-row">
    {!editing&&<><input ref={fileInput} type="file" hidden accept={FILE_TYPES.join(',')} onChange={e=>{attach(e.target.files?.[0]);e.target.value=''}}/><button type="button" className="icon-btn" aria-label="إرفاق ملف" onClick={()=>fileInput.current?.click()}><Paperclip size={18}/></button></>}
    <textarea ref={input} rows={1} value={text} onPaste={onPaste} onChange={e=>onType(e.target.value)} onKeyDown={onKey} onClick={e=>setTrigger(typedTrigger(text,e.currentTarget.selectionStart))} placeholder="اكتب رسالة… # كود قضية أو موكل أو مهمة، ! رقم آلي، @ زميل" aria-label="نص الرسالة" maxLength={4000}/>
    <button type="submit" className="btn primary chat-send" disabled={busy||(!text.trim()&&!file)} aria-label={editing?'حفظ التعديل':'إرسال'}><Send size={17}/></button>
   </div>
  </form>}
 </>;
}

const viewable=(f:NonNullable<ChatMessage['file']>)=>/^image\//.test(f.mime)||f.mime==='application/pdf'||/\.(png|jpe?g|gif|webp|pdf)$/i.test(f.name);

/** A chat image or PDF shown over the app, centred, instead of a new browser tab. Esc or a click outside closes it. */
function FileViewer({file,url,onClose}:{file:NonNullable<ChatMessage['file']>;url:string;onClose:()=>void}){
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose()}};window.addEventListener('keydown',k,true);return()=>window.removeEventListener('keydown',k,true)},[onClose]);
 const pdf=file.mime==='application/pdf'||/\.pdf$/i.test(file.name);
 async function save(){try{const r=await fileRequest('chat_download',{path:file.path,name:file.name,download:true});if(r.url)window.location.assign(r.url)}catch(e){toast.error((e as Error).message)}}
 return createPortal(<div className="chat-viewer" role="dialog" aria-modal="true" aria-label={file.name} dir="rtl" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="chat-viewer-bar"><b title={file.name}>{file.name}</b><small>{fileSize(file.size)}</small>
   <button type="button" className="icon-btn" onClick={()=>void save()} aria-label="تنزيل الملف" title="تنزيل"><Download size={18}/></button>
   <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق" title="إغلاق (Esc)"><X size={18}/></button></div>
  {!url?<p className="chat-viewer-wait" role="status">جارٍ التحميل…</p>:pdf?<iframe className="chat-viewer-pdf" src={url} title={file.name}/>:<img src={url} alt={file.name} onClick={e=>e.stopPropagation()}/>}
 </div>,document.body);
}

function NewChat({group,onCancel,onCreated}:{group:boolean;onCancel:()=>void;onCreated:(id:string)=>void}){
 const [people,setPeople]=useState<ChatPerson[]|null>(null),[q,setQ]=useState(''),[chosen,setChosen]=useState<string[]>([]),[title,setTitle]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{void chatRequest<ChatPerson[]>('people').then(setPeople).catch(e=>toast.error(e.message))},[]);
 const shown=useMemo(()=>(people||[]).filter(p=>(p.name+' '+p.username).includes(q.trim())),[people,q]);
 async function start(id?:string){setBusy(true);try{const r=group?await chatRequest<{id:string}>('create_group',{title,memberIds:chosen}):await chatRequest<{id:string}>('start_direct',{userId:id});onCreated(r.id)}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <>
  <header className="chat-head"><button type="button" className="icon-btn" onClick={onCancel} aria-label="رجوع"><ArrowRight size={18}/></button><div className="chat-title"><b>{group?'مجموعة جديدة':'محادثة جديدة'}</b><small>{group?'اختر اسماً وأعضاء':'اختر زميلاً'}</small></div></header>
  {group&&<label className="field chat-field"><span>اسم المجموعة</span><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={80} placeholder="مثلاً: قضايا زين"/></label>}
  <div className="chat-search searchbox"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث باسم الزميل" aria-label="بحث عن زميل"/></div>
  <div className="chat-scroll">{!people&&<p className="chat-empty" role="status">جارٍ التحميل…</p>}
   {shown.map(p=>group?<label key={p.id} className="chat-row"><input type="checkbox" checked={chosen.includes(p.id)} onChange={e=>setChosen(c=>e.target.checked?[...c,p.id]:c.filter(x=>x!==p.id))}/><span className="chat-row-text"><b>{p.name}</b><small dir="ltr">@{p.username}</small></span></label>
    :<button type="button" key={p.id} className="chat-row" disabled={busy} onClick={()=>void start(p.id)}><span className="chat-avatar" aria-hidden>{p.name.replace(/^ا[/.]\s*/,'').slice(0,1)}</span><span className="chat-row-text"><b>{p.name}</b><small dir="ltr">@{p.username}</small></span></button>)}</div>
  {group&&<footer className="chat-foot"><button type="button" className="btn primary" disabled={busy||!title.trim()||!chosen.length} onClick={()=>void start()}>إنشاء المجموعة ({chosen.length})</button></footer>}
 </>;
}

function GroupInfo({conv,me,onBack,onChanged}:{conv:ChatConversation;me:string;onBack:()=>void;onChanged:(left:boolean)=>void}){
 const [people,setPeople]=useState<ChatPerson[]>([]),[title,setTitle]=useState(conv.title),[adding,setAdding]=useState<string[]>([]),[busy,setBusy]=useState(false);
 useEffect(()=>{void chatRequest<ChatPerson[]>('people').then(setPeople).catch(()=>undefined)},[]);
 const others=people.filter(p=>!conv.members.some(m=>m.id===p.id));
 const run=async(action:string,data:Record<string,unknown>,left=false)=>{setBusy(true);try{await chatRequest(action,{conversationId:conv.id,...data});onChanged(left)}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}};
 return <>
  <header className="chat-head"><button type="button" className="icon-btn" onClick={onBack} aria-label="رجوع"><ArrowRight size={18}/></button><div className="chat-title"><b>إدارة المجموعة</b><small>{conv.members.length} أعضاء</small></div></header>
  <div className="chat-scroll chat-info">
   <form className="chat-inline" onSubmit={e=>{e.preventDefault();if(title.trim()&&title!==conv.title)void run('rename',{title})}}><label className="field chat-field"><span>اسم المجموعة</span><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={80}/></label><button className="btn" disabled={busy||!title.trim()||title===conv.title}>حفظ الاسم</button></form>
   <h3 className="chat-section">الأعضاء</h3><ul className="chat-members">{conv.members.map(m=><li key={m.id}>{m.name}{m.id===me?' (أنت)':''}</li>)}</ul>
   {others.length>0&&<><h3 className="chat-section">إضافة أعضاء</h3>{others.map(p=><label key={p.id} className="chat-row"><input type="checkbox" checked={adding.includes(p.id)} onChange={e=>setAdding(a=>e.target.checked?[...a,p.id]:a.filter(x=>x!==p.id))}/><span className="chat-row-text"><b>{p.name}</b></span></label>)}
    <button type="button" className="btn primary" disabled={busy||!adding.length} onClick={()=>void run('add_members',{memberIds:adding})}><UserPlus size={15}/> إضافة ({adding.length})</button></>}
   <button type="button" className="btn chat-leave" disabled={busy} onClick={()=>{if(window.confirm('مغادرة المجموعة؟ لن ترى رسائلها بعد ذلك.'))void run('leave',{},true)}}><LogOut size={15}/> مغادرة المجموعة</button>
  </div>
 </>;
}
