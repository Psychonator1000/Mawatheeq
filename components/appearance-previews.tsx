import type {ReactNode} from 'react';
import {build,type PatternKind} from './pattern-field';

/** A small picture on each appearance choice showing what it does. */
const W=48,H=34;
const svg=(body:ReactNode,bg='var(--pv-paper)')=><svg viewBox={`0 0 ${W} ${H}`} aria-hidden><rect width={W} height={H} fill={bg}/>{body}</svg>;
const dots=(pts:number[][],r=1.4,fill='var(--brand)')=>pts.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={r} fill={fill}/>);
const net=[[6,8],[16,5],[27,11],[40,7],[11,20],[23,24],[35,19],[43,28],[6,29],[30,30]];
const links=[[0,1],[1,2],[2,3],[0,4],[4,5],[5,2],[5,6],[6,3],[6,7],[4,8],[5,9],[9,7]];
const pathOf=(line:number[])=>'M'+line.map((v,i)=>v.toFixed(1)+(i%2?' ':',')).join('');

const BACKDROP:Record<string,ReactNode>={
 constellation:svg(<>{links.map(([a,b],i)=><line key={i} x1={net[a][0]} y1={net[a][1]} x2={net[b][0]} y2={net[b][1]} stroke="var(--brand)" strokeOpacity=".35" strokeWidth=".7"/>)}{dots(net)}</>),
 web:svg(<>{links.concat([[0,5],[1,6],[3,7],[8,9],[2,6]]).map(([a,b],i)=><line key={i} x1={net[a][0]} y1={net[a][1]} x2={net[b][0]} y2={net[b][1]} stroke="var(--brand)" strokeOpacity=".3" strokeWidth=".6"/>)}{dots(net.concat([[20,14],[32,4],[14,30],[44,16]]),1.1)}</>),
 fireflies:svg(<><defs><radialGradient id="pv-ff"><stop offset="0" stopColor="#ffd56a"/><stop offset="1" stopColor="#ffd56a" stopOpacity="0"/></radialGradient></defs>{[[9,10],[30,7],[40,22],[18,25],[26,17]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i%2?4:5} fill="url(#pv-ff)"/>)}{dots([[9,10],[30,7],[40,22],[18,25],[26,17]],1,'#fff6c8')}</>,'#2b2420'),
 aurora:svg(<><defs><filter id="pv-blur"><feGaussianBlur stdDeviation="4"/></filter></defs><g filter="url(#pv-blur)"><ellipse cx="14" cy="12" rx="13" ry="7" fill="var(--brand)" opacity=".55"/><ellipse cx="34" cy="22" rx="14" ry="8" fill="#7ad0c0" opacity=".55"/><ellipse cx="30" cy="8" rx="9" ry="5" fill="#d8b98f" opacity=".6"/></g></>),
 spotlight:svg(<><defs><radialGradient id="pv-spot"><stop offset="0" stopColor="var(--brand)" stopOpacity=".35"/><stop offset="1" stopColor="var(--brand)" stopOpacity="0"/></radialGradient></defs><circle cx="30" cy="15" r="14" fill="url(#pv-spot)"/>{Array.from({length:24},(_,i)=><circle key={i} cx={5+(i%6)*7.6} cy={5+Math.floor(i/6)*8} r=".8" fill="var(--brand)" opacity=".5"/>)}</>),
 waves:svg(<><path d="M0 20 Q12 14 24 20 T48 20 V34 H0Z" fill="var(--brand)" opacity=".18"/><path d="M0 25 Q12 19 24 25 T48 25 V34 H0Z" fill="var(--brand)" opacity=".28"/><path d="M0 14 Q12 9 24 14 T48 14" fill="none" stroke="var(--brand)" strokeOpacity=".3"/></>),
 starfield:svg(<>{dots([[6,6],[14,20],[22,9],[33,5],[41,15],[28,27],[9,28],[37,25],[18,15]],.8,'#fff')}<line x1="26" y1="18" x2="38" y2="11" stroke="#fff" strokeOpacity=".8" strokeWidth=".9" strokeLinecap="round"/></>,'#141a33'),
 snow:svg(<>{[[6,5,1.4],[15,12,1],[24,4,1.6],[33,14,1.1],[42,6,1.3],[10,24,1.5],[21,20,1],[30,27,1.4],[40,24,1]].map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r} fill="#fff"/>)}</>,'#9fb7cc'),
 ripples:svg(<>{[4,9,14].map(r=><circle key={r} cx="24" cy="17" r={r} fill="none" stroke="var(--brand)" strokeOpacity={.55-r/40} strokeWidth=".9"/>)}</>),
 petals:svg(<>{[[8,8,30],[22,15,-20],[36,7,60],[14,25,10],[33,24,-45]].map(([x,y,a],i)=><ellipse key={i} cx={x} cy={y} rx="3.4" ry="1.8" transform={`rotate(${a} ${x} ${y})`} fill="#f2a7c0"/>)}</>,'#fff2f5'),
 bubbles:svg(<>{[[12,22,6],[30,12,8],[40,26,4]].map(([x,y,r],i)=><g key={i}><circle cx={x} cy={y} r={r} fill="#ffffff55" stroke="#ffffffcc" strokeWidth=".8"/><circle cx={x-r/3} cy={y-r/3} r={r/4} fill="#fff"/></g>)}</>,'#5bb8e8'),
 none:svg(null),
};
// Patterns are drawn at half size so a whole tile or two fits.
const patternTile=(k:PatternKind)=><svg viewBox={`0 0 ${W*2} ${H*2}`} aria-hidden><rect width={W*2} height={H*2} fill="var(--brand)"/><g stroke="#fff" fill="none">{build(k,0,0,W*2,H*2).map((g,i)=><path key={i} d={g.lines.map(pathOf).join(' ')} strokeOpacity={.6*g.alpha} strokeWidth={g.width*1.6}/>)}</g></svg>;
const arrow=(fill:string,stroke:string)=><path d="M20 7 L20 26 L25 21.5 L28.5 29 L31.5 27.6 L28 20.3 L34 20 Z" fill={fill} stroke={stroke} strokeWidth="1.1" strokeLinejoin="round"/>;
const gauge=(t:number)=>{const a=Math.PI*(1-t),x=24+11*Math.cos(a),y=26-11*Math.sin(a);return svg(<><path d="M11 26 A13 13 0 0 1 37 26" fill="none" stroke="var(--border)" strokeWidth="3" strokeLinecap="round"/><path d={`M11 26 A13 13 0 0 1 ${(24+13*Math.cos(a)).toFixed(1)} ${(26-13*Math.sin(a)).toFixed(1)}`} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round"/><line x1="24" y1="26" x2={x} y2={y} stroke="var(--foreground)" strokeWidth="1.3" strokeLinecap="round"/><circle cx="24" cy="26" r="1.8" fill="var(--foreground)"/></>)};
const rows=(n:number,gap:number)=>svg(<>{Array.from({length:n},(_,i)=><g key={i}><rect x="6" y={5+i*gap} width="36" height={gap-2.5} rx="1.5" fill="var(--brand)" opacity={i?.14:.3}/></g>)}</>);
const FONT_FACE:Record<string,string>={gulf:"'Tajawal'",office:"'Noto Naskh Arabic Variable','IBM Plex Sans Arabic'",classic:"'Amiri'",modern:"'Readex Pro Variable'",plain:"'Noto Sans Arabic Variable'"};

const PREVIEWS:Record<string,(id:string)=>ReactNode>={
 mode:id=>svg(<><rect x="0" y="0" width={W} height={H} fill={id==='dark'?'#1d1a18':'var(--pv-paper)'}/>{id==='auto'&&<path d={`M${W} 0 V${H} H0Z`} fill="#1d1a18"/>}<rect x="7" y="7" width="20" height="4" rx="2" fill="var(--brand)"/><rect x="7" y="15" width="30" height="3" rx="1.5" fill={id==='dark'?'#ffffff40':'#00000026'}/><rect x="7" y="21" width="24" height="3" rx="1.5" fill={id==='light'?'#00000026':'#ffffff40'}/></>),
 backdrop:id=>BACKDROP[id]??null,
 pattern:id=>id==='none'?svg(null,'var(--brand)'):patternTile(id as PatternKind),
 motion:id=>svg(<>{id!=='off'&&<path d={id==='full'?'M8 24 Q16 6 24 17 T40 10':'M12 20 Q20 15 28 18'} fill="none" stroke="var(--brand)" strokeOpacity=".35" strokeWidth="1.4" strokeLinecap="round" strokeDasharray={id==='full'?'0':'2 2.5'}/>}<circle className={'pv-ball '+id} cx={id==='off'?24:id==='full'?40:28} cy={id==='off'?17:id==='full'?10:18} r="3.4" fill="var(--brand)"/></>),
 performance:id=>gauge(id==='lite'?.22:id==='full'?1:.6),
 cursor:id=>svg(arrow(id==='themed'?'var(--brand)':'#fff',id==='themed'?'#fff':'#111')),
 follower:id=>svg(<>{id==='ring'&&<circle cx="21" cy="9" r="7" fill="none" stroke="var(--brand)" strokeWidth="1.4"/>}{id==='dot'&&<circle cx="21" cy="9" r="3.4" fill="var(--brand)"/>}{id==='diamond'&&<rect x="16" y="4" width="9" height="9" transform="rotate(45 20.5 8.5)" fill="none" stroke="var(--brand)" strokeWidth="1.4"/>}{arrow('#fff','#111')}</>),
 font:id=><span className="pv-text" style={{fontFamily:FONT_FACE[id]}}>أبجد</span>,
 text:id=><span className="pv-text" style={{fontSize:id==='xlarge'?22:id==='large'?18:14}}>أ ب</span>,
 density:id=>id==='compact'?rows(5,5.2):rows(3,8.6),
};

export function ChoicePreview({group,id}:{group:string;id:string}){
 const make=PREVIEWS[group];if(!make)return null;
 const body=make(id);if(!body)return null;
 return <span className="choice-pv" aria-hidden>{body}</span>;
}
