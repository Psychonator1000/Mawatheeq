'use client';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Building2,FolderTree,Maximize2,Minus,Plus,UsersRound} from 'lucide-react';
import type {Member} from '@/lib/office';
import {WORKSPACE_LABELS,rolesLabel,type JobRole} from '@/lib/permissions';
import {inferRoles,ROLE_ICONS} from './permission-editor';
import {normalizeSearch} from '@/lib/case-browse';
import {isOnline,nodesBelow,parents,peopleBelow,peopleCount,type TeamArea,type TeamChart} from '@/lib/team';
import {BOX_W,freeSpot,layoutBoard,obstacles,snap,type Flow} from '@/lib/org-layout';

const name=(m:Member)=>m.displayName||m.username;
const ZOOM_KEY='mawatheeq.org-zoom.v1',MIN_ZOOM=0.3,MAX_ZOOM=1.5,MARGIN=60;
const readZoom=()=>{try{const z=Number(localStorage.getItem(ZOOM_KEY));return z>=MIN_ZOOM&&z<=MAX_ZOOM?z:1}catch{return 1}};
type Line={id:string;d:string;kind:'tree'|'area'|'boss';on:boolean};
type Drag={key:string;sx:number;sy:number;dx:number;dy:number;moved:boolean;target:string|null;tray:boolean;board:boolean;rejoin:boolean};

/**
 * «فريق المكتب» as a board on a grid (as devices on a network map): the office's people (the program's own owner
 * account is left out) and sections, each head joined to the people and sections under him by lines.
 *
 * Every box can be put anywhere: dragged to an empty spot it stays there (on the grid), with everything under it.
 * Dropped in the middle of a person it goes under him; in the middle of a section, into it; on the tray of people not
 * placed yet, out of the tree. Boxes never moved by hand arrange themselves under their head, whose branch grows down,
 * to the left or to the right. People with nobody under them sit together in one block under their head.
 *
 * Besides the lines of the tree: a line ending in an arrow runs from a person to each other section (workspace) he is
 * also in, and a line ending in a circle from a person to each other person he also answers to. The selected person's
 * lines stand out. The wheel zooms around the pointer, dragging an empty spot moves the board, and a click on a box
 * opens what can be changed for it.
 */
export default function OrgTree({members,chart,search,selected,onPick,onPickArea,onMove,onPlace,canMove}:{members:Member[];chart:TeamChart;search:string;selected:string;
 onPick:(m:Member)=>void;onPickArea:(a:TeamArea)=>void;onMove:(node:string,target:string|null)=>void;
 onPlace:(positions:Record<string,[number,number]|null>)=>void;canMove:(m:Member)=>boolean}){
 // The owner account is the program's own administrator, not a person in the office: it stays off the board.
 const staff=useMemo(()=>members.filter(m=>m.role!=='owner'),[members]);
 const byKey=useMemo(()=>new Map<string,{member?:Member;area?:TeamArea}>([...staff.map(m=>['u:'+m.id,{member:m}] as const),...chart.areas.map(a=>['a:'+a.id,{area:a}] as const)]),[staff,chart.areas]);
 const parent=useMemo(()=>parents(chart),[chart]);
 // Children of each node, in the order arranged (then sections first, bigger teams first, by name); a node whose parent
 // is unknown (a person since removed) sits at the top ('').
 const kids=useMemo(()=>{const k=new Map<string,string[]>(),pos=chart.order||{};
  for(const key of byKey.keys()){const up=parent.get(key),at=up&&byKey.has(up)?up:'';k.set(at,[...(k.get(at)||[]),key])}
  const label=(key:string)=>{const n=byKey.get(key)!;return n.area?n.area.name:name(n.member!)},at=(key:string)=>pos[key]??Infinity;
  for(const list of k.values())list.sort((a,b)=>at(a)-at(b)||Number(b.startsWith('a:'))-Number(a.startsWith('a:'))||(k.get(b)?.length||0)-(k.get(a)?.length||0)||label(a).localeCompare(label(b),'ar'));
  return k},[byKey,parent,chart.order]);
 const placed=useMemo(()=>chart.layout||{},[chart.layout]);
 const isLeaf=(key:string)=>key.startsWith('u:')&&!kids.get(key)?.length;
 // Not placed yet: people with nobody above or under them and never put on the board by hand wait in the tray.
 const loose=(kids.get('')||[]).filter(k=>isLeaf(k)&&!placed[k]);
 const board=useMemo(()=>{const k=new Map(kids);k.set('',(kids.get('')||[]).filter(x=>!(x.startsWith('u:')&&!kids.get(x)?.length&&!placed[x])));
  return layoutBoard({kids:k,isLeaf:x=>x.startsWith('u:')&&!kids.get(x)?.length,placed,flows:chart.flow||{}})},[kids,placed,chart.flow]);
 // The board's corner: every box is drawn this far from the leftmost and topmost one.
 const origin=useMemo(()=>{let x=Infinity,y=Infinity;for(const p of board.at.values()){x=Math.min(x,p.x);y=Math.min(y,p.y)}
  for(const g of board.groups){x=Math.min(x,g.x);y=Math.min(y,g.y)}return {x:Number.isFinite(x)?x-MARGIN:0,y:Number.isFinite(y)?y-MARGIN:0}},[board]);
 const q=normalizeSearch(search.trim());
 const hit=(m:Member)=>!q||normalizeSearch([m.username,m.displayName||''].join(' ')).includes(q);

 // Zoom (the wheel, around the pointer, or the buttons) and moving the board by dragging an empty spot, as on a map.
 const view=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null),[zoom,setZoomState]=useState(readZoom),zoomRef=useRef(zoom);
 const setZoom=(z:number,cx?:number,cy?:number)=>{const v=view.current;z=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,Math.round(z*100)/100));if(!v||z===zoomRef.current)return;
  const r=v.getBoundingClientRect(),mx=cx===undefined?v.clientWidth/2:cx-r.left,my=cy===undefined?v.clientHeight/2:cy-r.top,old=zoomRef.current;
  const px=(v.scrollLeft+mx)/old,py=(v.scrollTop+my)/old;zoomRef.current=z;setZoomState(z);try{localStorage.setItem(ZOOM_KEY,String(z))}catch{/* this visit only */}
  requestAnimationFrame(()=>{v.scrollLeft=px*z-mx;v.scrollTop=py*z-my})};
 const fit=()=>{const v=view.current,c=canvas.current;if(!v||!c)return;setZoom(Math.min(1,(v.clientWidth-24)/(c.offsetWidth||1),(v.clientHeight-24)/(c.offsetHeight||1)))};
 useEffect(()=>{const v=view.current;if(!v)return;
  const wheel=(e:WheelEvent)=>{e.preventDefault();setZoom(zoomRef.current*(e.deltaY<0?1.1:1/1.1),e.clientX,e.clientY)};
  v.addEventListener('wheel',wheel,{passive:false});return()=>v.removeEventListener('wheel',wheel)},[]);
 const [panning,setPanning]=useState(false);
 const pan=(e:React.PointerEvent)=>{const v=view.current;if(!v||e.button!==0||(e.target as HTMLElement).closest('button,input,a,.org-zoom'))return;
  const x=e.clientX,y=e.clientY,sl=v.scrollLeft,st=v.scrollTop;setPanning(true);
  const move=(ev:PointerEvent)=>{v.scrollLeft=sl-(ev.clientX-x);v.scrollTop=st-(ev.clientY-y)};
  const up=()=>{setPanning(false);removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up)};
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up)};

 // Dragging a box: it follows the pointer with everything under it. Over the middle of another box it goes under (or
 // into) it; over the tray, out of the tree; anywhere else on the board it stays where it is let go, on the grid.
 const [drag,setDrag]=useState<Drag|null>(null),dragRef=useRef<Drag|null>(null);
 // What moves with a dragged box: everything under it; with a dragged block, its people.
 const carried=(key:string)=>key.startsWith('g:')?new Set([key,...(board.groups.find(g=>'g:'+g.parent===key)?.keys||[])]):new Set([key,...nodesBelow(parent,key)]);
 const moving=useMemo(()=>drag?.moved?carried(drag.key):new Set<string>(),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- carried reads the board and the tree
  [drag,parent,board]);
 const start=(e:React.PointerEvent,key:string,movable:boolean,onBoard:boolean)=>{if(e.button!==0)return;e.stopPropagation();
  const d:Drag={key,sx:e.clientX,sy:e.clientY,dx:0,dy:0,moved:false,target:null,tray:false,board:false,rejoin:false};dragRef.current=d;
  const blocked=carried(key),isBlock=key.startsWith('g:');
  const move=(ev:PointerEvent)=>{const cur=dragRef.current!;const dx=ev.clientX-cur.sx,dy=ev.clientY-cur.sy;
   if(!cur.moved&&(!movable||Math.hypot(dx,dy)<5))return;
   let target:string|null=null,tray=false,onB=false,rejoin=false;
   for(const el of document.elementsFromPoint(ev.clientX,ev.clientY) as HTMLElement[]){
    const node=el.closest<HTMLElement>('[data-node]')?.dataset.node;
    if(node&&!blocked.has(node)&&!isBlock){const r=el.closest<HTMLElement>('[data-node]')!.getBoundingClientRect(),fx=(ev.clientX-r.left)/r.width,fy=(ev.clientY-r.top)/r.height;
     if(fx>0.2&&fx<0.8&&fy>0.15&&fy<0.85&&(parent.get(key)||null)!==node){target=node;break}}
    if(el.classList?.contains('org-tray')&&!isBlock){tray=true;break}
    // Back over the frame of his own team: he rejoins it.
    if(el.classList?.contains('org-group')&&!isBlock&&el.dataset.group===parent.get(key)&&!kids.get(key)?.length){rejoin=true;onB=true;break}
    if(el.classList?.contains('org-canvas')||el.classList?.contains('org-tree')){onB=true;break}}
   const next={...cur,dx,dy,moved:true,target,tray,board:onB,rejoin};dragRef.current=next;setDrag(next)};
  const up=(ev:PointerEvent)=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);
   const cur=dragRef.current!;dragRef.current=null;setDrag(null);
   if(isBlock){if(!cur.moved||!cur.board)return;const g=board.groups.find(x=>'g:'+x.parent===key)!,head=board.at.get(g.parent)!,z=zoomRef.current;
    onPlace({[key]:[snap(g.x-head.x+cur.dx/z),snap(g.y-head.y+cur.dy/z)]});return}
   if(!cur.moved){if(ev.type==='pointerup'){const n=byKey.get(key);if(n?.member)onPick(n.member);else if(n?.area)onPickArea(n.area)}return}
   const clear=Object.fromEntries([...blocked].filter(k=>placed[k]).map(k=>[k,null])) as Record<string,null>;
   if(cur.target){onMove(key,cur.target);if(Object.keys(clear).length)onPlace(clear);return}
   if(cur.rejoin){onPlace({[key]:null});return}
   if(cur.tray){if((parent.get(key)||null)!==null)onMove(key,null);onPlace({...clear,[key]:null});return}
   if(!cur.board)return;
   const z=zoomRef.current,c=canvas.current!.getBoundingClientRect();
   // Let go on the board: the box takes that spot (snapped to the grid), and boxes put by hand under it move as much.
   const from=onBoard?board.at.get(key)!:{x:(cur.sx-c.left)/z+origin.x-BOX_W/2,y:(cur.sy-c.top)/z+origin.y-20};
   // Never on top of another box: let go over one, it takes the nearest free spot beside it.
   const want={x:snap(from.x+cur.dx/z),y:snap(from.y+cur.dy/z)},free=freeSpot(want.x,want.y,obstacles(board,blocked));
   const dx=free.x-from.x,dy=free.y-from.y,out:Record<string,[number,number]>={[key]:[free.x,free.y]};
   for(const k of blocked)if(k!==key&&placed[k])out[k]=[snap(placed[k][0]+dx),snap(placed[k][1]+dy)];
   onPlace(out)};
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up)};
 const shift=(key:string)=>drag?.moved&&moving.has(key)?{transform:`translate(${drag.dx/zoom}px,${drag.dy/zoom}px)`}:undefined;

 const personBox=(m:Member,onBoard:boolean)=>{const key='u:'+m.id,team=peopleBelow(parent,key).size,roles=m.permissions?inferRoles(m.permissions):[],movable=canMove(m),p=board.at.get(key);
  const also=(chart.extras||[]).filter(x=>x.userId===m.id).map(x=>chart.areas.find(a=>a.id===x.areaId)?.name).filter(Boolean);
  const target=drag?.target===key;
  return <button type="button" key={m.id} data-person={m.username} data-node={key} aria-pressed={selected===m.id} onPointerDown={e=>start(e,key,movable,onBoard)}
   onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick(m)}}}
   className={'org-box'+(team?' lead':'')+(m.enabled?'':' off')+(selected===m.id?' on':'')+(q&&!hit(m)?' dim':'')+(target?' drop':'')+(moving.has(key)?' dragging':'')}
   style={onBoard&&p?{left:p.x-origin.x,top:p.y-origin.y,...shift(key)}:shift(key)}
   title={movable?'اضغط لعرض خياراته. اسحبه إلى أي مكان، أو إلى وسط صندوق شخص ليتبعه، أو إلى وسط قسم ليدخله':'اضغط لعرض خياراته'}>
   
   {team>0&&<UsersRound size={14} aria-hidden className="org-icon"/>}
   {isOnline(chart,m.id)&&<span className="org-online" title="متصل الآن" aria-label="متصل الآن"/>}
   <b>{name(m)}</b><small dir="ltr">{m.username}</small>
   <span className="org-meta">{roles.length?rolesLabel(roles):'بلا دور'}{!m.enabled&&' · موقوف'}</span>
   {team>0&&<span className="org-team">مسؤول عن {peopleCount(team)}</span>}{also.length>0&&<span className="org-also">أيضاً في: {also.join('، ')}</span>}
   {target&&<span className="org-drop-label">{drag!.key.startsWith('a:')?'تحته':'يتبعه'}</span>}</button>};
 const areaBox=(a:TeamArea)=>{const key='a:'+a.id,count=peopleBelow(parent,key).size,Icon=a.role==='branch'?Building2:a.role&&ROLE_ICONS[a.role as JobRole]||FolderTree,p=board.at.get(key),target=drag?.target===key;
  return <button type="button" key={a.id} data-area={a.name} data-node={key} aria-pressed={selected===key} onPointerDown={e=>start(e,key,true,true)}
   onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPickArea(a)}}}
   className={'org-box org-area'+(a.role==='branch'?' org-branch':'')+(selected===key?' on':'')+(target?' drop':'')+(moving.has(key)?' dragging':'')}
   style={p?{left:p.x-origin.x,top:p.y-origin.y,...shift(key)}:undefined}
   title="قسم: اضغط لتسميته أو نقله أو حذفه. اسحبه إلى أي مكان، أو أفلت في وسطه موظفين">
   <Icon size={15} aria-hidden className="org-icon"/><b>{a.name}</b>
   <span className="org-meta">{count?peopleCount(count):'فارغ — أفلت فيه موظفين'}</span>{a.workspace&&<span className="org-team" title={`من فيه يفتح ${WORKSPACE_LABELS[a.workspace]} فقط`}>مساحة {WORKSPACE_LABELS[a.workspace].split(' (')[0]}</span>}
   {target&&<span className="org-drop-label">داخله</span>}</button>};

 // The lines, measured from the boxes after every layout change, in the board's own (unzoomed) units: each head to the
 // people and sections under him (to a block as a whole), then a person's other sections (arrow) and other bosses (circle).
 const [lines,setLines]=useState<Line[]>([]),[size,setSize]=useState({w:0,h:0});
 useLayoutEffect(()=>{const el=canvas.current;if(!el)return;
  const draw=()=>{const z=zoomRef.current,box=el.getBoundingClientRect();
   const rect=(k:string)=>{const r=el.querySelector<HTMLElement>(`[data-node="${k}"]`)?.getBoundingClientRect();return r&&{l:(r.left-box.left)/z,t:(r.top-box.top)/z,r:(r.right-box.left)/z,b:(r.bottom-box.top)/z}};
   const block=(k:string)=>{const r=el.querySelector<HTMLElement>(`[data-group="${k}"]`)?.getBoundingClientRect();return r&&{l:(r.left-box.left)/z,t:(r.top-box.top)/z,r:(r.right-box.left)/z,b:(r.bottom-box.top)/z}};
   type R={l:number;t:number;r:number;b:number};
   // A head's line leaves the side of his box that faces the box it goes to (beside it: the side; below or above: the
   // bottom or top), enters the facing side of the other, and turns once halfway; it never crosses either box.
   const elbow=(a:R,c:R,dir:Flow)=>{const ax=(a.l+a.r)/2,ay=(a.t+a.b)/2,cx=(c.l+c.r)/2,cy=(c.t+c.b)/2;
    const side=c.l>=a.r+8||c.r<=a.l-8,vert=c.t>=a.b+8||c.b<=a.t-8;
    if(side&&(!vert||dir!=='down')){const right=c.l>=a.r,x1=right?a.r:a.l,x2=right?c.l:c.r,m=(x1+x2)/2;return `M${x1},${ay} H${m} V${cy} H${x2}`}
    if(vert){const down=c.t>=a.b,y1=down?a.b:a.t,y2=down?c.t:c.b,m=(y1+y2)/2;return `M${ax},${y1} V${m} H${cx} V${y2}`}
    return `M${ax},${ay} L${cx},${cy}`};
   const curve=(a:R,b:R)=>{const x1=(a.l+a.r)/2,y1=a.b,x2=(b.l+b.r)/2,below=b.t>a.b,y2=below?b.t:b.b,k=Math.max(44,Math.abs(x2-x1)*0.12);
    return below?`M${x1},${y1} C${x1},${y1+k} ${x2},${y2-k} ${x2},${y2}`:`M${x1},${y1} C${x1},${y1+k} ${x2},${Math.max(y1,y2)+k} ${x2},${y2}`};
   const out:Line[]=[],grouped=new Set(board.groups.flatMap(g=>g.keys));
   for(const g of board.groups){const a=rect(g.parent),c=block(g.parent);if(a&&c)out.push({id:'g'+g.parent,d:elbow(a,c,board.flow(g.parent)),kind:'tree',on:false})}
   for(const [k,up] of parent){if(grouped.has(k))continue;const a=rect(up),c=rect(k);if(a&&c)out.push({id:'t'+k,d:elbow(a,c,board.flow(up)),kind:'tree',on:false})}
   for(const x of chart.extras||[]){const a=rect('u:'+x.userId),b=rect('a:'+x.areaId);if(a&&b)out.push({id:'x'+x.userId+x.areaId,d:curve(a,b),kind:'area',on:selected===x.userId||selected==='a:'+x.areaId})}
   for(const x of chart.bosses||[]){const a=rect('u:'+x.userId),b=rect('u:'+x.managerId);if(a&&b)out.push({id:'b'+x.userId+x.managerId,d:curve(a,b),kind:'boss',on:selected===x.userId||selected===x.managerId})}
   setSize({w:el.offsetWidth,h:el.offsetHeight});setLines(out)};
  draw();const ro=new ResizeObserver(draw);ro.observe(el);return()=>ro.disconnect()},[board,chart,members,search,selected,zoom,drag,origin,parent]);
 // The selected person (or section) is brought into sight with the boxes his lines go to, when they fit together.
 useLayoutEffect(()=>{if(!selected)return;const el=canvas.current,v=view.current;if(!el||!v)return;
  const key=selected.startsWith('a:')?selected:'u:'+selected;
  const ends=[key,...(chart.extras||[]).filter(x=>key==='u:'+x.userId||key==='a:'+x.areaId).map(x=>key.startsWith('u:')?'a:'+x.areaId:'u:'+x.userId),
   ...(chart.bosses||[]).filter(x=>key==='u:'+x.userId||key==='u:'+x.managerId).map(x=>key==='u:'+x.userId?'u:'+x.managerId:'u:'+x.userId)];
  const rects=ends.map(k=>el.querySelector<HTMLElement>(`[data-node="${k}"]`)?.getBoundingClientRect()).filter((r):r is DOMRect=>!!r);if(!rects.length)return;
  const r=v.getBoundingClientRect(),left=Math.min(...rects.map(x=>x.left)),right=Math.max(...rects.map(x=>x.right)),top=Math.min(...rects.map(x=>x.top)),bottom=Math.max(...rects.map(x=>x.bottom));
  const me=rects[0];
  const sx=left>=r.left&&right<=r.right?0:right-left<=v.clientWidth-24?(left+right)/2-(r.left+v.clientWidth/2):left<me.left?me.right-(r.left+v.clientWidth-16):me.left-(r.left+16);
  const sy=top>=r.top&&bottom<=r.bottom?0:bottom-top<=v.clientHeight-24?(top+bottom)/2-(r.top+v.clientHeight/2):me.top-(r.top+16);
  if(sx||sy)v.scrollBy({left:sx,top:sy,behavior:'smooth'})
  // Only when the selection changes: moving boxes while he stays selected must not pull the view around.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[selected]);

 let w=0,h=0;for(const p of board.at.values()){w=Math.max(w,p.x-origin.x+BOX_W+MARGIN);h=Math.max(h,p.y-origin.y+140)}
 for(const g of board.groups){w=Math.max(w,g.x-origin.x+g.w+MARGIN);h=Math.max(h,g.y-origin.y+g.h+MARGIN)}
 return <div className="org-tree-wrap">
  <div className={'org-tray'+(drag?.tray?' drop':'')} aria-label="لم يوضعوا في الهيكل بعد">
   <b>لم يوضعوا في الهيكل بعد {loose.length>0&&<span className="tag">{peopleCount(loose.length)}</span>}</b>
   {loose.length?<div className="org-leaves">{loose.map(k=>personBox(byKey.get(k)!.member!,false))}</div>:<small>الجميع في أماكنهم. أفلت هنا أي صندوق لإخراجه من الهيكل.</small>}</div>
  <div className="org-board">
  <div className="org-zoom" role="group" aria-label="تكبير الهيكل وتصغيره">
   <button type="button" className="icon-btn" aria-label="تصغير" title="تصغير (أو عجلة الفأرة)" onClick={()=>setZoom(zoom/1.15)}><Minus size={15}/></button>
   <button type="button" className="org-zoom-value" title="الحجم الطبيعي" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}٪</button>
   <button type="button" className="icon-btn" aria-label="تكبير" title="تكبير (أو عجلة الفأرة)" onClick={()=>setZoom(zoom*1.15)}><Plus size={15}/></button>
   <button type="button" className="icon-btn" aria-label="ملاءمة الهيكل للشاشة" title="ملاءمة الهيكل كله للشاشة" onClick={fit}><Maximize2 size={14}/></button>
   {Object.keys(placed).length>0&&<button type="button" className="org-zoom-reset" title="إرجاع كل الصناديق إلى ترتيبها التلقائي تحت رؤسائها"
    onClick={()=>{if(window.confirm('إرجاع كل الصناديق إلى ترتيبها التلقائي؟ تبقى التبعية والأقسام كما هي، ويُلغى ما نقلته يدوياً فقط.'))onPlace(Object.fromEntries(Object.keys(placed).map(k=>[k,null])))}}>ترتيب تلقائي</button>}</div>
  <div className={'org-tree'+(panning?' panning':'')+(drag?.moved?' moving':'')} ref={view} aria-label="الهيكل الوظيفي" onPointerDown={pan}>
  <div className="org-canvas" ref={canvas} style={{zoom,width:w,height:h}}>
   <svg className="org-links" width={size.w} height={size.h} aria-hidden>
    <defs><marker id="org-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>
     <marker id="org-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8"><circle cx="5" cy="5" r="4"/></marker></defs>
    {[...lines].sort((a,b)=>Number(a.on)-Number(b.on)).map(l=><path key={l.id} d={l.d} className={l.kind+(l.on?' on':'')} markerEnd={l.kind==='area'?'url(#org-arrow)':l.kind==='boss'?'url(#org-dot)':undefined}/>)}</svg>
   {board.groups.map(g=><div key={g.parent} className={'org-group'+(moving.has('g:'+g.parent)?' dragging':'')+(drag?.rejoin&&parent.get(drag.key)===g.parent?' drop':'')} data-group={g.parent} title="اسحب الإطار لنقل هذه المجموعة كلها"
    onPointerDown={e=>start(e,'g:'+g.parent,true,true)} style={{left:g.x-origin.x,top:g.y-origin.y,width:g.w,height:g.h,...(moving.has('g:'+g.parent)||moving.has(g.parent)?shift(moving.has('g:'+g.parent)?'g:'+g.parent:g.parent):undefined)}}/>)}
   {[...board.at.keys()].map(k=>{const n=byKey.get(k);return n?.member?personBox(n.member,true):n?.area?areaBox(n.area):null})}
  </div></div></div>
  {drag?.moved&&<p className="org-tip" role="status">{drag.target?'أفلته الآن ليصبح تحته':drag.tray?'أفلته الآن لإخراجه من الهيكل':drag.rejoin?'أفلته الآن ليعود إلى إطار فريقه':'أفلته في أي مكان ليبقى فيه، أو في وسط صندوق شخص ليتبعه أو في وسط قسم ليدخله.'}</p>}
 </div>;
}
