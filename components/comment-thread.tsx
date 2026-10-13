import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronDown,ChevronLeft,MessageSquare,Reply,Send,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {chatRequest,commentRequest} from '@/lib/local-auth';
import {requestOpen} from '@/lib/open-record';
import {bodyParts,refToken,requestChat,triggerRefs,typedTrigger,type ChatRef} from '@/lib/chat';
import type {Comment,CommentPerson,CommentTarget} from '@/lib/comments';

const time=(iso:string)=>new Intl.DateTimeFormat('ar-KW',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuwait'}).format(new Date(iso));
const shown=(p:CommentPerson)=>p.name||p.username;
type Node=Comment&{replies:Node[]};
/** Replies sit under the comment they answer, like a forum thread; a reply whose parent is unknown stays at the top. */
function tree(list:Comment[]):Node[]{
 const nodes=new Map<number,Node>(list.map(c=>[c.id,{...c,replies:[]}])),roots:Node[]=[];
 for(const n of nodes.values()){const parent=n.parentId?nodes.get(n.parentId):undefined;if(parent)parent.replies.push(n);else roots.push(n)}
 return roots;
}
const count=(n:Node):number=>n.replies.reduce((s,r)=>s+1+count(r),0);

/** Staff discussion for one case or task. The server enforces who can read, post, mention, cite and delete. */
export default function CommentThread({target,userId,isOwner,canPost}:{target:CommentTarget;userId:string;isOwner:boolean;canPost:boolean}) {
 const [comments,setComments]=useState<Comment[]|null>(null),[people,setPeople]=useState<CommentPerson[]>([]),[error,setError]=useState(''),[replyTo,setReplyTo]=useState<number|null>(null),[folded,setFolded]=useState<Set<number>>(new Set());
 const {targetType,targetId}=target;
 useEffect(()=>{let active=true;
  Promise.all([commentRequest<Comment[]>('list',{targetType,targetId}),canPost?commentRequest<CommentPerson[]>('mentionable',{targetType,targetId}):[]])
   .then(([list,who])=>{if(active){setComments(list);setPeople(who)}}).catch(e=>{if(active)setError(e.message)});
  return()=>{active=false}},[targetType,targetId,canPost]);
 const roots=useMemo(()=>tree(comments||[]),[comments]);
 async function remove(c:Comment){try{const saved=await commentRequest<Comment>('delete',{id:c.id});setComments(list=>(list||[]).map(x=>x.id===c.id?{...x,...saved}:x));toast.success('حُذف التعليق')}catch(e){toast.error((e as Error).message)}}
 const posted=(c:Comment)=>{setComments(list=>[...(list||[]),c]);setReplyTo(null)};
 // A name opens a chat with that colleague; a case, client or task opens its file.
 function openRef(r:ChatRef){if(r.type==='user'){if(r.id!==userId)requestChat(r.id);return}if(!r.ok){toast.info('لا تملك صلاحية فتح هذا السجل.');return}requestOpen({type:r.type,id:r.id})}
 const item=(c:Node,depth:number):React.ReactNode=>{const hidden=folded.has(c.id),n=count(c);
  const refs=[...(c.refs||[]),...c.mentions.map(m=>({type:'user' as const,id:m.id,label:shown(m),ok:true}))];
  return <li key={c.id} className={c.deleted?'deleted':''}>
   <div className="comment-meta">
    {c.authorId===userId?<b>{c.authorName||c.author}</b>:<button type="button" className="comment-author" onClick={()=>requestChat(c.authorId)} title="مراسلة">{c.authorName||c.author}</button>}
    {c.authorName&&c.authorName!==c.author&&<small dir="ltr">@{c.author}</small>}
    <time dateTime={c.createdAt}>{time(c.createdAt)}</time>
    {!c.deleted&&(c.authorId===userId||isOwner)&&<button className="icon-btn" aria-label="حذف التعليق" onClick={()=>void remove(c)}><Trash2 size={14}/></button>}</div>
   {c.deleted?<p className="muted">حُذف هذا التعليق.</p>:<p className="comment-body">{bodyParts(c.body,refs).map((p,k)=>typeof p==='string'?<span key={k}>{p}</span>:
    <button type="button" key={k} className={'chat-ref '+p.type+(p.ok?'':' locked')} onClick={()=>openRef(p)} title={p.type==='user'?(p.id===userId?'أنت':'مراسلة'):p.ok?'فتح':'غير متاح لك'}>{refToken(p)}</button>)}</p>}
   <div className="comment-actions">
    {canPost&&!c.deleted&&<button type="button" className="text-link" onClick={()=>setReplyTo(replyTo===c.id?null:c.id)}><Reply size={13}/> رد</button>}
    {n>0&&<button type="button" className="text-link" aria-expanded={!hidden} onClick={()=>setFolded(f=>{const x=new Set(f);if(x.has(c.id))x.delete(c.id);else x.add(c.id);return x})}>{hidden?<ChevronLeft size={13}/>:<ChevronDown size={13}/>} {hidden?`عرض ${n===1?'الرد':n+' ردود'}`:'إخفاء الردود'}</button>}</div>
   {replyTo===c.id&&<Composer target={target} parentId={c.id} people={people} label={'الرد على '+(c.authorName||c.author)} onPosted={posted} onCancel={()=>setReplyTo(null)}/>}
   {n>0&&!hidden&&<ol className={'comment-list comment-replies'+(depth>=4?' flat':'')}>{c.replies.map(r=>item(r,depth+1))}</ol>}
  </li>};
 return <section className="comment-thread" aria-label="النقاش الداخلي"><h3><MessageSquare size={17}/> النقاش الداخلي</h3>
  {error&&<p className="notice" role="alert">{error}</p>}
  {!comments?(!error&&<p role="status" className="muted">جارٍ تحميل التعليقات…</p>):!comments.length?<p className="muted">لا توجد تعليقات بعد. اكتب ملاحظة للفريق، وأشر إلى زميل بـ @ وإلى قضية بـ # أو !.</p>:
  <ol className="comment-list">{roots.map(c=>item(c,0))}</ol>}
  {canPost?<Composer target={target} people={people} label="تعليق جديد" onPosted={posted}/>
  :<p className="muted">حسابك للقراءة فقط؛ يمكنك متابعة النقاش دون إضافة تعليقات.</p>}
 </section>;
}

/** Writing a comment or a reply: «@» a colleague (they are notified), «#» a case by office code, a client or a task, «!» a case by automatic number. */
function Composer({target,parentId,people,label,onPosted,onCancel}:{target:CommentTarget;parentId?:number;people:CommentPerson[];label:string;onPosted:(c:Comment)=>void;onCancel?:()=>void}){
 const [text,setText]=useState(''),[refs,setRefs]=useState<ChatRef[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [trigger,setTrigger]=useState<ReturnType<typeof typedTrigger>>(null),[pick,setPick]=useState(0);
 const input=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{if(parentId)input.current?.focus()},[parentId]);
 const [found,setFound]=useState<ChatRef[]>([]);
 // «@» offers colleagues who can see this record; «#» and «!» search cases, clients and tasks as chat does.
 const suggest=useMemo(()=>{if(!trigger)return [];if(trigger.char!=='@')return found;const q=trigger.query.toLowerCase();
  return people.filter(p=>(shown(p)+' '+p.username).toLowerCase().includes(q)).slice(0,8).map(p=>({type:'user' as const,id:p.id,label:shown(p),sub:'@'+p.username}))},[trigger,found,people]);
 useEffect(()=>{if(!trigger||trigger.char==='@')return;
  const t=window.setTimeout(()=>{void chatRequest<ChatRef[]>('search',{q:trigger.query}).then(r=>{setFound(triggerRefs(trigger.char,r).slice(0,8));setPick(0)}).catch(()=>setFound([]))},trigger.query?220:0);
  return()=>clearTimeout(t)},[trigger]);
 function onType(v:string){setText(v);const next=typedTrigger(v,input.current?.selectionStart??v.length);if(next?.char!==trigger?.char){setFound([]);setPick(0)}setTrigger(next);setRefs(r=>r.filter(x=>v.includes(refToken(x))))}
 function choose(r:ChatRef){if(!trigger)return;const token=refToken(r)+' ',next=text.slice(0,trigger.start)+token+text.slice(trigger.start+1+trigger.query.length);
  setText(next);setRefs(x=>[...x.filter(y=>!(y.type===r.type&&y.id===r.id&&y.label===r.label)),r]);setTrigger(null);
  requestAnimationFrame(()=>{const el=input.current;if(el){const at=trigger.start+token.length;el.focus();el.setSelectionRange(at,at)}})}
 function onKey(e:React.KeyboardEvent<HTMLTextAreaElement>){
  if(suggest.length&&trigger){if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setPick(p=>(p+(e.key==='ArrowDown'?1:suggest.length-1))%suggest.length);return}if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();choose(suggest[pick]);return}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setTrigger(null);return}}
  if(e.key==='Escape'&&onCancel){e.preventDefault();e.stopPropagation();onCancel()}
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void post()}
 }
 async function post(){if(!text.trim()||busy)return;setBusy(true);setError('');
  const used=refs.filter(r=>text.includes(refToken(r)));
  try{const saved=await commentRequest<Comment>('post',{...target,body:text,parentId:parentId??null,mentions:[...new Set(used.filter(r=>r.type==='user').map(r=>r.id))],refs:used.filter(r=>r.type!=='user').map(({type,id,label})=>({type,id,label}))});
   onPosted(saved);setText('');setRefs([])}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <form className={'comment-form'+(parentId?' reply':'')} onSubmit={e=>{e.preventDefault();void post()}}>
  {error&&<p className="notice" role="alert">{error}</p>}
  <label className="field"><span>{label}</span><textarea ref={input} value={text} onChange={e=>onType(e.target.value)} onKeyDown={onKey} onClick={e=>setTrigger(typedTrigger(text,e.currentTarget.selectionStart))} onBlur={()=>setTimeout(()=>setTrigger(null),150)} maxLength={4000} rows={parentId?2:3} placeholder="اكتب ملاحظة… @ زميل، # كود قضية أو موكل أو مهمة، ! رقم آلي"/></label>
  {trigger&&suggest.length>0&&<ul className="chat-suggest comment-suggest" role="listbox" aria-label="اقتراحات">{suggest.map((s,i)=><li key={s.type+s.id+s.label} role="option" aria-selected={i===pick}><button type="button" onMouseDown={e=>{e.preventDefault();choose(s)}}><b>{refToken(s)}</b><small>{s.sub}</small></button></li>)}</ul>}
  {trigger?.char==='@'&&!suggest.length&&<p className="muted comment-hint">لا يوجد زميل بهذا الاسم يملك صلاحية هذا السجل.</p>}
  <div className="comment-form-actions"><button className="btn primary" disabled={busy||!text.trim()}><Send size={15}/> {busy?'جارٍ الإرسال…':parentId?'إرسال الرد':'إرسال التعليق'}</button>
   {onCancel&&<button type="button" className="btn" onClick={onCancel}>إلغاء</button>}<small className="muted">Ctrl+Enter للإرسال</small></div>
 </form>;
}
