import {brandMarkSvg} from '@/lib/print';
import './brand-logo.css';
const MARK = brandMarkSvg();
/**
 * The office logo: the calligraphic mark, and in the full form «MAWATHEEQ», «LEGAL CONSULTANTS & LAW FIRM» and
 * «للاستشارات القانونية وأعمال المحاماة» beneath it. Colours follow the theme (ink and accent).
 */
export default function BrandLogo({full=false,className=''}:{full?:boolean;className?:string}) {
 return <span className={'brand-logo'+(full?' full':'')+(className?' '+className:'')} role="img" aria-label="مواثيق للاستشارات القانونية وأعمال المحاماة">
  <span className="brand-logo-mark" dangerouslySetInnerHTML={{__html:MARK}}/>
  {full&&<span className="brand-logo-lines" aria-hidden="true"><span className="brand-logo-en">MAWATHEEQ</span><small>LEGAL CONSULTANTS &amp; LAW FIRM</small><span className="brand-logo-ar">للاستشارات القانونية وأعمال المحاماة</span></span>}
 </span>;
}
