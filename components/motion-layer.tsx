import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {ArrowUp} from 'lucide-react';
import {motionAllowed,pointerEffectsOn,toggleSecretTheme,SECRET_WORDS,loadAppearance,saveAppearance,markSlow} from '@/lib/appearance';
import {toast} from 'sonner';
import {createBackdrop,createBursts,type FxState} from './motion-fx';
import './motion.css';
import './themes.generated.css';
import './themes.css';

const RIPPLE='.btn,.icon-btn,.nav-button,.office-card,.stat,.workspace-option,.client-card,.person-card,.calendar-add,.account-menu-item,.notice-item,.choice,.my-work-item,.back-to-top,.text-link,.number-link,.legend-row,[role=tab],.att-cell,.chip-toggle,.rail-mark,.device-card';
const STRONG='.btn.primary,.back-to-top,.workspace-option,.stat.featured';
const MAGNETIC='.btn.primary,.icon-btn,.back-to-top,.quick-search-trigger';
const GLOW='.panel,.office-card,.client-card,.person-card,.my-work-item,.device-card,.att-stat';
const INTERACTIVE='a,button,[role=button],[role=tab],input,select,textarea,label,summary';
// Rows, cards and list items that sweep in from the scroll direction each time they enter the screen.
const REACTIVE='.office-card,.client-card,.person-card,.collection-card,.device-card,.att-stat,.stat,.my-work-item,.agenda-item,.notice-list li,.timeline-item,.doc-row,.quick-card,.legend-row,.bar-item,.calendar-day,.comment-list li,.department-metrics>div,.holiday-list li,.bridge-list li,.evidence-row,.help-block,.empty-state,.page-navigation,.pagination';
// Table rows: revealed once, cell by cell, and a spotlight follows the row at the reading line while scrolling.
const ROWS=':is(.case-table,.office-table)>tbody>tr';
const HEADINGS='.workspace h1,.workspace h2,.department-content h1,.department-content h2,.workspace-chooser h1';

/** Remember one hovered element per effect and clear its variables when the pointer moves on. */
function tracker(clear:(el:HTMLElement)=>void){let el:HTMLElement|null=null;return (next:HTMLElement|null)=>{if(next!==el){if(el)clear(el);el=next}return el}}
type Mark={top:number;label:string;el:HTMLElement};
/** Ransom-note letters for the calling card: each cut out in its own style and angle (fixed pattern, no randomness). */
const RANSOM=['r-w','r-b','r-r','r-w','r-b','r-w','r-r','r-b'];
const ransom=(text:string)=>text.split(' ').map((word,w)=><span key={w} className="ransom-word">{[...word].map((ch,i)=><span key={i} className={'ransom '+RANSOM[(i*3+w*5)%RANSOM.length]} style={{rotate:`${((i*7+w*3)%9-4)*2}deg`}}>{ch}</span>)}</span>);

/**
 * Ambient, pointer-reactive background, dot-web press bursts, magnetic buttons, edge glow,
 * scroll velocity for the content, and a section rail. Everything is decorative: pointer-events none
 * (except the rail's own markers), CSS variables only, rAF-batched, paused for hidden tabs,
 * touch input, the "off" motion level and reduced-motion preferences.
 */
export default function MotionLayer() {
 const [showTop,setShowTop]=useState(false),[splash,setSplash]=useState(''),[marks,setMarks]=useState<Mark[]>([]),[active,setActive]=useState(-1),[scrollable,setScrollable]=useState(false);
 const ambient=useRef<HTMLCanvasElement>(null),burst=useRef<HTMLCanvasElement>(null),marksRef=useRef<Mark[]>([]);
 useEffect(()=>{
  const root=document.documentElement,reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,x=-999,y=-999,tilt:HTMLElement|null=null,magnet:HTMLElement|null=null,glow:HTMLElement|null=null,pointerOn=false;
  let scrollDir='down',lastScrollAt=0;
  let lastTop=scrollY,lastTime=performance.now(),velocity=0,velFrame=0,settle=0,lastTick=0;
  const fx:FxState={mode:'',motion:'',reduced:false,pointerX:-999,pointerY:-999,pointerOn:false,scrollV:0};
  const state=()=>{const backdropMode=root.dataset.backdrop||'constellation',theme=root.dataset.theme;fx.mode=backdropMode==='none'?'none':theme==='sky'?'bubbles':theme==='rose'?'sakura':theme?.startsWith('phantom')?'phantom':theme?.startsWith('yorha')?'yorha':backdropMode==='petals'?'sakura':backdropMode;fx.motion=root.dataset.motion||'full';fx.reduced=reducedQuery.matches||root.dataset.perf==='lite';fx.pointerX=x;fx.pointerY=y;fx.pointerOn=pointerOn;fx.scrollV=velocity;return fx};
  const backdrop=ambient.current?createBackdrop(ambient.current,state):null,bursts=burst.current?createBursts(burst.current):null;
  const unset=(...names:string[])=>(el:HTMLElement)=>names.forEach(n=>el.style.removeProperty(n));
  const trackTilt=tracker(unset('--tilt-x','--tilt-y')),trackMagnet=tracker(unset('--mag-x','--mag-y')),trackGlow=tracker(unset('--gx','--gy'));
  const paint=()=>{frame=0;
   root.style.setProperty('--ax',(x/innerWidth).toFixed(4));root.style.setProperty('--ay',(y/innerHeight).toFixed(4));
   root.style.setProperty('--cx',x.toFixed(0)+'px');root.style.setProperty('--cy',y.toFixed(0)+'px');
   if(tilt){const r=tilt.getBoundingClientRect(),tx=(x-r.left)/r.width-.5,ty=(y-r.top)/r.height-.5;
    tilt.style.setProperty('--tilt-x',(-ty*7).toFixed(2)+'deg');tilt.style.setProperty('--tilt-y',(tx*7).toFixed(2)+'deg');
    tilt.style.setProperty('--glare-x',((tx+.5)*100).toFixed(1)+'%');tilt.style.setProperty('--glare-y',((ty+.5)*100).toFixed(1)+'%')}
   if(magnet){const r=magnet.getBoundingClientRect(),mx=(x-r.left)/r.width-.5,my=(y-r.top)/r.height-.5;
    magnet.style.setProperty('--mag-x',(mx*6).toFixed(2)+'px');magnet.style.setProperty('--mag-y',(my*5).toFixed(2)+'px')}
   if(glow){const r=glow.getBoundingClientRect();glow.style.setProperty('--gx',(x-r.left).toFixed(0)+'px');glow.style.setProperty('--gy',(y-r.top).toFixed(0)+'px')}};
  let hoverOn=false;
  const onMove=(e:PointerEvent)=>{
   if(e.pointerType!=='mouse'||!pointerEffectsOn()){if(pointerOn){pointerOn=false;root.removeAttribute('data-pointer')}return}
   x=e.clientX;y=e.clientY;if(!pointerOn){pointerOn=true;root.setAttribute('data-pointer','')}
   const t=e.target instanceof Element?e.target:null;
   tilt=trackTilt(t?.closest('[data-tilt]') as HTMLElement|null);
   magnet=trackMagnet(t?.closest(MAGNETIC) as HTMLElement|null);
   glow=trackGlow(t?.closest(GLOW) as HTMLElement|null);
   // Only the cursor circle changes, never the whole page, so moving the mouse stays cheap.
   const hover=!!t?.closest(INTERACTIVE);if(hoverOn!==hover){hoverOn=hover;document.querySelector('.cursor-halo')?.toggleAttribute('data-hover',hover)}
   if(!frame&&!document.hidden)frame=requestAnimationFrame(paint);
  };
  const onLeave=()=>{tilt=trackTilt(null);magnet=trackMagnet(null);glow=trackGlow(null);pointerOn=false;root.removeAttribute('data-pointer')};
  // Each press sends a soft ripple through the element and a web of dots around it.
  const onDown=(e:PointerEvent)=>{
   if(!motionAllowed()||e.button>0)return;
   const el=e.target instanceof Element?e.target.closest(RIPPLE) as HTMLElement|null:null;
   document.querySelector('.cursor-halo')?.setAttribute('data-press','');
   if(!el||(el as HTMLButtonElement).disabled){backdrop?.pulse(e.clientX,e.clientY);return}
   if(getComputedStyle(el).position==='static')el.style.position='relative';
   const r=el.getBoundingClientRect(),size=Math.max(r.width,r.height)*2.2;
   const host=document.createElement('span');host.className='ripple-host';host.setAttribute('aria-hidden','true');
   const wave=document.createElement('span');wave.className='ripple';
   wave.style.cssText=`width:${size}px;height:${size}px;left:${e.clientX-r.left-size/2}px;top:${e.clientY-r.top-size/2}px`;
   host.appendChild(wave);el.appendChild(host);
   wave.addEventListener('animationend',()=>host.remove(),{once:true});setTimeout(()=>host.remove(),1200);
   bursts?.fire(e.clientX,e.clientY,Math.min(r.width,r.height)+40,!!el.closest(STRONG));backdrop?.pulse(e.clientX,e.clientY);
  };
  const onUp=()=>document.querySelector('.cursor-halo')?.removeAttribute('data-press');
  // Scroll speed drives the content's elastic lag, the rail comet and the backdrop drift.
  const tickVelocity=(now:number)=>{velFrame=0;
   velocity*=Math.pow(.86,Math.min(6,(now-(lastTick||now-16))/16));lastTick=now;if(Math.abs(velocity)<.01)velocity=0;
   root.style.setProperty('--scroll-v',velocity.toFixed(3));root.style.setProperty('--scroll-speed',Math.min(1,Math.abs(velocity)).toFixed(3));
   if(velocity!==0)velFrame=requestAnimationFrame(tickVelocity);else{lastTick=0;clearTimeout(settle);settle=window.setTimeout(()=>root.removeAttribute('data-scrolling'),120)}};
  // Scroll events can fire many times per frame; the work runs once per frame.
  let scrollFrame=0;
  const onScroll=()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;onScrollFrame()})};
  const onScrollFrame=()=>{
   const prevTop=lastTop;
   const se=document.scrollingElement||root,max=se.scrollHeight-se.clientHeight,top=se.scrollTop,now=performance.now();
   root.style.setProperty('--scroll-progress',max>0?Math.min(1,top/max).toFixed(4):'0');
   root.toggleAttribute('data-scrolled',top>12);
   setShowTop(top>700);setScrollable(max>320);
   if(pointerEffectsOn()){const v=Math.max(-1,Math.min(1,(top-lastTop)/Math.max(8,now-lastTime)/2.4));velocity=velocity*.5+v*.5;root.setAttribute('data-scrolling','');if(!velFrame)velFrame=requestAnimationFrame(tickVelocity)}
   if(top!==prevTop){scrollDir=top>prevTop?'down':'up';lastScrollAt=now}
   lastTop=top;lastTime=now;
   const marks=marksRef.current,line=top+innerHeight*.35;let current=-1;for(let i=0;i<marks.length;i++)if(marks[i].top*se.scrollHeight<=line)current=i;
   if(top>=max-4&&marks.length)current=marks.length-1;
   setActive(current);
   if(!spotFrame)spotFrame=requestAnimationFrame(spot);
  };
  // Headings become rail markers; re-measured when the page content changes.
  let measureTimer=0;
  const measure=()=>{measureTimer=0;
   const se=document.scrollingElement||root,height=se.scrollHeight;
   const found=[...document.querySelectorAll<HTMLElement>(HEADINGS)].filter(el=>!el.closest('[role=dialog]')&&el.offsetParent!==null&&el.textContent?.trim()).slice(0,24)
    .map(el=>({el,top:(el.getBoundingClientRect().top+se.scrollTop)/height,label:(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,46)}));
   const same=found.length===marksRef.current.length&&found.every((m,i)=>m.el===marksRef.current[i].el&&Math.abs(m.top-marksRef.current[i].top)<.002);
   if(!same){marksRef.current=found;setMarks(found)}
   onScroll();
  };
  // Elements entering because of a scroll (not a filter or page change) sweep in from that direction, staggered.
  const reveal=new IntersectionObserver(entries=>{
   const scrolling=performance.now()-lastScrollAt<450&&motionAllowed();let n=0;
   for(const e of entries){const el=e.target as HTMLElement;
    if(!e.isIntersecting){el.classList.remove('sr-down','sr-up');continue}
    if(!scrolling)continue;
    el.classList.remove('sr-down','sr-up');void el.offsetWidth;
    el.style.setProperty('--sr-delay',Math.min(n++,8)*40+'ms');el.classList.add(scrollDir==='down'?'sr-down':'sr-up');
   }
  },{rootMargin:'0px 0px -2% 0px'});
  const visibleRows=new Set<HTMLElement>(),revealed=new WeakSet<Element>();let spotFrame=0,spotted:HTMLElement|null=null,spotTimer=0;
  const setSpot=(row:HTMLElement|null)=>{if(row===spotted)return;spotted?.removeAttribute('data-spot');spotted=row;row?.setAttribute('data-spot','')};
  const spot=()=>{spotFrame=0;
   if(!motionAllowed()||performance.now()-lastScrollAt>200&&!spotted){setSpot(null);return}
   const line=innerHeight*.42;let best:HTMLElement|null=null,dist=Infinity;
   for(const row of visibleRows){const r=row.getBoundingClientRect();const d=r.top<=line&&r.bottom>=line?0:Math.min(Math.abs(r.top-line),Math.abs(r.bottom-line));if(d<dist){dist=d;best=row}}
   setSpot(dist<120?best:null);clearTimeout(spotTimer);spotTimer=window.setTimeout(()=>setSpot(null),900);
  };
  const rowObserver=new IntersectionObserver(entries=>{
   const scrolling=performance.now()-lastScrollAt<450&&motionAllowed();let n=0;
   for(const e of entries){const row=e.target as HTMLElement;
    if(!e.isIntersecting){visibleRows.delete(row);continue}
    visibleRows.add(row);
    if(revealed.has(row))continue;
    revealed.add(row);
    if(scrolling){row.style.setProperty('--sr-delay',Math.min(n++,6)*80+'ms');row.classList.toggle('row-up',scrollDir==='up');row.classList.add('row-reveal')}
   }
  });
  const onRowRevealEnd=(e:AnimationEvent)=>{const el=e.target as HTMLElement;const row=e.animationName==='row-glow'?el:e.animationName==='sr-fade'&&el===el.parentElement?.lastElementChild?el.parentElement:null;if(row?.classList.contains('row-reveal'))row.classList.remove('row-reveal','row-up')};
  document.addEventListener('animationend',onRowRevealEnd);
  const watchedRows=new WeakSet<Element>();
  const watched=new WeakSet<Element>();
  const onRevealEnd=(e:AnimationEvent)=>{const el=e.target as HTMLElement;if(e.animationName.startsWith('sr-'))el.classList.remove('sr-down','sr-up')};
  document.addEventListener('animationend',onRevealEnd);
  const watch=()=>{for(const el of document.querySelectorAll(REACTIVE))if(!watched.has(el)&&!el.closest('.att-grid')){watched.add(el);reveal.observe(el)}
   for(const row of document.querySelectorAll(ROWS))if(!watchedRows.has(row)){watchedRows.add(row);rowObserver.observe(row)}};
  const scheduleMeasure=()=>{if(!measureTimer)measureTimer=window.setTimeout(()=>{watch();measure()},350)};
  const observer=new MutationObserver(scheduleMeasure);observer.observe(document.body,{childList:true,subtree:true});
  // Easter egg: typing a hidden theme's name anywhere outside a field unlocks and applies it.
  let typed='',splashTimer=0;
  const onKey=(e:KeyboardEvent)=>{
   const t=e.target as HTMLElement|null;if(e.ctrlKey||e.metaKey||e.altKey||e.key.length!==1||t?.closest('input,textarea,select,[contenteditable=true]'))return;
   if(e.shiftKey&&e.key.toLowerCase()==='t'&&!document.querySelector('[role=dialog]')){scrollTo({top:0,behavior:motionAllowed()?'smooth':'auto'});return}
   typed=(typed+e.key.toLowerCase()).slice(-12);
   const word=Object.keys(SECRET_WORDS).find(w=>typed.endsWith(w));if(!word)return;
   typed='';const theme=SECRET_WORDS[word];
   if(!toggleSecretTheme(theme)){setSplash('');return}
   if(motionAllowed()){setSplash(theme);clearTimeout(splashTimer);splashTimer=window.setTimeout(()=>setSplash(''),theme==='phantom'?1900:theme==='yorha'?2600:1500)}
  };
  addEventListener('keydown',onKey);
  const onAppearance=()=>{backdrop?.sync()};
  // Automatic light mode: watch the first seconds of real use; if frames keep dropping, lighten the effects for good.
  let perfFrame=0,perfStop=0;
  if(loadAppearance().performance==='auto'&&root.dataset.perf!=='lite'&&!navigator.webdriver){
   // Only frames seen while the page is visible and focused count: a covered or background window is throttled by the
   // browser, and the first seconds are spent loading records, so neither says anything about the device.
   let last=0,frames=0,slowFrames=0,windows=0,badWindows=0,windowStart=performance.now(),skipped=false;
   const sample=(now:number)=>{
    const watching=!document.hidden&&document.hasFocus();
    if(!watching)skipped=true;
    if(last&&watching){frames++;if(now-last>50)slowFrames++}
    last=watching?now:0;
    if(now-windowStart>=3000){
     const fps=frames/((now-windowStart)/1000);if(!skipped&&frames>20&&(fps<30||slowFrames/frames>.25))badWindows++;
     windows++;frames=0;slowFrames=0;windowStart=now;skipped=false;
     if(badWindows>=3){markSlow('frames');saveAppearance(loadAppearance());toast.message('خُففت المؤثرات لتسريع التطبيق على هذا الجهاز.',{description:'يمكنك تغيير ذلك من «المظهر والحركة» ← الأداء.'});return}
     if(windows>=6)return;
    }
    perfFrame=requestAnimationFrame(sample);
   };
   perfStop=window.setTimeout(()=>{perfFrame=requestAnimationFrame(sample)},6000);
  }
  // If the browser loses a drawing surface (a graphics reset, seen as the page flashing blank), go light for good.
  // Chrome also drops drawing surfaces of tabs left in the background; only repeated losses while the page is in view count.
  let visibleLosses=0;
  const onContextLost=()=>{if(root.dataset.perf==='lite'||document.hidden||++visibleLosses<2)return;markSlow('graphics');saveAppearance(loadAppearance());toast.message('خُففت المؤثرات لأن بطاقة الرسوميات في هذا الجهاز لا تتحملها.',{description:'يمكنك تغيير ذلك من «المظهر والحركة» ← الأداء.'})};
  const canvases=[ambient.current,burst.current].filter((c):c is HTMLCanvasElement=>!!c);
  for(const c of canvases)c.addEventListener('contextlost',onContextLost);
  onScrollFrame();scheduleMeasure();
  addEventListener('pointermove',onMove,{passive:true});addEventListener('pointerdown',onDown,{passive:true});addEventListener('pointerup',onUp,{passive:true});addEventListener('pointercancel',onUp,{passive:true});document.addEventListener('pointerleave',onLeave);
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',scheduleMeasure,{passive:true});addEventListener('mawatheeq-appearance',onAppearance);reducedQuery.addEventListener('change',onAppearance);
  return()=>{for(const c of canvases)c.removeEventListener('contextlost',onContextLost);cancelAnimationFrame(perfFrame);clearTimeout(perfStop);cancelAnimationFrame(frame);cancelAnimationFrame(velFrame);cancelAnimationFrame(scrollFrame);clearTimeout(settle);clearTimeout(measureTimer);observer.disconnect();reveal.disconnect();rowObserver.disconnect();cancelAnimationFrame(spotFrame);clearTimeout(spotTimer);document.removeEventListener('animationend',onRevealEnd);document.removeEventListener('animationend',onRowRevealEnd);backdrop?.stop();bursts?.stop();
   removeEventListener('pointermove',onMove);removeEventListener('pointerdown',onDown);removeEventListener('pointerup',onUp);removeEventListener('pointercancel',onUp);document.removeEventListener('pointerleave',onLeave);
   removeEventListener('keydown',onKey);clearTimeout(splashTimer);removeEventListener('scroll',onScroll);removeEventListener('resize',scheduleMeasure);removeEventListener('mawatheeq-appearance',onAppearance);reducedQuery.removeEventListener('change',onAppearance);
   for(const a of ['data-scrolled','data-scrolling','data-pointer'])root.removeAttribute(a)};
 },[]);
 const jump=(m:Mark)=>{const top=m.el.getBoundingClientRect().top+scrollY-96;scrollTo({top,behavior:motionAllowed()?'smooth':'auto'})};
 return <>
  <div className="ambient" aria-hidden="true"><span className="ambient-blob one"/><span className="ambient-blob two"/><span className="ambient-blob three"/><span className="ambient-spot"/><span className="ambient-grain"/><canvas ref={ambient} className="ambient-canvas"/></div>
  <canvas ref={burst} className="burst-canvas" aria-hidden="true"/>
  {splash==='phantom'&&<div className="egg-splash phantom-splash" aria-hidden="true"><div className="calling-card" dir="ltr" lang="en"><small>CALLING CARD</small><b>{ransom("WE'RE GONNA STEAL YOUR HEART!")}</b><span>— The Phantom Thieves</span></div></div>}
  {splash==='rose'&&<div className="egg-splash sakura-splash" aria-hidden="true">{Array.from({length:28},(_,i)=><i key={i} style={{'--i':i} as CSSProperties}/>)}<b>桜</b></div>}
  {splash==='yorha'&&<div className="egg-splash yorha-splash" aria-hidden="true" dir="ltr" lang="en"><div className="yorha-boot"><small>YoRHa SYSTEM · UNIT 2B</small><p>&gt; REBOOTING INTERFACE<i>...</i></p><p>&gt; RECOVERING PERSONAL DATA<i>... OK</i></p><b>GLORY TO MANKIND</b></div></div>}
  {splash==='sky'&&<div className="egg-splash aero-splash" aria-hidden="true">{Array.from({length:14},(_,i)=><i key={i} style={{'--i':i} as CSSProperties}/>)}<b>Aero</b></div>}
  <div className="cursor-halo" aria-hidden="true"/>
  <div className="scroll-progress" aria-hidden="true"/>
  {scrollable&&<nav className="scroll-rail" aria-label="أقسام الصفحة"><span className="rail-track" aria-hidden="true"><span className="rail-fill"/><span className="rail-comet"/></span>
   {marks.map((m,i)=><button key={i} className={'rail-mark'+(i===active?' on':'')+(i<active?' past':'')} style={{top:(m.top*100).toFixed(2)+'%'}} aria-label={'انتقال إلى '+m.label} aria-current={i===active?'location':undefined} onClick={()=>jump(m)}><span className="rail-label">{m.label}</span></button>)}</nav>}
  {showTop&&<button className="back-to-top" aria-label="العودة إلى أعلى الصفحة" onClick={()=>scrollTo({top:0,behavior:motionAllowed()?'smooth':'auto'})}><ArrowUp size={18}/></button>}
 </>;
}
