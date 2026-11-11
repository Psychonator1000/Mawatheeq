'use client';
import {useContext,useEffect,useMemo,useState} from 'react';
import {toast} from 'sonner';
import {Search,X} from 'lucide-react';
import {dailyRequest,officeRequest,switchToUser} from '@/lib/local-auth';
import {copyText} from '@/lib/polyfills';
import {generatePassword} from '@/lib/staff-accounts';
import {ADMIN_POWERS,JOB_ROLES,NO_ACCESS,SECTIONS,WORKSPACE_LABELS,rolesLabel,combinedPreset,powersOf,workspacesOf,type AdminPower,type JobRole,type Permissions} from '@/lib/permissions';
import type {OfficeContext,Member} from '@/lib/office';
import type {CaseRecord} from '@/lib/domain';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import PermissionEditor,{inferRoles,ROLE_ICONS} from './permission-editor';
import {lawyerLabels,lawyerKey,matchLawyer,visibleCases} from '@/lib/lawyer-match';
import {officeTime} from './office-shared';
import {AccountContext} from './account-menu';
import LawyerAccounts from './lawyer-accounts';
import BulkAccess from './bulk-access';
import OrgTree from './org-tree';
import {FilterBox} from './filter-select';
import {EMPTY_CHART,isOnline,movedParents,nodesBelow,parents,peopleBelow,peopleCount,sectionsFor,workspacesFor,type TeamArea,type TeamChart,type TeamInfo,type Workspace} from '@/lib/team';
import AreaEditor,{type AreaDraft} from './area-editor';

type AccessChange={id:number;before:Permissions|null;after:Permissions;revision:number;actor:string;createdAt:string};
type Mode='permissions'|'password'|'rename'|'role';
/** Server versions before the account-administration update do not know these actions yet. */
/** «لا قضايا محددة، قضية واحدة محددة، قضيتان محددتان، 3 قضايا محددة، 11 قضية محددة». */
const selectedCases=(n:number)=>n===0?'لا قضايا محددة':n===1?'قضية واحدة محددة':n===2?'قضيتان محددتان':n%100>=3&&n%100<=10?`${n} قضايا محددة`:`${n} قضية محددة`;
const friendly=(e:unknown)=>{const m=(e as Error).message;return /العملية المطلوبة غير متاحة/.test(m)?'هذه الميزة تحتاج تحديث قاعدة البيانات أولاً.':m};
export default function OfficeStaff({context,records,onChanged,powers}:{context:OfficeContext;records:CaseRecord[];onChanged:()=>void;powers:AdminPower[]}) {
 const [bulk,setBulk]=useState(false);
 // The page is the office's tree by default («الهيكل»); «القائمة» is the table, for searching and the long details.
 const [view,setView]=useState<'tree'|'list'>(()=>{try{return localStorage.getItem('mawatheeq.staff-view.v1')==='list'?'list':'tree'}catch{return 'tree'}});
 const show=(v:'tree'|'list')=>{setView(v);try{localStorage.setItem('mawatheeq.staff-view.v1',v)}catch{/* this visit only */}};
 const [chart,setChart]=useState<TeamChart>(EMPTY_CHART),[person,setPerson]=useState<Member|null>(null),[areaEdit,setAreaEdit]=useState<TeamArea|'new'|'branch'|null>(null),[treeBusy,setTreeBusy]=useState(false);
 useEffect(()=>{let on=true;dailyRequest<TeamInfo>('team').then(t=>{if(on)setChart({lines:t.lines,areas:t.areas||[],extras:t.extras||[],order:t.order||{},layout:t.layout||{},flow:t.flow||{},bosses:t.bosses||[],seen:t.seen||{},now:t.now})}).catch(()=>{});
  // Who is online, read again every 45 seconds while the page is in front (only that, so nothing being arranged is undone).
  const timer=setInterval(()=>{if(document.hidden)return;dailyRequest<TeamInfo>('team').then(t=>{if(on)setChart(c=>({...c,seen:t.seen||{},now:t.now}))}).catch(()=>{})},45000);
  return()=>{on=false;clearInterval(timer)}},[]);
 const parent=useMemo(()=>parents(chart),[chart]);
 const [choice,setChoice]=useState<{node:string;target:string}|null>(null);
 // The person panel beside the tree closes with Escape (a list open inside it closes first, by itself).
 useEffect(()=>{if(!person)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('[role=dialog][data-state=open]'))setPerson(null)};addEventListener('keydown',key);return()=>removeEventListener('keydown',key)},[person]);
 const [editing,setEditing]=useState<Member|'new'|null>(null),[mode,setMode]=useState<Mode>('permissions'),[mustChange,setMustChange]=useState(false);
 const account=useContext(AccountContext);
 const [lawyers,setLawyers]=useState(false),[showPassword,setShowPassword]=useState(false),[issued,setIssued]=useState<{username:string;password:string}|null>(null);
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[access,setAccess]=useState<Permissions>(NO_ACCESS),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [history,setHistory]=useState<AccessChange[]>([]),[historyError,setHistoryError]=useState('');
 const [newRoles,setNewRoles]=useState<JobRole[]>([]),[applyPreset,setApplyPreset]=useState(false);
 const [staffSearch,setStaffSearch]=useState(''),[displayName,setDisplayName]=useState(''),[typedName,setTypedName]=useState('');
 const shownMembers=context.members.filter(m=>lawyerKey([m.username,m.displayName,...(m.permissions?.lawyerNames||[])].join(' ')).includes(lawyerKey(staffSearch)));
 if(!context.canManage)return null;
 const nameOf=(id?:string|null)=>{const m=context.members.find(x=>x.id===id);return m?m.displayName||m.username:''};
 const areaOf=(id?:string|null)=>chart.areas.find(a=>a.id===id);
 const labelOf=(key?:string|null)=>!key?'':key.startsWith('a:')?`قسم «${areaOf(key.slice(2))?.name||''}»`:nameOf(key.slice(2));
 const place=(key:string|null)=>({user:key?.startsWith('u:')?key.slice(2):null,area:key?.startsWith('a:')?key.slice(2):null});
 // A section standing for a workspace opens that workspace to everyone in it, and a person added to other sections as
 // well opens theirs too: any change to the tree that changes the workspaces someone opens saves their pages through the
 // usual permission save, which ends their sessions so it holds at once. Anyone whose workspaces stay the same (people
 // outside every such section included) is left as they are.
 const wsLabel=(ws:Workspace[])=>ws.length?ws.map(w=>WORKSPACE_LABELS[w].split(' (')[0]).join(' و')+' فقط':'لا مساحة عمل';
 const changesFor=(nextParent:Map<string,string>,next:TeamChart)=>context.members.filter(m=>m.role!=='owner'&&m.permissions&&m.permissions.accountKind!=='client')
  .map(m=>({m,from:workspacesFor(parent,chart,m.id),to:workspacesFor(nextParent,next,m.id)})).filter(x=>x.from.join()!==x.to.join());
 type Change=ReturnType<typeof changesFor>[number];
 // No question first (the owner asked): the change is made, and the message after it says whose workspaces changed to what.
 async function applyChanges(list:Change[]){if(!list.length)return;const failed:string[]=[];
  for(const {m,to} of list){const p=m.permissions!,view={...(p.view||{})};for(const w of to)delete view['ws:'+w];
   try{await officeRequest('set_member_access',{id:m.id,revision:p.revision,permissions:{...p,sections:sectionsFor(p,to),view}})}catch(e){failed.push(`${m.displayName||m.username}: ${friendly(e)}`)}}
  onChanged();if(failed.length)toast.error('لم تُحدَّث صفحات:\n'+failed.join('\n'));else toast.success(`حُدّثت صفحاتهم لمساحات أقسامهم (تنتهي جلساتهم الحالية):\n${list.map(x=>`• ${x.m.displayName||x.m.username}: ${wsLabel(x.to)}`).join('\n')}`)}
 // Dropping someone on a section of another workspace asks whether they move there or are added to it as well.
 function drop(node:string,target:string|null){
  const area=target?.startsWith('a:')?areaOf(target.slice(2)):undefined;
  // A person who already has a place, dropped on another section (with a workspace or not): move him there, or add him to it too.
  if(node.startsWith('u:')&&area&&parent.get(node)&&!(chart.extras||[]).some(x=>x.userId===node.slice(2)&&x.areaId===area.id)){setChoice({node,target:target!});return}
  // A person dropped on a person while he already has a place: he moves under him, or answers to him as well.
  if(node.startsWith('u:')&&target?.startsWith('u:')&&parent.get(node)&&!(chart.bosses||[]).some(x=>'u:'+x.userId===node&&'u:'+x.managerId===target)){setChoice({node,target});return}
  void move(node,target);
 }
 // Moving a box moves everything under it; the server refuses putting anything under something it holds.
 async function move(node:string,target:string|null):Promise<boolean>{
  const nextChart={...chart,extras:(chart.extras||[]).filter(x=>!(node==='u:'+x.userId&&target==='a:'+x.areaId))};
  const changes=changesFor(movedParents(parent,node,target),nextChart);
  const to=place(target);setTreeBusy(true);
  try{setChart(node.startsWith('u:')?await dailyRequest<TeamChart>('set_manager',{userId:node.slice(2),managerId:to.user,areaId:to.area})
    :await (()=>{const a=areaOf(node.slice(2))!;return dailyRequest<TeamChart>('save_area',{id:a.id,name:a.name,role:a.role,parentUser:to.user,parentArea:to.area})})());
   toast.success(!target?`${labelOf(node)} في أعلى الهيكل الآن`:node.startsWith('u:')&&target.startsWith('u:')?`${labelOf(node)} يتبع الآن ${labelOf(target)}`:`${labelOf(node)} تحت ${labelOf(target)} الآن`);
   await applyChanges(changes);return true}
  catch(e){toast.error((e as Error).message);return false}finally{setTreeBusy(false)}
 }
 // Boxes put on the board by hand (or let go back to arranging themselves: null). Shown at once, then saved.
 async function placeBoxes(pos:Record<string,[number,number]|null>){
  setChart(c=>{const layout={...(c.layout||{})};for(const [k,v] of Object.entries(pos)){if(v)layout[k]=v;else delete layout[k]}return {...c,layout}});
  try{setChart(await dailyRequest<TeamChart>('set_layout',{positions:pos}))}catch(e){toast.error((e as Error).message)}
 }
 // The people of a head (with nobody under them) who were put on the board one by one, out of his team's frame.
 const strays=(key:string)=>[...parent].filter(([c,p])=>p===key&&c.startsWith('u:')&&chart.layout?.[c]&&![...parent.values()].includes(c)).map(([c])=>c);
 const gather=(key:string)=>void placeBoxes(Object.fromEntries(strays(key).map(c=>[c,null])));
 // Which way a head's branch grows on the board.
 async function setFlow(node:string,dir:'down'|'left'|'right'){
  setChart(c=>{const flow={...(c.flow||{})};if(dir==='down')delete flow[node];else flow[node]=dir;return {...c,flow}});
  try{setChart(await dailyRequest<TeamChart>('set_flow',{node,dir}))}catch(e){toast.error((e as Error).message)}
 }
 // A person he answers to besides his main line: a line ending in a circle from him to that person.
 async function boss(userId:string,managerId:string,add:boolean){setTreeBusy(true);
  try{setChart(await dailyRequest<TeamChart>(add?'add_boss':'remove_boss',{userId,managerId}));toast.success(add?`${nameOf(userId)} يتبع ${nameOf(managerId)} أيضاً الآن`:`لم يعد ${nameOf(userId)} يتبع ${nameOf(managerId)}`)}
  catch(e){toast.error((e as Error).message)}finally{setTreeBusy(false)}
 }
 // A section a person belongs to besides their main place: a line from them to it in the tree.
 async function extra(userId:string,areaId:string,add:boolean){
  const extras=(chart.extras||[]).filter(x=>!(x.userId===userId&&x.areaId===areaId));
  const changes=changesFor(parent,{...chart,extras:add?[...extras,{userId,areaId}]:extras});setTreeBusy(true);
  try{setChart(await dailyRequest<TeamChart>(add?'add_extra':'remove_extra',{userId,areaId}));toast.success(add?`${nameOf(userId)} في ${labelOf('a:'+areaId)} أيضاً الآن`:`لم يعد ${nameOf(userId)} في ${labelOf('a:'+areaId)}`);await applyChanges(changes)}
  catch(e){toast.error((e as Error).message)}finally{setTreeBusy(false)}
 }
 async function saveArea(d:AreaDraft){const to=place(d.parent);
  const nextAreas=d.id?chart.areas.map(a=>a.id===d.id?{...a,workspace:d.workspace}:a):chart.areas,changes=d.id?changesFor(movedParents(parent,'a:'+d.id,d.parent),{...chart,areas:nextAreas}):[];
  setTreeBusy(true);
  try{setChart(await dailyRequest<TeamChart>('save_area',{id:d.id||null,name:d.name,role:d.role,workspace:d.workspace,parentUser:to.user,parentArea:to.area}));await applyChanges(changes);setAreaEdit(null);toast.success(d.id?'حُفظ القسم.':`أُضيف قسم «${d.name}». اسحب الموظفين إليه.`)}
  catch(e){toast.error((e as Error).message)}finally{setTreeBusy(false)}}
 async function deleteArea(a:TeamArea){if(!window.confirm(`حذف قسم «${a.name}»؟ ينتقل من فيه إلى مكان القسم في الهيكل.`))return;
  // Whoever was inside moves up to the section's place, and takes the workspace found there.
  const key='a:'+a.id,up=parent.get(key)||null,next=new Map(parent);next.delete(key);for(const [k,v] of parent)if(v===key){if(up)next.set(k,up);else next.delete(k)}
  const changes=changesFor(next,{...chart,areas:chart.areas.filter(x=>x.id!==a.id),extras:(chart.extras||[]).filter(x=>x.areaId!==a.id)});setTreeBusy(true);
  try{setChart(await dailyRequest<TeamChart>('delete_area',{id:a.id}));await applyChanges(changes);setAreaEdit(null);toast.success('حُذف القسم.')}catch(e){toast.error((e as Error).message)}finally{setTreeBusy(false)}}
 const isOwner=context.user.role==='owner';
 // Admins manage other staff whose admin powers they also hold; never themselves or the owner.
 const blocked=(m:Member)=>!isOwner&&(m.id===context.user.id?'حسابك: يديره المالك أو مسؤول آخر.':powersOf(m.permissions||{}).some(p=>!powers.includes(p))?'يملك صلاحيات إدارة لا تملكها.':'');
 const open=(m:Member|'new',nextMode:Mode='permissions')=>{
  setPerson(null);
  setUsername(m!=='new'&&nextMode==='rename'?m.username:'');setDisplayName('');setTypedName('');setMustChange(false);setShowPassword(false);setIssued(null);setPassword('');setError('');setMode(nextMode);setAccess(m==='new'?{...NO_ACCESS}:m.permissions||{...NO_ACCESS});setNewRoles(m!=='new'&&m.permissions?inferRoles(m.permissions):[]);setApplyPreset(false);setHistory([]);setHistoryError('');setEditing(m);
  if(m!=='new'&&nextMode==='permissions')officeRequest<AccessChange[]>('access_history',{id:m.id}).then(setHistory).catch(e=>setHistoryError(e.message));
 };
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  if(editing==='new'){
   const created=await officeRequest<Member>('create_member',{username,password,permissions:access});
   // New accounts start with a temporary password; keep it as the permanent one when asked.
   if(!mustChange)await officeRequest('set_member_password',{id:created.id,password,mustChange:false}).catch(()=>toast.message('أُنشئ الحساب بكلمة مرور مؤقتة؛ سيُطلب من الموظف تغييرها.'));
   if(displayName.trim())await officeRequest('set_display_name',{id:created.id,displayName:displayName.trim()}).catch(()=>toast.message('أُنشئ الحساب دون اسم الموظف؛ أضفه من «تغيير الاسم».'));
  }
  else if(editing&&mode==='password')await (mustChange?officeRequest('reset_member_password',{id:editing.id,password}):officeRequest('set_member_password',{id:editing.id,password,mustChange:false}));
  else if(editing&&mode==='rename'){
   const renamed=await officeRequest<Member>('rename_member',{id:editing.id,username});
   if(editing.id===context.user.id){toast.success(`اسم دخولك الآن ${renamed.username}`);setTimeout(()=>window.location.reload(),900)}
  }
  else if(editing&&mode==='role'){
   // Changing the role keeps the account's pages and cases unless asked to apply the role's suggested settings.
   if(!newRoles.length)throw new Error('اختر عملاً واحداً على الأقل.');
   const preset=combinedPreset(newRoles),main=newRoles[0];
   const names=access.lawyerNames?.length?access.lawyerNames:[matchLawyer(editing.displayName||'',lawyerLabels(records).map(([l])=>l))].filter(Boolean) as string[];
   const byName=newRoles.includes('lawyer')&&preset?.caseScope==='selected';
   const next:Permissions=applyPreset&&preset?{...access,...preset,caseIds:[],jobRole:main,jobRoles:newRoles,lawyerNames:byName?names:[],...(newRoles.includes('manager')?{adminPowers:[...powers]}:{})}:{...access,jobRole:main,jobRoles:newRoles};
   await officeRequest('set_member_access',{id:editing.id,permissions:next,revision:access.revision});
  }
  else if(editing)await officeRequest('set_member_access',{id:editing.id,permissions:access,revision:access.revision});
  onChanged();
  // Show the password once more with a copy button, so it can be handed to the employee.
  if(editing==='new'||mode==='password'){setIssued({username:editing==='new'?username.trim().toLowerCase():editing!.username,password});setPassword('');return}
  setPassword('');setEditing(null);toast.success(mode==='rename'?'تم تغيير اسم المستخدم. يسجل الدخول بالاسم الجديد.':mode==='role'?'تم تغيير الدور الوظيفي.':'تم حفظ الصلاحيات. تُطبّق عند تسجيل الدخول.');
 }catch(e){setError(friendly(e))}finally{setBusy(false)}}
 async function switchTo(m:Member){if(!window.confirm(`الدخول إلى حساب ${m.displayName||m.username}؟ سترى ما يراه فقط، ويمكنك العودة إلى حسابك من الشريط أسفل الصفحة.`))return;setBusy(true);try{await switchToUser(m.id)}catch(e){toast.error(friendly(e))}finally{setBusy(false)}}
 // Lawyer accounts (named as on the cases) that still see every case or a fixed list: switch them to their own cases by name.
 const labels=lawyerLabels(records).map(([l])=>l);
 const candidates=context.members.filter(m=>m.role==='editor'&&m.permissions&&!(m.permissions.caseScope==='selected'&&m.permissions.lawyerNames?.length)&&!!m.displayName)
  .map(m=>({m,label:matchLawyer(m.displayName||'',labels)}));
 const unscoped=candidates.filter(x=>x.label).map(x=>({...x.m,label:x.label!}));
 async function scopeLawyers(){
  if(!window.confirm(`سيرى كل محامٍ قضاياه فقط (حسب اسمه في خانة «المحامي»)، وتظهر له قضاياه الجديدة تلقائياً:\n\n${unscoped.map(m=>`${m.username} ← «${m.label}» (${visibleCases({caseScope:'selected',caseIds:[],lawyerNames:[m.label]},records)} قضية)`).join('\n')}\n\n تبقى صفحاته وصلاحية التعديل كما هي، وتنتهي جلساته الحالية. متابعة؟`))return;
  setBusy(true);let done=0;const failed:string[]=[];
  for(const m of unscoped){const p=m.permissions!;try{await officeRequest('set_member_access',{id:m.id,revision:p.revision,permissions:{...p,caseScope:'selected',caseIds:[],lawyerNames:[m.label],sections:p.sections.filter(s=>s!=='documents')}});done++}catch(e){failed.push(`${m.displayName||m.username}: ${(e as Error).message}`)}}
  setBusy(false);onChanged();if(done)toast.success(`أصبح ${done} محامٍ يرى قضاياه فقط.`);if(failed.length)toast.error(failed.join('\n'));
 }
 // «تطبيق على عدة حسابات»: the staff accounts this manager may change (not the owner, client accounts, or their own).
 const bulkMembers=context.members.filter(m=>m.role==='editor'&&!!m.permissions&&m.permissions.accountKind!=='client'&&m.id!==context.user.id&&!blocked(m));
 async function copy(text:string){try{await copyText(text);toast.success('نُسخت كلمة المرور')}catch{toast.error('تعذر النسخ؛ حدد النص وانسخه يدوياً.')}}
 async function toggle(m:Member){if(!window.confirm(m.enabled?`إيقاف حساب ${m.username} وإنهاء جلساته الحالية؟`:`إعادة تفعيل حساب ${m.username}؟`))return;setBusy(true);try{await officeRequest('set_member_enabled',{id:m.id,enabled:!m.enabled});onChanged();toast.success('تم تحديث حالة الحساب')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 // What an account opens and what may be done with it: the list's cells, and the card a box of the tree opens.
 const accessOf=(m:Member)=><>{m.role==='owner'?'مسؤول المكتب · وصول كامل':<>{m.permissions&&inferRoles(m.permissions).length>0&&<span className="role-chip">{rolesLabel(inferRoles(m.permissions))}</span>}{m.permissions?.caseScope==='all'?`جميع القضايا (${records.length})`:m.permissions?.lawyerNames?.length?<>قضاياه فقط: <b>{visibleCases(m.permissions,records)}</b> قضية <small>باسم {m.permissions.lawyerNames.join('، ')}</small></>:selectedCases(m.permissions?.caseIds.length||0)}<small>{m.permissions&&workspacesOf(m.permissions).map(p=>WORKSPACE_LABELS[p]).join('، ')||'بلا صفحات'} · {m.permissions?.canEdit?'قراءة وتعديل':'قراءة فقط'} · {m.permissions?.canExport?'التصدير متاح':'دون تصدير التقارير'}</small>{!!m.permissions?.adminPowers?.length&&<small className="admin-powers">مسؤول: {m.permissions.adminPowers.map(p=>ADMIN_POWERS[p]?.label||p).join('، ')}</small>}</>}</>;
 const actionsOf=(m:Member)=><>{m.role==='owner'&&isOwner&&<div className="actions"><button className="btn" disabled={busy} onClick={()=>open(m,'rename')}>تغيير الاسم</button>{m.id===context.user.id&&account&&<button className="btn" disabled={busy} onClick={account.onChangePassword}>تغيير كلمة مروري</button>}</div>}{m.role==='editor'&&blocked(m)&&<small className="muted">{blocked(m)}</small>}{m.role==='editor'&&!blocked(m)&&<div className="actions">{m.enabled&&<button className="btn" disabled={busy} onClick={()=>void switchTo(m)} title="افتح التطبيق كما يراه هذا الموظف، دون كلمة مروره">الدخول بحسابه</button>}<button className="btn" disabled={busy} onClick={()=>open(m,'role')}>الدور الوظيفي</button><button className="btn" disabled={busy} onClick={()=>open(m)}>تعديل الصلاحيات</button><button className="btn" disabled={busy} onClick={()=>open(m,'rename')}>تغيير الاسم</button><button className="btn" disabled={busy} onClick={()=>open(m,'password')}>كلمة المرور</button><button className="btn" disabled={busy} onClick={()=>void toggle(m)}>{m.enabled?'إيقاف الحساب':'إعادة تفعيل'}</button></div>}</>;
 // His options beside the tree (a column of its own, so nothing of the tree is hidden under it).
 const personPanel=person?(()=>{const m=context.members.find(x=>x.id===person.id)||person,key='u:'+m.id,under=peopleBelow(parent,key),inside=nodesBelow(parent,key),up=parent.get(key);
  const mine=(chart.extras||[]).filter(x=>x.userId===m.id),ws=workspacesFor(parent,chart,m.id),bosses=(chart.bosses||[]).filter(x=>x.userId===m.id);
  // A panel beside the tree rather than a window over it, so the lines to the sections he is also in stay in sight.
  return <aside className="org-panel" role="dialog" aria-label={'خيارات '+(m.displayName||m.username)}>
  <div className="org-panel-head"><div><b>{m.displayName||m.username}</b> <code dir="ltr">{m.username}</code>
   <p className="subtitle">{(up?(up.startsWith('u:')?`يتبع ${labelOf(up)}`:`في ${labelOf(up)}`):'لم يوضع في الهيكل بعد')+(under.size?` · مسؤول عن ${peopleCount(under.size)} ويرى تقاريرهم وأداءهم`:'')}{m.enabled?'':' · الحساب موقوف'}</p>{chart.seen&&<p className={'org-presence'+(isOnline(chart,m.id)?' on':'')}>{isOnline(chart,m.id)?'متصل الآن':chart.seen[m.id]?'آخر ظهور: '+officeTime(chart.seen[m.id]):'لم يظهر بعد'}</p>}</div>
   <button type="button" className="icon-btn" aria-label="إغلاق" onClick={()=>setPerson(null)}><X size={16}/></button></div>
  <div className="staff-person-body"><div className="person-access">{accessOf(m)}{ws.length>0&&<small>مساحات أقسامه: <b>{wsLabel(ws).replace(/ فقط$/,'')}</b></small>}</div>
   <div className="person-actions">{actionsOf(m)}</div>
   <label className="field"><span>مكانه في الهيكل</span><FilterBox label={'المسؤول عن '+(m.displayName||m.username)} value={up||''} empty="لا أحد (خارج الهيكل)"
    options={[...chart.areas.filter(a=>!inside.has('a:'+a.id)).map(a=>({value:'a:'+a.id,label:'قسم '+a.name})),...context.members.filter(x=>x.role!=='owner'&&x.id!==m.id&&!under.has(x.id)&&x.enabled&&x.permissions?.accountKind!=='client').map(x=>({value:'u:'+x.id,label:x.displayName||x.username,hint:x.username}))]} onChange={v=>drop(key,v||null)}/></label>
   <div className="field"><span>يتبع أيضاً</span>
    {bosses.length?<div className="org-extras">{bosses.map(x=><span key={x.managerId} className="org-extra-chip boss">{nameOf(x.managerId)}<button type="button" aria-label={'لم يعد يتبع '+nameOf(x.managerId)} disabled={treeBusy} onClick={()=>void boss(m.id,x.managerId,false)}><X size={13}/></button></span>)}</div>:<small className="muted">لا أحد. يظهر كل مسؤول آخر بخط منه إليه ينتهي بدائرة.</small>}
    <FilterBox label="يتبع شخصاً آخر أيضاً" placeholder="يتبع شخصاً آخر أيضاً…" value="" options={context.members.filter(x=>x.role!=='owner'&&x.id!==m.id&&x.enabled&&!under.has(x.id)&&up!=='u:'+x.id&&!bosses.some(b=>b.managerId===x.id)&&x.permissions?.accountKind!=='client').map(x=>({value:x.id,label:x.displayName||x.username,hint:x.username}))} onChange={v=>{if(v)void boss(m.id,v,true)}}/></div>
   {(under.size>0)&&<div className="field"><span>اتجاه فريقه في الهيكل</span><FlowPicker value={chart.flow?.[key]||'down'} onChange={d=>void setFlow(key,d)}/></div>}
   {chart.layout?.[key]&&<button type="button" className="btn" onClick={()=>void placeBoxes({[key]:null})} title="يعود تحت رئيسه في الهيكل حيث يُرتَّب تلقائياً">إعادته لمكانه التلقائي</button>}
   {strays(key).length>0&&<button type="button" className="btn" onClick={()=>gather(key)} title="من نُقل منهم إلى مكان خاص يعود إلى الإطار المشترك تحته">جمع فريقه في إطار واحد ({strays(key).length})</button>}
   <div className="field"><span>أقسام أخرى هو فيها أيضاً</span>
    {mine.length?<div className="org-extras">{mine.map(x=><span key={x.areaId} className="org-extra-chip">{labelOf('a:'+x.areaId)}<button type="button" aria-label={'إخراجه من '+labelOf('a:'+x.areaId)} disabled={treeBusy} onClick={()=>void extra(m.id,x.areaId,false)}><X size={13}/></button></span>)}</div>:<small className="muted">لا شيء. يظهر كل قسم إضافي بخط منه إليه في الهيكل.</small>}
    <FilterBox label="إضافته إلى قسم آخر أيضاً" placeholder="إضافته إلى قسم آخر أيضاً…" value="" options={chart.areas.filter(a=>up!=='a:'+a.id&&!mine.some(x=>x.areaId===a.id)).map(a=>({value:a.id,label:'قسم '+a.name,hint:a.workspace?'يفتح '+WORKSPACE_LABELS[a.workspace].split(' (')[0]:''}))} onChange={v=>{if(v)void extra(m.id,v,true)}}/></div>
  </div></aside>})():null;
 return <section className="panel office-staff"><div className="panel-head"><div><h2>فريق المكتب والصلاحيات</h2><p className="panel-note">المالك ومن مُنح «إدارة الموظفين والصلاحيات» ينشئون المستخدمين ويحددون الأقسام والقضايا والعمليات وصلاحيات الإدارة.</p></div><div className="actions"><div className="seg staff-view" role="tablist" aria-label="عرض الفريق">{([['tree','الهيكل'],['list','القائمة']] as const).map(([k,l])=><button key={k} type="button" role="tab" aria-selected={view===k} className={'seg-opt'+(view===k?' on show':'')} onClick={()=>show(k)}>{l}</button>)}</div>{view==='tree'&&<><button className="btn" disabled={treeBusy} onClick={()=>setAreaEdit('branch')} title="صندوق فارغ باسم تختاره (فرع الكويت، فرع دبي…) تضع فيه الأقسام والموظفين">إضافة فرع</button><button className="btn" disabled={treeBusy} onClick={()=>setAreaEdit('new')} title="صندوق لنوع من العمل (المحامون، المحاسبة…) تسحب إليه الموظفين">إضافة قسم</button></>}<button className="btn" disabled={busy||!bulkMembers.length} onClick={()=>setBulk(true)}>تطبيق على عدة حسابات</button>{unscoped.length>0&&<button className="btn" disabled={busy} onClick={()=>void scopeLawyers()}>كل محامٍ يرى قضاياه فقط ({unscoped.length})</button>}<button className="btn" onClick={()=>setLawyers(true)}>حسابات المحامين</button><button className="btn primary" onClick={()=>open('new')}>إضافة موظف</button></div></div>
 {bulk&&<BulkAccess members={bulkMembers} onClose={()=>setBulk(false)} onDone={onChanged}/>}
 {lawyers&&<LawyerAccounts members={context.members} records={records} onClose={()=>setLawyers(false)} onCreated={onChanged}/>}
 <div className="panel-body"><p className="subtitle">حسابات محلية دون بريد إلكتروني. تبدأ الحسابات الجديدة بلا صلاحيات حتى تختارها. تغيير الصلاحيات أو إيقاف الحساب ينهي جلساته الحالية.</p><div className="staff-search searchbox"><Search size={16}/><input aria-label="بحث في فريق المكتب" placeholder="ابحث باسم المستخدم أو اسم الموظف…" value={staffSearch} onChange={e=>setStaffSearch(e.target.value)}/>{staffSearch&&<small>{shownMembers.length} من {context.members.length}</small>}</div>{view==='list'?<div className="table-wrap"><table className="office-table"><thead><tr><th>اسم المستخدم</th><th>الوصول</th><th>الحالة</th><th>إدارة الحساب</th></tr></thead><tbody>{shownMembers.map(m=><tr key={m.id}><td><span dir="ltr">{m.username}</span>{m.displayName&&<small>{m.displayName}</small>}</td><td>{accessOf(m)}</td><td>{m.enabled?'فعال':'موقوف'}{m.mustChangePassword?' · يلزم تغيير كلمة المرور':''}</td><td>{actionsOf(m)}</td></tr>)}</tbody></table></div>:<div className={'org-layout'+(personPanel?' with-panel':'')}><OrgTree members={context.members.filter(m=>m.role==='owner'||m.permissions?.accountKind!=='client')} chart={chart} search={staffSearch} selected={person?.id||(areaEdit&&typeof areaEdit!=='string'?'a:'+areaEdit.id:'')} onPick={setPerson} onPickArea={setAreaEdit} onMove={drop} onPlace={pos=>void placeBoxes(pos)} canMove={m=>m.role!=='owner'&&!treeBusy}/>{personPanel}</div>}</div>
 {choice&&(()=>{const who=nameOf(choice.node.slice(2)),a=areaOf(choice.target.slice(2));const ws=a?.workspace?WORKSPACE_LABELS[a.workspace].split(' (')[0]:a?.name;
  if(choice.target.startsWith('u:'))return <Dialog open onOpenChange={v=>{if(!v)setChoice(null)}}><DialogContent dir="rtl" className="office-dialog org-choice">
   <DialogHeader><DialogTitle>{who} و{labelOf(choice.target)}</DialogTitle><DialogDescription>هو الآن {parent.get(choice.node)?.startsWith('u:')?'يتبع '+labelOf(parent.get(choice.node)):'في '+labelOf(parent.get(choice.node))}. ماذا تريد؟</DialogDescription></DialogHeader>
   <div className="org-choice-options">
    <button type="button" className="org-choice-opt" onClick={()=>{const c=choice;setChoice(null);void move(c.node,c.target)}}><b>نقله ليتبع {labelOf(choice.target)}</b><small>يترك مكانه الحالي ويصبح تحته.</small></button>
    <button type="button" className="org-choice-opt" onClick={()=>{const c=choice;setChoice(null);void boss(c.node.slice(2),c.target.slice(2),true)}}><b>يتبع {labelOf(choice.target)} أيضاً</b><small>يبقى في مكانه ويستجيب له كذلك؛ يظهر خط منه إليه ينتهي بدائرة، ويرى {labelOf(choice.target)} تقاريره.</small></button></div>
   <div className="area-foot"><button type="button" className="btn" onClick={()=>setChoice(null)}>إلغاء</button></div>
  </DialogContent></Dialog>;
  return <Dialog open onOpenChange={v=>{if(!v)setChoice(null)}}><DialogContent dir="rtl" className="office-dialog org-choice">
   <DialogHeader><DialogTitle>{who} و{labelOf(choice.target)}</DialogTitle><DialogDescription>هو الآن {parent.get(choice.node)?.startsWith('u:')?'يتبع '+labelOf(parent.get(choice.node)):'في '+labelOf(parent.get(choice.node))}. ماذا تريد؟</DialogDescription></DialogHeader>
   <div className="org-choice-options">
    <button type="button" className="org-choice-opt" onClick={()=>{const c=choice;setChoice(null);void move(c.node,c.target)}}><b>نقله إلى {labelOf(choice.target)}</b><small>{a?.workspace?`يترك مكانه الحالي ويفتح ${ws} فقط.`:'يترك مكانه الحالي ويصبح في هذا القسم.'}</small></button>
    <button type="button" className="org-choice-opt" onClick={()=>{const c=choice;setChoice(null);void extra(c.node.slice(2),c.target.slice(2),true)}}><b>إضافته إلى {labelOf(choice.target)} أيضاً</b><small>{a?.workspace?`يبقى في مكانه ويفتح ${ws} كذلك؛ يظهر خط منه إلى القسم.`:'يبقى في مكانه ويُحسب في هذا القسم كذلك؛ يظهر خط منه إلى القسم.'}</small></button></div>
   <div className="area-foot"><button type="button" className="btn" onClick={()=>setChoice(null)}>إلغاء</button></div>
  </DialogContent></Dialog>})()}
 {areaEdit&&<AreaEditor area={areaEdit==='branch'?'new':areaEdit} preset={areaEdit==='branch'?'branch':undefined} chart={chart} members={context.members} busy={treeBusy} flow={areaEdit!=='new'&&areaEdit!=='branch'?<><FlowPicker value={chart.flow?.['a:'+areaEdit.id]||'down'} onChange={d=>void setFlow('a:'+areaEdit.id,d)}/>{(chart.layout?.['a:'+areaEdit.id]||chart.layout?.['g:a:'+areaEdit.id])&&<button type="button" className="btn" onClick={()=>void placeBoxes({['a:'+areaEdit.id]:null,['g:a:'+areaEdit.id]:null})}>إعادته لمكانه التلقائي</button>}{strays('a:'+areaEdit.id).length>0&&<button type="button" className="btn" onClick={()=>gather('a:'+areaEdit.id)}>جمع من فيه في إطار واحد ({strays('a:'+areaEdit.id).length})</button>}</>:null} onSave={d=>void saveArea(d)} onDelete={a=>void deleteArea(a)} onClose={()=>setAreaEdit(null)}/>}
 {editing&&<Dialog open onOpenChange={v=>{if(!v&&!busy){setEditing(null);setPassword('')}}}><DialogContent dir="rtl" className="office-dialog permissions-dialog"><DialogHeader><DialogTitle className="person-title">{editing==='new'?'إضافة موظف':{password:'كلمة مرور',rename:'تغيير اسم',permissions:'صلاحيات',role:'الدور الوظيفي لـ'}[mode]}{(()=>{const name=editing==='new'?displayName.trim():editing.displayName||'',user=editing==='new'?username.trim():editing.username;return (name||user)&&<>{' '}<span className="title-person">{name&&<b>{name}</b>}{name&&user&&' '}{user&&<code dir="ltr">{user}</code>}</span></>})()}</DialogTitle><DialogDescription>{mode==='password'?'اختر كلمة مرور الموظف بنفسك. تنتهي جلساته الحالية عند الحفظ.':mode==='rename'?'يسجل صاحب الحساب الدخول بالاسم الجديد. تبقى صلاحياته وسجلاته كما هي.':mode==='role'?'يظهر الدور في قائمة الفريق وملفه. تبقى صفحاته وقضاياه كما هي ما لم تطلب تطبيق إعدادات الدور.':'حدد الصفحات والقضايا قبل الحفظ. صلاحيات الحساب تُفحص على الخادم في كل طلب.'}</DialogDescription>{!issued&&<button className="btn primary dialog-save" type="submit" form="staff-form" disabled={busy}>{busy?'جارٍ الحفظ…':editing==='new'||mode==='password'?'حفظ الحساب':mode==='rename'?'حفظ الاسم':mode==='role'?'حفظ الدور الوظيفي':'حفظ الصلاحيات وإنهاء الجلسات'}</button>}</DialogHeader><div className="dialog-body">
 {issued?<div className="issued-password" role="status"><p>كلمة مرور <b dir="ltr">{issued.username}</b> الجديدة. انسخها الآن وسلّمها للموظف؛ لا يمكن عرضها مرة أخرى لأنها تُحفظ مشفرة.</p><code dir="ltr">{issued.password}</code><div className="actions"><button className="btn primary" onClick={()=>void copy(issued.password)}>نسخ كلمة المرور</button><button className="btn" onClick={()=>{setIssued(null);setEditing(null)}}>تم</button></div></div>:
 <form id="staff-form" className="office-form" onSubmit={save}><fieldset disabled={busy}>
 <div className={editing==='new'?'account-fields':''}>
 {(editing==='new'||mode==='rename')&&<label className="field"><span id="staff-username-label">اسم المستخدم الجديد</span><input aria-labelledby="staff-username-label" aria-describedby="staff-username-help" dir="ltr" value={username} onChange={e=>setUsername(e.target.value)} required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{2,31}" autoComplete="off"/><small id="staff-username-help">3–32 حرفاً إنجليزياً أو رقماً أو . _ -</small></label>}
 {(editing==='new'||mode==='password')&&<label className="field"><span id="staff-password-label">كلمة المرور</span><span className="password-row"><input aria-labelledby="staff-password-label" aria-describedby="staff-password-help" type={showPassword?'text':'password'} dir="ltr" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} required autoComplete="new-password"/><button type="button" className="btn" onClick={()=>{setPassword(generatePassword());setShowPassword(true)}}>توليد</button><button type="button" className="btn" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'إخفاء':'إظهار'}</button></span><small id="staff-password-help">12 حرفاً على الأقل. «توليد» ينشئ كلمة مرور قوية سهلة القراءة.</small></label>}
 {editing==='new'&&<label className="field"><span>اسم الموظف كما يظهر للزملاء</span><input value={displayName} onChange={e=>setDisplayName(e.target.value)} onBlur={()=>setTypedName(displayName.trim())} maxLength={80} placeholder="للمحامي: اسمه كما في خانة «المحامي»"/><small>اختياري. يظهر في المحادثة والمهام وملف الموارد البشرية.</small></label>}
 {(editing==='new'||mode==='password')&&<label className="checkbox-line"><input type="checkbox" checked={mustChange} onChange={e=>setMustChange(e.target.checked)}/>اطلب من الموظف تغييرها عند الدخول التالي</label>}
 </div>
 {mode==='role'&&editing!=='new'&&<RolePicker value={newRoles} onChange={setNewRoles} apply={applyPreset} onApply={setApplyPreset} current={access}/>}
 {mode==='permissions'&&<PermissionEditor grantable={powers} value={access} onChange={setAccess} records={records} suggestLawyer={editing!=='new'&&editing?editing.displayName||'':typedName}/>}
 {error&&<p className="notice" role="alert">{error}</p>}
 
 </fieldset></form>}
 {mode==='permissions'&&editing!=='new'&&<section className="office-history"><h3>سجل تغييرات الصلاحيات</h3>{historyError&&<p role="alert">{historyError}</p>}{history.map(h=><details key={h.id}><summary>النسخة {h.revision} · {h.actor} · {officeTime(h.createdAt)}</summary><p>الأقسام: {h.after.sections.map(s=>SECTIONS[s]).join('، ')||'لا توجد'}</p><p>القضايا: {h.after.caseScope==='all'?'جميع القضايا':h.after.caseIds.map(id=>records.find(c=>c.id===id)?.code||id).join('، ')||'لا توجد'}</p><p>{h.after.canEdit?'قراءة وتعديل':'قراءة فقط'} · {h.after.canExport?'تصدير التقارير متاح':'دون تصدير التقارير'}</p></details>)}{!history.length&&!historyError&&<p className="subtitle">لا توجد تغييرات مسجلة.</p>}</section>}
 </div> </DialogContent></Dialog>}
 </section>;
}

/** Change only the jobs, or apply their combined suggested pages and settings as well. A person may do several jobs. */
function RolePicker({value,onChange,apply,onApply,current}:{value:JobRole[];onChange:(r:JobRole[])=>void;apply:boolean;onApply:(v:boolean)=>void;current:Permissions}) {
 const preset=combinedPreset(value);
 const pages=(p:Pick<Permissions,'sections'>)=>workspacesOf(p).map(w=>WORKSPACE_LABELS[w]).join('، ')||'بلا صفحات';
 const alone=(r:JobRole)=>r==='custom';
 const toggle=(id:JobRole)=>onChange(alone(id)?(value.includes(id)?[]:[id]):value.includes(id)?value.filter(r=>r!==id):[...value.filter(r=>!alone(r)),id]);
 return <div className="permission-group role-step">
  <p className="subtitle">اختر عملاً واحداً أو أكثر. الأول المختار هو العمل الأساسي.</p>
  <div className="role-grid" role="group" aria-label="الدور الوظيفي">{JOB_ROLES.map(x=>{const Icon=ROLE_ICONS[x.id],on=value.includes(x.id);return <button type="button" role="checkbox" aria-checked={on} key={x.id} className={'role-card'+(on?' on':'')} title={x.hint} onClick={()=>toggle(x.id)}><Icon size={18} aria-hidden/><b>{x.label}</b>{on&&value.length>1&&value[0]===x.id&&<small>الأساسي</small>}</button>})}</div>
  {value.map(id=><p className="role-hint" key={id}><b>{JOB_ROLES.find(r=>r.id===id)?.label.split(' — ')[0]}:</b> {JOB_ROLES.find(r=>r.id===id)?.hint}</p>)}
  {preset&&<label className="checkbox-line"><input type="checkbox" checked={apply} onChange={e=>onApply(e.target.checked)}/> تطبيق الصفحات والصلاحيات المقترحة لهذه الأعمال أيضاً</label>}
  <p className="permission-summary" role="status">{apply&&preset?<>سيرى بعد الحفظ: <b>{pages(preset)}</b> · {preset.caseScope==='all'?'جميع القضايا':'قضاياه فقط'} · {preset.canEdit?'قراءة وتعديل':'قراءة فقط'} · {preset.canExport?'تصدير وطباعة':'دون تصدير'}. تنتهي جلساته الحالية.</>:<>تبقى صلاحياته كما هي: <b>{pages(current)}</b>. تتغير المسميات فقط.</>}</p>
 </div>;
}

/** Which way a head's branch grows on the board: down, to the left or to the right. */
function FlowPicker({value,onChange}:{value:'down'|'left'|'right';onChange:(v:'down'|'left'|'right')=>void}){
 return <div className="seg org-flow" role="radiogroup" aria-label="اتجاه الفريق">{([['down','↓ تحت'],['right','→ يمين'],['left','← يسار']] as const).map(([k,l])=>
  <button key={k} type="button" role="radio" aria-checked={value===k} className={'seg-opt'+(value===k?' on show':'')} onClick={()=>onChange(k)}>{l}</button>)}</div>;
}
