export type Evidence = {id:string;included:boolean;date:string;description:string;pages:number};
export type DocumentData = {company:string;defendant:string;civilId:string;nationality:string;address:string;address2:string;amount:string;amountWords:string;account:string;phone:string;orderNumber:string;court:string;rejectedDate:string;demandDate:string;statementDate:string;companyCivil:string;companyRegister:string;email:string;code:string;hearingCourt:string;hearingDay:string;hearingDate:string;hearingCircuit:string;lawsuitNumber:string;lawsuitYear:string;receiptDate:string;receiptFee:string;receiptNumber:string;orderAuto:string;evidence:Evidence[];[key:string]:unknown};
export const blankDocument = ():DocumentData => ({company:'',defendant:'',civilId:'',nationality:'',address:'',address2:'',amount:'',amountWords:'',account:'',phone:'',orderNumber:'',court:'',rejectedDate:'',demandDate:'',statementDate:'',companyCivil:'',companyRegister:'',email:'',code:'',hearingCourt:'',hearingDay:'',hearingDate:'',hearingCircuit:'',lawsuitNumber:'',lawsuitYear:'',receiptDate:'',receiptFee:'',receiptNumber:'',orderAuto:'',evidence:[]});
export const normalizeDigits = (text:string) => text.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
export const cleanDocumentText = (raw:string) => normalizeDigits(raw.normalize('NFKC'))
  .replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'')
  .replace(/[ـ\u064b-\u065f\u0670]/g,'').replace(/\r/g,'').replace(/[^\S\n]+/g,' ').trim();
const matchText = (raw:string) => cleanDocumentText(raw).replace(/[أإآ]/g,'ا').replace(/ى/g,'ي');
const tidy = (s:string) => s.replace(/^[\s:،,._/\-]+|[\s:،,._/\-]+$/g,'').trim();

export function parseDocumentDate(raw:string):string {
  const text=cleanDocumentText(raw);let y=0,m=0,d=0;
  const numeric=text.match(/\b(20\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/);
  const reverse=text.match(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(20\d{2})\b/);
  const english=text.match(/\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(20\d{2})\b/i);
  if(numeric){[,y,m,d]=numeric.map(Number);}else if(reverse){[,d,m,y]=reverse.map(Number);}else if(english){d=+english[1];m=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(english[2].toUpperCase())+1;y=+english[3];}else{return '';}
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : '';
}
const datePattern=/(?:20\d{2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}|\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*20\d{2}|\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+20\d{2})/gi;
const datesIn=(text:string)=>Array.from(text.matchAll(datePattern),m=>parseDocumentDate(m[0])).filter(Boolean);
const after=(text:string,label:RegExp,limit=130)=>{const m=label.exec(text);return m ? text.slice(m.index+m[0].length,m.index+m[0].length+limit) : '';};
const money=(s:string)=>s.replace(/٬/g,'').replace(/٫/g,'.').replace(/,(?=\d{3}$)/,'.').replace(/,/g,'');
const selectNumber=(text:string,pattern:RegExp)=>{const counts=new Map<string,number>();for(const m of text.matchAll(pattern)){const value=m[1];counts.set(value,(counts.get(value)||0)+1)}return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';};

export function numericReadings(raw:string){
  const text=cleanDocumentText(raw);
  return [...new Set([...Array.from(text.matchAll(datePattern),m=>m[0]).filter(v=>!!parseDocumentDate(v)),...Array.from(text.matchAll(/\bF\d{6,12}\b/gi),m=>m[0])])].join('\n');
}
export function needsNumericReading(raw:string){
  const text=matchText(raw);
  return /طلب\s*استصدار\s*امر\s*اداء|كشف\s*حساب\s*لمشترك|رقم\s*الايصال/.test(text);
}

// Derive currency wording from the extracted, reviewable amount instead of OCR spelling.
export function amountInWords(amount:string){
  if(!/^\d{1,9}(?:\.\d{1,3})?$/.test(amount))return '';
  const ones=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
  const tens=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
  const hundreds=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];
  const small=(n:number):string=>n>=100?[hundreds[Math.floor(n/100)],small(n%100)].filter(Boolean).join(' و'):n<20?ones[n]:[ones[n%10],tens[Math.floor(n/10)]].filter(Boolean).join(' و');
  const words=(n:number):string=>{
    const parts:string[]=[];
    for(const [size,one,two,plural] of [[1000000,'مليون','مليونان','ملايين'],[1000,'ألف','ألفان','آلاف']] as const){
      const v=Math.floor(n/size);if(v){parts.push(v===1?one:v===2?two:`${small(v)} ${v<=10?plural:one}`);n%=size;}
    }
    if(n)parts.push(small(n));return parts.join(' و')||'صفر';
  };
  const [whole,fraction='']=amount.split('.');const dinars=+whole,fils=+fraction.padEnd(3,'0');
  const dinarWords=dinars===1?'دينار كويتي واحد':dinars===2?'ديناران كويتيان':`${words(dinars)} ${dinars>=3&&dinars<=10?'دنانير كويتية':'ديناراً كويتياً'}`;
  const filsWords=fils===1?'فلس واحد':fils===2?'فلسان':`${words(fils)} ${fils>=3&&fils<=10?'فلوس':'فلساً'}`;
  return dinars&&fils?`${dinarWords} و${filsWords}`:fils?filsWords:dinarWords;
}

/** Match document labels and page context, never a saved/example case. */
export function extractFields(raw:string,filename=''):DocumentData {
  const original=cleanDocumentText(raw),text=matchText(raw),d=blankDocument();
  const get=(r:RegExp)=>tidy(text.match(r)?.[1]||'');
  const chunks=text.split(/(?:^|\n)الصفحة\s+\d+\s*\n/).filter(Boolean);
  const order=chunks.find(t=>/طلب\s*استصدار\s*امر\s*اداء/.test(t))||text;
  const statement=chunks.find(t=>/كشف\s*حساب\s*لمشترك|تاريخ\s*الفاتور[ةه]/.test(t))||'';
  const receipt=chunks.find(t=>/رقم\s*الايصال|رسوم\s*قضائية|F\d{6,12}/i.test(t))||'';
  const demand=chunks.find(t=>/حيث انكم مدينون/.test(t))||chunks.find(t=>/كتاب\s*التكليف\s*بالوفاء/.test(t))||'';
  const originalOrder=original.split(/(?:^|\n)الصفحة\s+\d+\s*\n/).find(t=>/طلب\s*استصدار\s*[اأ]مر\s*[اأ]داء/.test(t))||original;

  d.company=tidy(originalOrder.match(/(?:مقدم[هة]|الطالبة|الدائنة|المدعية)\s*[:/\-]?\s*((?:ال)?شرك[ةه][^\n]{4,110})/)?.[1]||'');
  if(!d.company)d.company=tidy(original.match(/((?:ال)?شرك[ةه]\s+الوطنية\s+للاتصالات\s*المتنقلة|شركة\s+الاتصالات\s*المتنقلة)/)?.[1]||'');
  d.company=d.company.replace(/للاتصالات(?=المتنقلة)/g,'للاتصالات ');
  if(!d.company||/[a-z]/i.test(d.company)){
    const clearer=tidy(originalOrder.match(/بأن\s*يؤدى\s*إلى\s*:\s*((?:ال)?شرك[ةه][^\n]{4,110})/)?.[1]||'');
    if(clearer&&!/[a-z]/i.test(clearer))d.company=clearer;
    else d.company=tidy(original.match(/((?:ال)?شرك[ةه]\s+الوطنية\s+للاتصالات\s*المتنقلة|شركة\s+الاتصالات\s*المتنقلة)/)?.[1]||'');
  }
  const defendantPattern=/(?:^|\n)\s*(?:ضد|المدعى عليه|المدعي عليه|المطلوب ضده|المعلن إليه|المعلن اليه|المقدم ضده)\s*[:/\-]\s*([^\n:0-9]{5,100})/;
  d.defendant=tidy(originalOrder.match(defendantPattern)?.[1]?.split(/الجنسية|الجنسيه|الرقم|مواليد/)[0]||'');
  if(!d.defendant)d.defendant=tidy(original.match(/(?:اسم\s*المشترك|المعلن إليه|المطلوب ضده)\s*[:/\-]?\s*([^\n\d]{5,80})/)?.[1]||'');
  d.civilId=selectNumber(order,/الرقم\s*المد[نتم][يى]\s*[:\-]?\s*([23]\d{11})\b/g)||selectNumber(text,/(?<!\d)([23]\d{11})(?!\d)/g);
  d.account=selectNumber(statement+'\n'+order+'\n'+text,/(?:حساب|عقد|العقد|الحساب)\s*(?:رقم)?\s*[:\-]?\s*(\d{1,4}[.]\d{6,12})\b/g)||get(/\b(1\.\d{7,10})\b/);
  d.phone=tidy((statement||text).match(/(?:رقم\s*(?:الاشتراك|الخط)|خط\s*الاشتراك|الهاتف\s*النقال)\s*[:\-]?\s*([569]\d{7})\b/)?.[1]||'');
  const amounts=[...order.matchAll(/(?:مبلغ|بمبلغ|المديونية|قيمة\s*الدعوي)[^\d\n]{0,30}(\d+(?:[,٬]\d{3})*[.٫]\d{3}|\d+,\d{3}|\d+(?=\s*(?:د\.?ك|دينار)))(?![\d.,٫])/g)].map(m=>money(m[1]));
  d.amount=amounts.sort((a,b)=>amounts.filter(v=>v===b).length-amounts.filter(v=>v===a).length)[0]||'';
  d.amountWords=amountInWords(d.amount);
  const orderMatch=order.match(/امر\s*(?:ال)?اداء\s*(?:رقم)?\s*[:\-]?\s*(\d{1,8})\s*[/\\]\s*(\d{1,8})/);
  if(orderMatch){const [,a,b]=orderMatch;if(/^20\d{2}$/.test(b))d.orderNumber=`${a}/${b}`;else if(/^20\d{2}$/.test(a))d.orderNumber=`${b}/${a}`;}
  const court=order.match(/محكمة\s*(العاصمة|الاحمدي|الجهراء|حولي|الفروانية|مبارك الكبير)\s*الجزئية/);
  d.court=court?`جزئي ${court[1]}`:get(/(جزئي\s*(?:العاصمة|الاحمدي|الجهراء|حولي|الفروانية|مبارك الكبير))/);
  const nationality=tidy(order.match(/الجنسي[ةه]\s*[:\-]?\s*([^\n:]{2,30}?)(?=\s*الرقم|\n)/)?.[1]||'');
  d.nationality=/^(?:الكويت|كويتي|Kuwait)$/i.test(nationality)?'كويتي الجنسية':nationality;
  const opponentPart=after(order,/(?:^|\n)\s*ضد\s*:/,700);
  d.address=tidy(opponentPart.match(/(?:موطنه|العنوان|عنوانه|ويعلن في)\s*[:\-]\s*([^\n]{5,180})/)?.[1]||'');
  if(!d.address)d.address=tidy((demand||text).match(/(?:العنوان|عنوانه|ويعلن في|المقيم)\s*[:/\-]\s*([^\n]{5,180})/)?.[1]||'');
  const detailedAddress=demand.split('\n').find(line=>/قطع[ةه]\s*\d/.test(line)&&/شارع\s*\d/.test(line)&&/منزل/.test(line));
  if(detailedAddress){
    d.address=tidy(detailedAddress).replace(/^[ل)]\s+/,'').replace(/\s*-?\s*الرقم\s*$/,'');
    const unit=after(demand,/المقيم\s*\//,100).split('\n')[0];
    const unitNumber=unit.match(/\b\d{7,9}\b/)?.[0];
    if(unitNumber)d.address2=`الرقم الآلي للوحدة: ${unitNumber}`;
  }
  d.code=get(/(?:كود|الكود)\s*[:\-]?\s*(\d{1,6})(?!\d)/)||tidy(matchText(filename).match(/(?:كود|code)\s*[_: -]?\s*(\d{1,6})(?!\d)/i)?.[1]||'');
  d.demandDate=datesIn(after(order,/(?:بعث[ةيه]+\s*بريدية|البعثية|ارسل بتاريخ|كتاب\s*التكليف)/,170))[0]||'';
  d.statementDate=datesIn(after(statement,/(?:تاريخ\s*الفاتور[ةه]|تاريخ\s*الكشف|كشف\s*الحساب)/,160))[0]||'';
  if(!d.statementDate){const dates=[...new Set(datesIn(statement))];if(dates.length===1)d.statementDate=dates[0];}
  const refused=after(order,/(?:رفض|الرفض|مرفوض)/,180);
  d.rejectedDate=datesIn(refused)[0]||'';
  // A complete date stamp on the signed order page is distinct from the demand date.
  if(!d.rejectedDate){const stamp=order.match(/\b\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+20\d{2}\b/i);if(stamp&&/امر\s*اداء/.test(order)&&/رفض|مرفوض/.test(text))d.rejectedDate=parseDocumentDate(stamp[0]);}
  d.receiptNumber=tidy(receipt.match(/\b(F\d{6,12})\b/i)?.[1]||'');
  const receiptDates=datesIn(receipt);
  d.receiptDate=datesIn(after(receipt,/(?:^|\n)\s*التاريخ\s*[:\-]?\s*\n/,100))[0]||receiptDates.at(-1)||'';
  d.receiptFee=money(tidy(receipt.match(/(?:المبلغ\s*[:\-]?\s*\n?)(\d+[.,٫]\d{3})/)?.[1]||''));
  if(!d.receiptFee){const values=[...new Set(Array.from(receipt.matchAll(/(?:^|\n)\s*(\d+[.,٫]\d{3})\s*(?:د[. ]?ك)?\s*(?=\n|$)/g),m=>money(m[1])).filter(v=>v!==d.amount))];if(values.length===1)d.receiptFee=values[0];}
  d.orderAuto=selectNumber(receipt,/رقم\s*ال[اأا]?ل[يى]\s*[:\-]?\s*(\d{9})\b/g)||tidy(receipt.match(/(?:^|\n)\s*(\d{9})\s*(?=\n|$)/)?.[1]||'');
  d.companyRegister=tidy(statement.match(/C\.?\s*R\.?\s*[:\-]?\s*(\d{3,10})\b/i)?.[1]||'');
  return d;
}

export function extractionSummary(d:DocumentData){
  const labels:Record<string,string>={company:'الشركة المدعية',defendant:'المعلن إليه',amount:'مبلغ المطالبة',orderNumber:'رقم أمر الأداء',rejectedDate:'تاريخ رفض أمر الأداء',statementDate:'تاريخ كشف الحساب',demandDate:'تاريخ البعثية'};
  const filled=Object.entries(d).filter(([k,v])=>k!=='evidence'&&typeof v==='string'&&v.trim()).length;
  const missing=Object.entries(labels).filter(([k])=>!d[k]).map(([,v])=>v);
  const core=['company','defendant','amount'].filter(k=>!!d[k]).length;
  return {filled,missing,status:core===0?'failed':missing.length?'partial':'ready'} as const;
}

export function assessText(raw:string){
  const text=matchText(raw),letters=(text.match(/[\p{L}\p{N}]/gu)||[]).length;
  const arabic=(text.match(/[\u0621-\u064a]/g)||[]).length;
  const anchors=(text.match(/(?:المحكمة|محكمة|المدين|المدعي|المدني|المدني[ةه]|الجنسي[ةه]|الشركة|شرك[ةه]|للاتصالات|امر\s*اداء|حساب|العقد|المشترك|المبلغ|مبلغ|دينار|المطالبة|الايصال|الاطلاع|العنوان|الرسوم|ضده|تاريخ|فاتور[ةه])/g)||[]).length;
  return {letters,arabic,anchors,usable:letters>=35&&arabic>=20&&anchors>=2};
}
