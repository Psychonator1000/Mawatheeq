import {useEffect,useRef,useState} from 'react';
import {ArrowUp} from 'lucide-react';
import {motionAllowed,pointerEffectsOn} from '@/lib/appearance';
import {createBackdrop,createBursts,type FxState} from './motion-fx';
import './motion.css';

const RIPPLE='.btn,.icon-btn,.nav-button,.office-card,.stat,.workspace-option,.client-card,.person-card,.calendar-add,.account-menu-item,.notice-item,.choice,.my-work-item,.back-to-top,.text-link,.number-link,.legend-row,[role=tab],.att-cell,.chip-toggle,.rail-mark,.device-card';
const STRONG='.btn.primary,.back-to-top,.workspace-option,.stat.featured';
const MAGNETIC='.btn.primary,.icon-btn,.back-to-top,.quick-search-trigger';
const GLOW='.panel,.office-card,.client-card,.person-card,.my-work-item,.device-card,.att-stat';
const INTERACTIVE='a,button,[role=button],[role=tab],input,select,textarea,label,summary';
const HEADINGS='.workspace h1,.workspace h2,.department-content h1,.department-content h2,.workspace-chooser h1';

/** Remember one hovered element per effect and clear its variables when the pointer moves on. */
function tracker(clear:(el:HTMLElement)=>void){let el:HTMLElement|null=null;return (next:HTMLElement|null)=>{if(next!==el){if(el)clear(el);el=next}return el}}
type Mark={top:number;label:string;el:HTMLElement};

/**
 * Ambient, pointer-reactive background, dot-web press bursts, magnetic buttons, edge glow,
 * scroll velocity for the content, and a section rail. Everything is decorative: pointer-events none
 * (except the rail's own markers), CSS variables only, rAF-batched, paused for hidden tabs,
 * touch input, the "off" motion level and reduced-motion preferences.
 */
export default function MotionLayer() {
 const [showTop,setShowTop]=useState(false),[marks,setMarks]=useState<Mark[]>([]),[active,setActive]=useState(-1),[scrollable,setScrollable]=useState(false);
 const ambient=useRef<HTMLCanvasElement>(null),burst=useRef<HTMLCanvasElement>(null),marksRef=useRef<Mark[]>([]);
 useEffect(()=>{
  const root=document.documentElement,reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,x=-999,y=-999,tilt:HTMLElement|null=null,magnet:HTMLElement|null=null,glow:HTMLElement|null=null,pointerOn=false;
  let lastTop=scrollY,lastTime=performance.now(),velocity=0,velFrame=0,settle=0,lastTick=0;
  const fx:FxState={mode:'',motion:'',reduced:false,pointerX:-999,pointerY:-999,pointerOn:false,scrollV:0};
  const state=()=>{fx.mode=root.dataset.backdrop||'constellation';fx.motion=root.dataset.motion||'full';fx.reduced=reducedQuery.matches;fx.pointerX=x;fx.pointerY=y;fx.pointerOn=pointerOn;fx.scrollV=velocity;return fx};
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
  const onMove=(e:PointerEvent)=>{
   if(e.pointerType!=='mouse'||!pointerEffectsOn()){if(pointerOn){pointerOn=false;root.removeAttribute('data-pointer')}return}
   x=e.clientX;y=e.clientY;if(!pointerOn){pointerOn=true;root.setAttribute('data-pointer','')}
   const t=e.target instanceof Element?e.target:null;
   tilt=trackTilt(t?.closest('[data-tilt]') as HTMLElement|null);
   magnet=trackMagnet(t?.closest(MAGNETIC) as HTMLElement|null);
   glow=trackGlow(t?.closest(GLOW) as HTMLElement|null);
   root.toggleAttribute('data-hover-action',!!t?.closest(INTERACTIVE));
   if(!frame&&!document.hidden)frame=requestAnimationFrame(paint);
  };
  const onLeave=()=>{tilt=trackTilt(null);magnet=trackMagnet(null);glow=trackGlow(null);pointerOn=false;root.removeAttribute('data-pointer')};
  // Each press sends a soft ripple through the element and a web of dots around it.
  const onDown=(e:PointerEvent)=>{
   if(!motionAllowed()||e.button>0)return;
   const el=e.target instanceof Element?e.target.closest(RIPPLE) as HTMLElement|null:null;
   root.setAttribute('data-pressing','');
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
  const onUp=()=>root.removeAttribute('data-pressing');
  // Scroll speed drives the content's elastic lag, the rail comet and the backdrop drift.
  const tickVelocity=(now:number)=>{velFrame=0;
   velocity*=Math.pow(.86,Math.min(6,(now-(lastTick||now-16))/16));lastTick=now;if(Math.abs(velocity)<.01)velocity=0;
   root.style.setProperty('--scroll-v',velocity.toFixed(3));root.style.setProperty('--scroll-speed',Math.min(1,Math.abs(velocity)).toFixed(3));
   if(velocity!==0)velFrame=requestAnimationFrame(tickVelocity);else{lastTick=0;clearTimeout(settle);settle=window.setTimeout(()=>root.removeAttribute('data-scrolling'),120)}};
  const onScroll=()=>{
   const se=document.scrollingElement||root,max=se.scrollHeight-se.clientHeight,top=se.scrollTop,now=performance.now();
   root.style.setProperty('--scroll-progress',max>0?Math.min(1,top/max).toFixed(4):'0');
   root.toggleAttribute('data-scrolled',top>12);
   setShowTop(top>700);setScrollable(max>320);
   if(pointerEffectsOn()){const v=Math.max(-1,Math.min(1,(top-lastTop)/Math.max(8,now-lastTime)/2.4));velocity=velocity*.5+v*.5;root.setAttribute('data-scrolling','');if(!velFrame)velFrame=requestAnimationFrame(tickVelocity)}
   lastTop=top;lastTime=now;
   const marks=marksRef.current,line=top+innerHeight*.35;let current=-1;for(let i=0;i<marks.length;i++)if(marks[i].top*se.scrollHeight<=line)current=i;
   if(top>=max-4&&marks.length)current=marks.length-1;
   setActive(current);
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
  const scheduleMeasure=()=>{if(!measureTimer)measureTimer=window.setTimeout(measure,350)};
  const observer=new MutationObserver(scheduleMeasure);observer.observe(document.body,{childList:true,subtree:true});
  const onAppearance=()=>{backdrop?.sync()};
  onScroll();scheduleMeasure();
  addEventListener('pointermove',onMove,{passive:true});addEventListener('pointerdown',onDown,{passive:true});addEventListener('pointerup',onUp,{passive:true});addEventListener('pointercancel',onUp,{passive:true});document.addEventListener('pointerleave',onLeave);
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',scheduleMeasure,{passive:true});addEventListener('mawatheeq-appearance',onAppearance);reducedQuery.addEventListener('change',onAppearance);
  return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(velFrame);clearTimeout(settle);clearTimeout(measureTimer);observer.disconnect();backdrop?.stop();bursts?.stop();
   removeEventListener('pointermove',onMove);removeEventListener('pointerdown',onDown);removeEventListener('pointerup',onUp);removeEventListener('pointercancel',onUp);document.removeEventListener('pointerleave',onLeave);
   removeEventListener('scroll',onScroll);removeEventListener('resize',scheduleMeasure);removeEventListener('mawatheeq-appearance',onAppearance);reducedQuery.removeEventListener('change',onAppearance);
   for(const a of ['data-scrolled','data-scrolling','data-pointer','data-hover-action','data-pressing'])root.removeAttribute(a)};
 },[]);
 const jump=(m:Mark)=>{const top=m.el.getBoundingClientRect().top+scrollY-96;scrollTo({top,behavior:motionAllowed()?'smooth':'auto'})};
 return <>
  <div className="ambient" aria-hidden="true"><span className="ambient-blob one"/><span className="ambient-blob two"/><span className="ambient-blob three"/><span className="ambient-spot"/><span className="ambient-grain"/><canvas ref={ambient} className="ambient-canvas"/></div>
  <canvas ref={burst} className="burst-canvas" aria-hidden="true"/>
  <div className="cursor-halo" aria-hidden="true"/>
  <div className="scroll-progress" aria-hidden="true"/>
  {scrollable&&<nav className="scroll-rail" aria-label="أقسام الصفحة"><span className="rail-track" aria-hidden="true"><span className="rail-fill"/><span className="rail-comet"/></span>
   {marks.map((m,i)=><button key={i} className={'rail-mark'+(i===active?' on':'')+(i<active?' past':'')} style={{top:(m.top*100).toFixed(2)+'%'}} aria-label={'انتقال إلى '+m.label} aria-current={i===active?'location':undefined} onClick={()=>jump(m)}><span className="rail-label">{m.label}</span></button>)}</nav>}
  {showTop&&<button className="back-to-top" aria-label="العودة إلى أعلى الصفحة" onClick={()=>scrollTo({top:0,behavior:motionAllowed()?'smooth':'auto'})}><ArrowUp size={18}/></button>}
 </>;
}
