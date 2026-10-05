'use client';
import {useMemo,useState} from 'react';
import {partyMatches} from '@/lib/case-browse';
import {type CaseRecord,formatDate} from '@/lib/domain';
import {type ClientEntity,clientName} from '@/lib/clients';
import {Field,Empty} from './shared';
import PageNavigation from './page-navigation';

export default function OfficeConflicts({records,clients,onOpenCase}:{records:CaseRecord[];clients:ClientEntity[];onOpenCase:(record:CaseRecord)=>void}) {
 const [query,setQuery]=useState(''),[page,setPage]=useState(1);
 const matches=useMemo(()=>partyMatches(records,clients,query),[records,clients,query]),pages=Math.max(1,Math.ceil(matches.length/20)),current=Math.min(page,pages);
 return <><div className="page-head"><div><div className="eyebrow">OFFICE / PARTIES</div><h1>فحص الأطراف</h1><p className="subtitle">ابحث عن اسم قبل قبول ملف جديد، وشاهد ارتباطاته بالقضايا الحالية والمؤرشفة.</p></div></div><section className="panel"><div className="panel-body"><div className="notice">فحص أولي لتشابه الأسماء، وليس قراراً بشأن تعارض المصالح. قد يتشابه اسمان لشخصين مختلفين أو يرد الاسم بصيغة غير مسجلة؛ طابق الهوية والصفة يدوياً. لا تُدمج الجهات بسبب تشابه ممثليها.</div><Field label="اسم الطرف أو الجهة المراد فحصها" value={query} onChange={value=>{setQuery(value);setPage(1)}} placeholder="حرفان على الأقل، ويفضل الاسم الكامل"/><p className="subtitle">يشمل أسماء الخصوم والموكلين وصيغهم السابقة والأشخاص المرتبطين بهم والشخص المعني بكل قضية.</p></div>{!matches.length?<Empty title={query.trim().length<2?'أدخل اسم الطرف':'لم نعثر على تطابق نصي'} text={query.trim().length<2?'تظهر القضايا والأدوار المرتبطة بالاسم هنا.':'جرّب الصيغ الأخرى للاسم. غياب التطابق لا يعني خلو تعارض المصالح.'}/>:<div className="table-wrap"><table className="office-table"><thead><tr><th>القضية</th><th>الطرف المطابق وصلته</th><th>الموكل / الخصم</th><th>التاريخ</th><th>الملف</th></tr></thead><tbody>{matches.slice((current-1)*20,current*20).map(({record:c,matches:found})=><tr key={c.id}><td>{c.code||c.autoNumber||'بلا كود'}<small>{c.archived?'مؤرشفة':'نشطة'}</small></td><td>{found.map((m,i)=><div key={i}><strong>{m.name}</strong><small>{m.role}</small></div>)}</td><td>{clientName(c)}<small>{c.opponent}</small></td><td>{formatDate(c.date)}</td><td><button className="btn" onClick={()=>onOpenCase(c)}>فتح القضية</button></td></tr>)}</tbody></table></div>}<PageNavigation page={current} pages={pages} total={matches.length} onChange={setPage}/></section></>;
}
