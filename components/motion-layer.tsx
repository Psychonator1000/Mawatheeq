import {useEffect,useState} from 'react';
import {ArrowUp} from 'lucide-react';
import {motionAllowed,pointerEffectsOn} from '@/lib/appearance';
import './motion.css';

const RIPPLE='.btn,.icon-btn,.nav-button,.office-card,.stat,.workspace-option,.client-card,.person-card,.calendar-add,.account-menu-item,.notice-item,.choice,.my-work-item,.back-to-top,.text-link,.number-link,.legend-row,[role=tab]';
const MAGNETIC='.btn.primary,.icon-btn,.back-to-top,.quick-search-trigger';
const GLOW='.panel,.office-card,.client-card,.person-card,.my-work-item';

/** Remember one hovered element per effect and clear its variables when the pointer moves on. */
function tracker(clear:(el:HTMLElement)=>void){let el:HTMLElement|null=null;return (next:HTMLElement|null)=>{if(next!==el){if(el)clear(el);el=next}return el}}

/**
 * Ambient, pointer-reactive background, press ripples, magnetic buttons, edge glow and scroll feedback.
 * Everything is decorative: pointer-events none, CSS variables only, one rAF per frame,
 * paused for hidden tabs, touch input, the "off" motion level and reduced-motion preferences.
 */
export default function MotionLayer() {
 const [showTop,setShowTop]=useState(false);
 useEffect(()=>{
  const root=document.documentElement;
  let frame=0,x=0,y=0,tilt:HTMLElement|null=null,magnet:HTMLElement|null=null,glow:HTMLElement|null=null;
  const unset=(...names:string[])=>(el:HTMLElement)=>names.forEach(n=>el.style.removeProperty(n));
  const trackTilt=tracker(unset('--tilt-x','--tilt-y')),trackMagnet=tracker(unset('--mag-x','--mag-y')),trackGlow=tracker(unset('--gx','--gy'));
  const paint=()=>{frame=0;
   root.style.setProperty('--ax',(x/innerWidth).toFixed(4));root.style.setProperty('--ay',(y/innerHeight).toFixed(4));
   if(tilt){const r=tilt.getBoundingClientRect(),tx=(x-r.left)/r.width-.5,ty=(y-r.top)/r.height-.5;
    tilt.style.setProperty('--tilt-x',(-ty*7).toFixed(2)+'deg');tilt.style.setProperty('--tilt-y',(tx*7).toFixed(2)+'deg');
    tilt.style.setProperty('--glare-x',((tx+.5)*100).toFixed(1)+'%');tilt.style.setProperty('--glare-y',((ty+.5)*100).toFixed(1)+'%')}
   if(magnet){const r=magnet.getBoundingClientRect(),mx=(x-r.left)/r.width-.5,my=(y-r.top)/r.height-.5;
    magnet.style.setProperty('--mag-x',(mx*6).toFixed(2)+'px');magnet.style.setProperty('--mag-y',(my*5).toFixed(2)+'px')}
   if(glow){const r=glow.getBoundingClientRect();glow.style.setProperty('--gx',(x-r.left).toFixed(0)+'px');glow.style.setProperty('--gy',(y-r.top).toFixed(0)+'px')}};
  const onMove=(e:PointerEvent)=>{
   if(e.pointerType!=='mouse'||!pointerEffectsOn())return;
   x=e.clientX;y=e.clientY;
   const t=e.target instanceof Element?e.target:null;
   tilt=trackTilt(t?.closest('[data-tilt]') as HTMLElement|null);
   magnet=trackMagnet(t?.closest(MAGNETIC) as HTMLElement|null);
   glow=trackGlow(t?.closest(GLOW) as HTMLElement|null);
   if(!frame&&!document.hidden)frame=requestAnimationFrame(paint);
  };
  const onLeave=()=>{tilt=trackTilt(null);magnet=trackMagnet(null);glow=trackGlow(null)};
  // A ripple grows from the exact press point, clipped to the pressed element's shape.
  const onDown=(e:PointerEvent)=>{
   if(!motionAllowed()||e.button>0)return;
   const el=e.target instanceof Element?e.target.closest(RIPPLE) as HTMLElement|null:null;
   if(!el||(el as HTMLButtonElement).disabled)return;
   if(getComputedStyle(el).position==='static')el.style.position='relative';
   const r=el.getBoundingClientRect(),size=Math.max(r.width,r.height)*2.2;
   const host=document.createElement('span');host.className='ripple-host';host.setAttribute('aria-hidden','true');
   const wave=document.createElement('span');wave.className='ripple';
   wave.style.cssText=`width:${size}px;height:${size}px;left:${e.clientX-r.left-size/2}px;top:${e.clientY-r.top-size/2}px`;
   host.appendChild(wave);el.appendChild(host);
   wave.addEventListener('animationend',()=>host.remove(),{once:true});setTimeout(()=>host.remove(),1200);
  };
  const onScroll=()=>{
   const se=document.scrollingElement||root,max=se.scrollHeight-se.clientHeight,top=se.scrollTop;
   root.style.setProperty('--scroll-progress',max>0?Math.min(1,top/max).toFixed(4):'0');
   root.toggleAttribute('data-scrolled',top>12);
   setShowTop(top>700);
  };
  onScroll();
  addEventListener('pointermove',onMove,{passive:true});addEventListener('pointerdown',onDown,{passive:true});document.addEventListener('pointerleave',onLeave);
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll,{passive:true});
  return()=>{cancelAnimationFrame(frame);removeEventListener('pointermove',onMove);removeEventListener('pointerdown',onDown);document.removeEventListener('pointerleave',onLeave);removeEventListener('scroll',onScroll);removeEventListener('resize',onScroll);root.removeAttribute('data-scrolled')};
 },[]);
 return <>
  <div className="ambient" aria-hidden="true"><span className="ambient-blob one"/><span className="ambient-blob two"/><span className="ambient-blob three"/><span className="ambient-spot"/><span className="ambient-grain"/></div>
  <div className="scroll-progress" aria-hidden="true"/>
  {showTop&&<button className="back-to-top" aria-label="العودة إلى أعلى الصفحة" onClick={()=>scrollTo({top:0,behavior:motionAllowed()?'smooth':'auto'})}><ArrowUp size={18}/></button>}
 </>;
}
