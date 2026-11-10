'use client';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {FolderTree,GripVertical,Maximize2,Minus,Plus,UsersRound} from 'lucide-react';
import type {Member} from '@/lib/office';
import {WORKSPACE_LABELS,rolesLabel,type JobRole} from '@/lib/permissions';
import {inferRoles,ROLE_ICONS} from './permission-editor';
import {normalizeSearch} from '@/lib/case-browse';
import {nodesBelow,parents,peopleBelow,peopleCount,type TeamArea,type TeamChart} from '@/lib/team';

const name=(m:Member)=>m.displayName||m.username;
type Node={key:string;member?:Member;area?:TeamArea};
/** Where a dragged box lands on another: beside it (before or after it, among the same head's boxes) or under it. */
type Zone='before'|'into'|'after';
const ZOOM_KEY='mawatheeq.org-zoom.v1',MIN_ZOOM=0.35,MAX_ZOOM=1.5;
const readZoom=()=>{try{const z=Number(localStorage.getItem(ZOOM_KEY));return z>=MIN_ZOOM&&z<=MAX_ZOOM?z:1}catch{return 1}};

/**
 * «فريق المكتب» as a tree of the office's people (the program's own owner account is left out): each head at the top
 * (Mr. Yousef, a section left at the top…) with the people and sections under him, and a tray of whoever is not placed
 * yet. Sections («الأقسام») are boxes for a kind of work or a workspace.
 *
 * It moves like a map: the wheel zooms in and out around the pointer, and dragging an empty spot moves the whole tree.
 * Boxes move like icons on a phone: dropped on the side of another box (or between two) a box takes that place beside
 * it, under the same head; dropped in the middle of a person it goes under him (a lawyer over other lawyers or counsel),
 * in the middle of a section it goes into it; on the tray it leaves the tree. Everything under a box moves with it.
 * People with nobody under them sit side by side in one block under their head, so a large team wraps instead of running
 * off the page. A click on a box opens what can be changed for it.
 */
export default function OrgTree({members,chart,search,selected,onPick,onPickArea,onMove,onArrange,canMove}:{members:Member[];chart:TeamChart;search:string;selected:string;
 onPick:(m:Member)=>void;onPickArea:(a:TeamArea)=>void;onMove:(node:string,target:string|null)=>void;
 onArrange:(node:string,parent:string|null,order:string[])=>void;canMove:(m:Member)=>boolean}){
 const [drag,setDrag]=useState(''),[over,setOver]=useState<{key:string;zone:Zone}|null>(null);
 // The owner account is the program's own administrator, not a person in the office: it stays out of the tree.
 const staff=members.filter(m=>m.role!=='owner');
 const parent=useMemo(()=>parents(chart),[chart]);
 // Children of each node, in the order arranged (then sections first, bigger teams first, by name); a node whose parent
 // is unknown (a person since removed) sits at the top ('').
 const kids=useMemo(()=>{const known=new Set([...staff.map(m=>'u:'+m.id),...chart.areas.map(a=>'a:'+a.id)]),k=new Map<string,Node[]>(),pos=chart.order||{};
  const put=(n:Node)=>{const up=parent.get(n.key),at=up&&known.has(up)?up:'';k.set(at,[...(k.get(at)||[]),n])};
  for(const a of chart.areas)put({key:'a:'+a.id,area:a});for(const m of staff)put({key:'u:'+m.id,member:m});
  const label=(n:Node)=>n.area?n.area.name:name(n.member!),at=(n:Node)=>pos[n.key]??Infinity;
  for(const list of k.values())list.sort((a,b)=>at(a)-at(b)||Number(!!b.area)-Number(!!a.area)||(k.get(b.key)?.length||0)-(k.get(a.key)?.length||0)||label(a).localeCompare(label(b),'ar'));
  return k},[staff,chart.areas,chart.order,parent]);
 const blocked=useMemo(()=>drag?new Set([drag,...nodesBelow(parent,drag)]):new Set<string>(),[drag,parent]);
 const q=normalizeSearch(search.trim());
 const hit=(m:Member)=>!q||normalizeSearch([m.username,m.displayName||''].join(' ')).includes(q);
 const upOf=(key:string)=>parent.get(key)||null;
 // The side of a box the pointer is on: its outer quarters place beside it, the middle puts under (or into) it. The
 // boxes read right to left, so the right side is «before».
 const zoneAt=(e:React.DragEvent,el:HTMLElement):Zone=>{const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width;return x>0.72?'before':x<0.28?'after':'into'};
 const allowed=(key:string,zone:Zone)=>!!drag&&!blocked.has(key)&&(zone==='into'?upOf(drag)!==key:true);
 const drop=(from:string,key:string,zone:Zone)=>{
  if(zone==='into'){onMove(from,key);return}
  const up=upOf(key),order=(kids.get(up||'')||[]).map(n=>n.key).filter(k=>k!==from),i=order.indexOf(key);
  order.splice(zone==='before'?i:i+1,0,from);onArrange(from,up,order)};
 const dnd=(key:string,movable:boolean)=>({draggable:movable,
  onDragStart:(e:React.DragEvent)=>{e.stopPropagation();e.dataTransfer.setData('text/plain',key);e.dataTransfer.effectAllowed='move';setDrag(key)},onDragEnd:()=>{setDrag('');setOver(null)},
  // A box inside the tray answers for itself: the tray around it does not take the drop too.
  onDragOver:(e:React.DragEvent)=>{e.stopPropagation();const zone=zoneAt(e,e.currentTarget as HTMLElement);
   if(allowed(key,zone)){e.preventDefault();e.dataTransfer.dropEffect='move';if(over?.key!==key||over.zone!==zone)setOver({key,zone})}else if(over)setOver(null)},
  onDragLeave:()=>{if(over?.key===key)setOver(null)},
  onDrop:(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation();const from=e.dataTransfer.getData('text/plain')||drag,zone=zoneAt(e,e.currentTarget as HTMLElement);
   setDrag('');setOver(null);if(from&&allowed(key,zone))drop(from,key,zone)}});
 const dropClass=(key:string)=>over?.key===key?(over.zone==='into'?' drop':' drop-'+over.zone):'';
 const personBox=(m:Member)=>{const key='u:'+m.id,team=peopleBelow(parent,key).size,roles=m.permissions?inferRoles(m.permissions):[],movable=canMove(m);
  const also=(chart.extras||[]).filter(x=>x.userId===m.id).map(x=>chart.areas.find(a=>a.id===x.areaId)?.name).filter(Boolean);
  return <button type="button" key={m.id} data-person={m.username} data-node={key} aria-pressed={selected===m.id} {...dnd(key,movable)}
   className={'org-box'+(team?' lead':'')+(m.enabled?'':' off')+(selected===m.id?' on':'')+(q&&!hit(m)?' dim':'')+dropClass(key)+(drag===key?' dragging':'')}
   title={movable?'اضغط لعرض خياراته. اسحبه إلى جانب زميل ليأخذ مكانه بجواره، أو إلى وسط صندوق شخص ليتبعه، أو إلى قسم':'اضغط لعرض خياراته'} onClick={()=>onPick(m)}>
   {movable&&<GripVertical size={13} aria-hidden className="org-grip"/>}
   {team>0&&<UsersRound size={14} aria-hidden className="org-icon"/>}
   <b>{name(m)}</b><small dir="ltr">{m.username}</small>
   <span className="org-meta">{roles.length?rolesLabel(roles):'بلا دور'}{!m.enabled&&' · موقوف'}</span>
   {team>0&&<span className="org-team">مسؤول عن {peopleCount(team)}</span>}{also.length>0&&<span className="org-also">أيضاً في: {also.join('، ')}</span>}
   {over?.key===key&&over.zone==='into'&&drag&&<span className="org-drop-label">{drag.startsWith('a:')?'تحته':'يتبعه'}</span>}</button>};
 const areaBox=(a:TeamArea)=>{const key='a:'+a.id,count=peopleBelow(parent,key).size,Icon=a.role&&ROLE_ICONS[a.role as JobRole]||FolderTree;
  return <button type="button" key={a.id} data-area={a.name} data-node={key} aria-pressed={selected===key} {...dnd(key,true)}
   className={'org-box org-area'+(selected===key?' on':'')+dropClass(key)+(drag===key?' dragging':'')}
   title="قسم: اضغط لتسميته أو نقله أو حذفه. اسحبه إلى مكان آخر، أو أفلت في وسطه موظفين" onClick={()=>onPickArea(a)}>
   <GripVertical size={13} aria-hidden className="org-grip"/><Icon size={15} aria-hidden className="org-icon"/><b>{a.name}</b>
   <span className="org-meta">{count?peopleCount(count):'فارغ — أفلت فيه موظفين'}</span>{a.workspace&&<span className="org-team" title={`من فيه يفتح ${WORKSPACE_LABELS[a.workspace]} فقط`}>مساحة {WORKSPACE_LABELS[a.workspace].split(' (')[0]}</span>}
   {over?.key===key&&over.zone==='into'&&drag&&<span className="org-drop-label">داخله</span>}</button>};
 // A head's branches (sections and people with their own team) each get a column; the rest sit together in one wrapping block.
 const branch=(n:Node):React.ReactNode=>{const under=kids.get(n.key)||[];
  const heads=under.filter(x=>x.area||kids.get(x.key)?.length),rest=under.filter(x=>!x.area&&!kids.get(x.key)?.length);
  const cols=[...heads.map(h=><li key={h.key}>{branch(h)}</li>),...(rest.length?[<li key="rest"><div className="org-leaves">{rest.map(x=>personBox(x.member!))}</div></li>]:[])];
  return <>{n.area?areaBox(n.area):personBox(n.member!)}{cols.length>0&&<ul>{cols.reverse()}</ul>}</>};
 // The top: each head of a tree (Mr. Yousef, a section left at the top…) side by side, and everyone not placed yet in a
 // tray above them to drag from. Dropping a box on the tray takes it out of the tree.
 const top=kids.get('')||[],heads=top.filter(x=>x.area||kids.get(x.key)?.length),loose=top.filter(x=>!x.area&&!kids.get(x.key)?.length);
 const trayOk=!!drag&&upOf(drag)!==null;

 // Zoom (the wheel, around the pointer, or the buttons) and moving the view by dragging an empty spot, as on a map.
 const view=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null),[zoom,setZoomState]=useState(readZoom),zoomRef=useRef(zoom);
 const setZoom=(z:number,cx?:number,cy?:number)=>{const v=view.current;z=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,Math.round(z*100)/100));if(!v||z===zoomRef.current)return;
  const r=v.getBoundingClientRect(),mx=cx===undefined?v.clientWidth/2:cx-r.left,my=cy===undefined?v.clientHeight/2:cy-r.top,old=zoomRef.current;
  const px=(v.scrollLeft+mx)/old,py=(v.scrollTop+my)/old;zoomRef.current=z;setZoomState(z);try{localStorage.setItem(ZOOM_KEY,String(z))}catch{/* this visit only */}
  requestAnimationFrame(()=>{v.scrollLeft=px*z-mx;v.scrollTop=py*z-my})};
 const fit=()=>{const v=view.current,c=canvas.current;if(!v||!c)return;setZoom(Math.min(1,(v.clientWidth-24)/(c.scrollWidth||1)))};
 useEffect(()=>{const v=view.current;if(!v)return;
  const wheel=(e:WheelEvent)=>{e.preventDefault();setZoom(zoomRef.current*(e.deltaY<0?1.1:1/1.1),e.clientX,e.clientY)};
  v.addEventListener('wheel',wheel,{passive:false});return()=>v.removeEventListener('wheel',wheel)},[]);
 const [panning,setPanning]=useState(false);
 const pan=(e:React.PointerEvent)=>{const v=view.current;if(!v||e.button!==0||(e.target as HTMLElement).closest('button,input,a,.org-zoom'))return;
  const x=e.clientX,y=e.clientY,sl=v.scrollLeft,st=v.scrollTop;setPanning(true);
  const move=(ev:PointerEvent)=>{v.scrollLeft=sl-(ev.clientX-x);v.scrollTop=st-(ev.clientY-y)};
  const up=()=>{setPanning(false);removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up)};
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up)};

 // Lines from each person to the other sections he is in as well, drawn over the tree; those of the selected person
 // (or section) stand out. They are measured from the boxes after every layout change, in the tree's own (unzoomed) units.
 const [links,setLinks]=useState<{id:string;d:string;on:boolean}[]>([]),[size,setSize]=useState({w:0,h:0});
 useLayoutEffect(()=>{const el=canvas.current;if(!el)return;
  const draw=()=>{const z=zoomRef.current,box=el.getBoundingClientRect(),at=(k:string)=>el.querySelector<HTMLElement>(`[data-node="${k}"]`)?.getBoundingClientRect();
   const X=(v:number)=>(v-box.left)/z,Y=(v:number)=>(v-box.top)/z;
   // The boxes' own height (not the lines'), so the curves below them get room without the tree growing each time.
   let content=0;for(const c of el.children)if(!(c instanceof SVGElement))content=Math.max(content,Y(c.getBoundingClientRect().bottom));
   let deepest=0;
   const next=(chart.extras||[]).flatMap(x=>{const a=at('u:'+x.userId),b=at('a:'+x.areaId);if(!a||!b)return [];
    // From under the person, sweeping below the boxes, into the section from beneath (or from above, when it sits lower).
    const x1=X(a.left+a.width/2),y1=Y(a.bottom),x2=X(b.left+b.width/2),below=b.top>a.bottom,y2=Y(below?b.top:b.bottom),k=Math.max(44,Math.abs(x2-x1)*0.12);
    deepest=Math.max(deepest,below?y2:Math.max(y1,y2)+k*0.8);
    const d=below?`M${x1},${y1} C${x1},${y1+k} ${x2},${y2-k} ${x2},${y2}`:`M${x1},${y1} C${x1},${y1+k} ${x2},${Math.max(y1,y2)+k} ${x2},${y2}`;
    return [{id:x.userId+x.areaId,d,on:selected===x.userId||selected==='a:'+x.areaId}]});
   const h=Math.max(content,deepest+16);el.style.minHeight=h+'px';setSize({w:el.scrollWidth,h});setLinks(next)};
  draw();const ro=new ResizeObserver(draw);ro.observe(el);return()=>ro.disconnect()},[chart,members,search,selected,zoom]);
 // The selected person (or section) is brought into sight with the sections his lines go to, when they fit together.
 useLayoutEffect(()=>{if(!selected)return;const el=canvas.current,v=view.current;if(!el||!v)return;
  const key=selected.startsWith('a:')?selected:'u:'+selected,ends=[key,...(chart.extras||[]).filter(x=>key==='u:'+x.userId||key==='a:'+x.areaId).map(x=>key.startsWith('u:')?'a:'+x.areaId:'u:'+x.userId)];
  const rects=ends.map(k=>el.querySelector<HTMLElement>(`[data-node="${k}"]`)?.getBoundingClientRect()).filter((r):r is DOMRect=>!!r);if(!rects.length)return;
  const r=v.getBoundingClientRect(),left=Math.min(...rects.map(x=>x.left)),right=Math.max(...rects.map(x=>x.right));
  if(left>=r.left&&right<=r.right)return;
  // Too far apart to fit: he stays at the edge away from his sections, so as much of his lines as possible shows.
  const me=rects[0],toLeft=left<me.left;
  const shift=right-left<=v.clientWidth-24?(left+right)/2-(r.left+v.clientWidth/2):toLeft?me.right-(r.left+v.clientWidth-16):me.left-(r.left+16);
  v.scrollBy({left:shift,behavior:'smooth'})
  // Only when the selection changes: moving boxes while he stays selected must not pull the view around.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[selected]);
 return <div className="org-tree-wrap">
  <div className="org-zoom" role="group" aria-label="تكبير الهيكل وتصغيره">
   <button type="button" className="icon-btn" aria-label="تصغير" title="تصغير (أو عجلة الفأرة)" onClick={()=>setZoom(zoom/1.15)}><Minus size={15}/></button>
   <button type="button" className="org-zoom-value" title="الحجم الطبيعي" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}٪</button>
   <button type="button" className="icon-btn" aria-label="تكبير" title="تكبير (أو عجلة الفأرة)" onClick={()=>setZoom(zoom*1.15)}><Plus size={15}/></button>
   <button type="button" className="icon-btn" aria-label="ملاءمة الهيكل للشاشة" title="ملاءمة الهيكل كله للشاشة" onClick={fit}><Maximize2 size={14}/></button></div>
  <div className={'org-tree'+(panning?' panning':'')} ref={view} aria-label="الهيكل الوظيفي" onPointerDown={pan}>
  <div className="org-canvas" ref={canvas} style={{zoom}}>
  {links.length>0&&<svg className="org-links" width={size.w} height={size.h} aria-hidden>
   <defs><marker id="org-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
   {[...links].sort((a,b)=>Number(a.on)-Number(b.on)).map(l=><path key={l.id} d={l.d} className={l.on?'on':''} markerEnd="url(#org-arrow)"/>)}</svg>}
  <div onDragOver={e=>{if(trayOk){e.preventDefault();if(over?.key!=='top')setOver({key:'top',zone:'into'})}}} onDragLeave={()=>{if(over?.key==='top')setOver(null)}}
   onDrop={e=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain')||drag;setDrag('');setOver(null);if(from&&trayOk)onMove(from,null)}}
   className={'org-tray'+(over?.key==='top'?' drop':'')} aria-label="لم يوضعوا في الهيكل بعد">
   <b>لم يوضعوا في الهيكل بعد {loose.length>0&&<span className="tag">{peopleCount(loose.length)}</span>}</b>
   {loose.length?<div className="org-leaves">{loose.map(x=>personBox(x.member!))}</div>:<small>الجميع في أماكنهم. أفلت هنا أي صندوق لإخراجه من الهيكل.</small>}</div>
  {heads.length>0&&<ul className="org-root">{heads.map(h=><li key={h.key}>{branch(h)}</li>).reverse()}</ul>}
  </div></div>
  {drag&&<p className="org-tip" role="status">أفلته إلى جانب صندوق ليأخذ مكانه بجواره، أو في وسط صندوق شخص ليتبعه أو في وسط قسم ليدخله، أو في «لم يوضعوا في الهيكل بعد» لإخراجه.</p>}
 </div>;
}
