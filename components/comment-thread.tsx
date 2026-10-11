import {useEffect,useState} from 'react';
import {MessageSquare,Send,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {commentRequest} from '@/lib/local-auth';
import type {Comment,CommentTarget} from '@/lib/comments';

const time=(iso:string)=>new Intl.DateTimeFormat('ar-KW',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuwait'}).format(new Date(iso));
/** Staff discussion for one case or task. The server enforces who can read, post, mention and delete. */
export default function CommentThread({target,userId,isOwner,canPost}:{target:CommentTarget;userId:string;isOwner:boolean;canPost:boolean}) {
 const [comments,setComments]=useState<Comment[]|null>(null),[people,setPeople]=useState<{id:string;username:string}[]>([]),[body,setBody]=useState(''),[mentions,setMentions]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const {targetType,targetId}=target;
 useEffect(()=>{let active=true;
  Promise.all([commentRequest<Comment[]>('list',{targetType,targetId}),canPost?commentRequest<{id:string;username:string}[]>('mentionable',{targetType,targetId}):[]])
   .then(([list,who])=>{if(active){setComments(list);setPeople(who)}}).catch(e=>{if(active)setError(e.message)});
  return()=>{active=false}},[targetType,targetId,canPost]);
 async function post(e:React.FormEvent){e.preventDefault();if(!body.trim())return;setBusy(true);setError('');
  try{const saved=await commentRequest<Comment>('post',{targetType,targetId,body,mentions});setComments(list=>[...(list||[]),saved]);setBody('');setMentions([])}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function remove(c:Comment){try{const saved=await commentRequest<Comment>('delete',{id:c.id});setComments(list=>(list||[]).map(x=>x.id===c.id?saved:x));toast.success('حُذف التعليق')}catch(e){toast.error((e as Error).message)}}
 return <section className="comment-thread" aria-label="النقاش الداخلي"><h3><MessageSquare size={17}/> النقاش الداخلي</h3>
  {error&&<p className="notice" role="alert">{error}</p>}
  {!comments?(!error&&<p role="status" className="muted">جارٍ تحميل التعليقات…</p>):!comments.length?<p className="muted">لا توجد تعليقات بعد. اكتب ملاحظة للفريق أو أشر إلى زميل.</p>:
  <ol className="comment-list">{comments.map(c=><li key={c.id} className={c.deleted?'deleted':''}><div className="comment-meta"><b>{c.author}</b><time dateTime={c.createdAt}>{time(c.createdAt)}</time>{!c.deleted&&(c.authorId===userId||isOwner)&&<button className="icon-btn" aria-label="حذف التعليق" onClick={()=>void remove(c)}><Trash2 size={14}/></button>}</div>
   {c.deleted?<p className="muted">حُذف هذا التعليق.</p>:<><p className="comment-body">{c.body}</p>{c.mentions.length>0&&<p className="comment-mentions">{c.mentions.map(m=><span key={m.id} className="tag" dir="ltr">@{m.username}</span>)}</p>}</>}</li>)}</ol>}
  {canPost?<form className="comment-form" onSubmit={post}><label className="field"><span>تعليق جديد</span><textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={4000} rows={3} placeholder="اكتب ملاحظة أو سؤالاً للفريق…"/></label>
   {people.length>0&&<fieldset className="mention-picker"><legend>إشارة إلى (يصلهم تنبيه)</legend>{people.map(p=><label key={p.id} className="mention-chip"><input type="checkbox" checked={mentions.includes(p.id)} onChange={e=>setMentions(m=>e.target.checked?[...m,p.id]:m.filter(x=>x!==p.id))}/><span dir="ltr">@{p.username}</span></label>)}</fieldset>}
   <button className="btn primary" disabled={busy||!body.trim()}><Send size={15}/> {busy?'جارٍ الإرسال…':'إرسال التعليق'}</button></form>
  :<p className="muted">حسابك للقراءة فقط؛ يمكنك متابعة النقاش دون إضافة تعليقات.</p>}
 </section>;
}
