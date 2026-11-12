import type {PDFDocumentProxy} from 'pdfjs-dist';
import type {Worker,PSM} from 'tesseract.js';
import {assessText,cleanDocumentText,needsNumericReading,numericReadings} from './document-fields';
import {assetUrl} from './asset-url';

export type PDFPageText={page:number;text:string;method:'text'|'ocr';confidence?:number;warning?:string};
type Progress=(percent:number,message:string)=>void;
const aborted=()=>new DOMException('تم إلغاء القراءة','AbortError');
function check(signal:AbortSignal){if(signal.aborted)throw aborted();}
function interruptible<T>(promise:Promise<T>,signal:AbortSignal,milliseconds=120000):Promise<T>{
  return new Promise((resolve,reject)=>{
    const cancel=()=>finish(()=>reject(aborted()));
    const timer=setTimeout(()=>finish(()=>reject(new Error('استغرقت القراءة وقتاً طويلاً. أعد المحاولة أو ارفع الصفحات المطلوبة في ملف أصغر.'))),milliseconds);
    const finish=(done:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);done();};
    signal.addEventListener('abort',cancel,{once:true});
    promise.then(v=>finish(()=>resolve(v)),e=>finish(()=>reject(e)));
    if(signal.aborted)cancel();
  });
}

/**
 * How a reading may be lightened or share its engines. `digits`: a second engine kept in English for the numbers pass,
 * so the main one is not switched from Arabic and back on every page (each switch reloads the language data).
 * `shared`: the engines belong to the caller and outlive this file (`drop` is told when one breaks). `dpi`/`pixels`: the
 * resolution of a scanned page and its cap (lower on a weaker computer).
 */
export type ReadOptions={digits?:()=>Promise<Worker>;shared?:boolean;drop?:()=>void;dpi?:number;pixels?:number;
  /** Only these pages (1-based), in this order; otherwise the first `maxPages`. */ pages?:number[];
  /** Whether a page's numbers pass is still needed, given what the pages read so far say; without it, it runs whenever
   *  the page has numbers or dates in it. */ wantNumbers?:(page:number,textSoFar:string)=>boolean};
// The same renderer/OCR pipeline is used by the browser and the source-PDF regression check.
// `maxPages` reads only the first pages, for bundles whose data is at the front (a payment order's first four pages).
export async function readPDFPages(pdf:PDFDocumentProxy,canvasFactory:()=>HTMLCanvasElement,getWorker:(progress:(value:number)=>void)=>Promise<Worker>,onProgress:Progress,signal:AbortSignal,maxPages=Infinity,opts:ReadOptions={}){
  if(pdf.numPages>100)throw new Error('الحد الأقصى 100 صفحة لكل ملف.');
  const pages:PDFPageText[]=[];let worker:Worker|undefined;
  let ocrProgress:((value:number)=>void)=()=>{};
  let renderTask:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
  const cancel=()=>{renderTask?.cancel();if(worker){void worker.terminate().catch(()=>{});opts.drop?.();}};
  signal.addEventListener('abort',cancel,{once:true});
  const list=(opts.pages?opts.pages.filter(n=>n>=1&&n<=pdf.numPages):Array.from({length:Math.min(pdf.numPages,maxPages)},(_,n)=>n+1));
  const total=list.length,retried=new Set<number>();
  try{
    for(let at=1;at<=list.length;at++){
      // `at` counts the pages read (for the progress), `i` is the page itself.
      const i=list[at-1];
      check(signal);onProgress((at-1)/total*100,`قراءة الصفحة ${at} من ${total}`);
      const page=await interruptible(pdf.getPage(i),signal);
      let canvas:HTMLCanvasElement|undefined;
      try{
        const content=await interruptible(page.getTextContent(),signal);
        let text=cleanDocumentText(content.items.map(it=>'str' in it?it.str+(it.hasEOL?'\n':' '):'').join(''));
        let method:PDFPageText['method']='text',confidence:number|undefined;
        if(!assessText(text).usable){
          method='ocr';
          if(!worker){
            const pending=getWorker(value=>ocrProgress(value)).then(w=>{if(signal.aborted){void w.terminate();throw aborted();}return w;});
            worker=await interruptible(pending,signal);
          }
          // 300 dpi resolves small Arabic print and date stamps; cap each canvas for memory.
          const base=page.getViewport({scale:1});
          const scale=Math.min((opts.dpi??300)/72,Math.sqrt((opts.pixels??10000000)/(base.width*base.height)),4000/Math.max(base.width,base.height));
          const viewport=page.getViewport({scale});canvas=canvasFactory();
          canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('تعذر تجهيز صورة الصفحة.');
          renderTask=page.render({canvasContext:ctx,viewport,canvas,background:'#ffffff'});
          await interruptible(renderTask.promise,signal);
          await worker.setParameters({tessedit_pageseg_mode:'3' as PSM,preserve_interword_spaces:'0',user_defined_dpi:String(Math.round(scale*72))});
          onProgress((at-.75)/total*100,`قراءة النص المصوّر في الصفحة ${at} من ${total}`);
          ocrProgress=p=>onProgress((at-.75+.4*p)/total*100,`قراءة النص المصوّر في الصفحة ${at} من ${total}`);
          let result=await interruptible(worker.recognize(canvas,{rotateAuto:true}),signal);
          text=cleanDocumentText(result.data.text);confidence=result.data.confidence;
          if((confidence<50||!assessText(text).usable)&&text.length<4000){
            onProgress((at-.35)/total*100,`تحسين قراءة الصفحة ${at} من ${total}`);
            ocrProgress=p=>onProgress((at-.35+.3*p)/total*100,`تحسين قراءة الصفحة ${at} من ${total}`);
            await worker.setParameters({tessedit_pageseg_mode:'11' as PSM});
            const retry=await interruptible(worker.recognize(canvas,{rotateAuto:true}),signal);
            const a=assessText(text),b=assessText(retry.data.text);
            if((b.usable&&!a.usable)||(b.usable===a.usable&&retry.data.confidence>confidence)){
              result=retry;text=cleanDocumentText(result.data.text);confidence=result.data.confidence;
            }
          }
          if(needsNumericReading(text)&&(!opts.wantNumbers||opts.wantNumbers(i,[...pages.filter(p=>!p.warning).map(p=>`الصفحة ${p.page}\n${p.text}`),`الصفحة ${i}\n${text}`].join('\n\n')))){
            // Latin date stamps and receipt codes need a separate recognition pass.
            // Render at scanner resolution then smooth the enlargement so small
            // digits in one-bit image masks do not become jagged blocks.
            const small=canvasFactory();
            try{
              const scanView=page.getViewport({scale:scale*2/3});
              small.width=Math.ceil(scanView.width);small.height=Math.ceil(scanView.height);
              renderTask=page.render({canvas:small,canvasContext:small.getContext('2d')!,viewport:scanView,background:'#ffffff'});
              await interruptible(renderTask.promise,signal);
              ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(small,0,0,canvas.width,canvas.height);
              onProgress((at-.3)/total*100,`تدقيق الأرقام والتواريخ في الصفحة ${at}`);
              ocrProgress=p=>onProgress((at-.3+.25*p)/total*100,`تدقيق الأرقام والتواريخ في الصفحة ${at}`);
              const digits=opts.digits?await interruptible(opts.digits(),signal):worker;
              if(!opts.digits)await worker.reinitialize('eng');
              await digits.setParameters({tessedit_pageseg_mode:'11' as PSM,user_defined_dpi:String(Math.round(scale*72))});
              const numbers=await interruptible(digits.recognize(canvas,{rotateAuto:true}),signal,45000);
              const extra=numericReadings(numbers.data.text);
              if(extra)text+='\n\nقراءة إضافية للأرقام والتواريخ:\n'+extra;
            }catch(e){if(signal.aborted)throw aborted();/* Keep the successful primary reading. */}
            finally{small.width=small.height=0;if(!opts.digits)await worker.reinitialize('ara+eng');}
          }
        }
        const quality=assessText(text);
        pages.push({page:i,text,method,confidence,...(!quality.usable||(confidence!==undefined&&confidence<55)?{warning:'قراءة غير واضحة؛ راجع الصفحة الأصلية.'}:{})});
      }catch(e){
        if(signal.aborted)throw aborted();
        renderTask?.cancel();
        if(worker){await worker.terminate().catch(()=>{});worker=undefined;opts.drop?.();}
        // A page that ran out of time (a busy computer) is read once more, with a fresh engine, before giving up on it.
        if(!retried.has(i)&&e instanceof Error&&/وقتاً طويلاً/.test(e.message)){retried.add(i);list.splice(at,0,i);continue;}
        pages.push({page:i,text:'',method:'ocr',warning:`تعذرت قراءة هذه الصفحة؛ راجع الأصل. ${e instanceof Error?e.message:''}`});
      }finally{ocrProgress=()=>{};if(canvas)canvas.width=canvas.height=0;page.cleanup();renderTask=undefined;}
      onProgress(at/total*100,`اكتملت الصفحة ${at} من ${total}`);
    }
    check(signal);return pages;
  }finally{signal.removeEventListener('abort',cancel);if(worker&&!opts.shared)await worker.terminate().catch(()=>{});}
}

export async function extractPDF(file:File|Blob,onProgress:Progress,signal:AbortSignal,maxPages=Infinity,engine?:OcrEngine,plan:Pick<ReadOptions,'pages'|'wantNumbers'>={}){
  check(signal);onProgress(0,'تجهيز قارئ PDF واللغة العربية…');
  const pdfjs=await import('pdfjs-dist');
  // The worker is loaded through a small patch for browsers without Map.getOrInsertComputed.
  pdfjs.GlobalWorkerOptions.workerSrc=assetUrl('/ocr/pdf.worker.compat.mjs');
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,
    wasmUrl:assetUrl('/ocr/pdfjs/wasm/'),cMapUrl:assetUrl('/ocr/pdfjs/cmaps/'),standardFontDataUrl:assetUrl('/ocr/pdfjs/standard_fonts/'),
    // Do not silently discard a damaged/unsupported scanned image layer.
    stopAtErrors:true});
  const cancel=()=>{void task.destroy().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{
    const pdf=await interruptible(task.promise,signal);
    if(engine)return await readPDFPages(pdf,()=>document.createElement('canvas'),async progress=>{engine.progress=progress;return engine.main()},onProgress,signal,maxPages,
      {digits:engine.digits,shared:true,drop:engine.drop,dpi:engine.dpi,pixels:engine.pixels,...plan});
    return await readPDFPages(pdf,()=>document.createElement('canvas'),async progress=>makeWorker(['ara','eng'],progress),onProgress,signal,maxPages);
  }catch(e){
    if(signal.aborted)throw aborted();
    if(e instanceof Error&&e.name==='PasswordException')throw new Error('الملف محمي بكلمة مرور. ارفع نسخة غير محمية.');
    throw e instanceof Error?new Error(`تعذر إكمال قراءة الملف: ${e.message}`):new Error('تعذر قراءة الملف. يرجى رفع نسخة PDF سليمة.');
  }finally{signal.removeEventListener('abort',cancel);await task.destroy().catch(()=>{});}
}

async function makeWorker(langs:string[],progress:(value:number)=>void){
  const {createWorker}=await import('tesseract.js');
  return createWorker(langs,1,{workerPath:assetUrl('/ocr/worker.min.js'),corePath:assetUrl('/ocr'),langPath:assetUrl('/ocr'),logger:m=>{if(m.status==='recognizing text')progress(m.progress);}});
}
/**
 * Two text-recognition engines kept for a whole batch of files (owner, 12 November 2026: «man it's slow»): the Arabic
 * one and an English one for the numbers pass. Starting an engine loads its language data, which took longer than
 * reading a page; a batch now starts each once. `light`: a weaker computer reads at a slightly lower resolution.
 */
export type OcrEngine={main:()=>Promise<Worker>;digits:()=>Promise<Worker>;drop:()=>void;close:()=>Promise<void>;progress:(value:number)=>void;dpi:number;pixels:number};
export function createOcrEngine(light=false):OcrEngine{
  let main:Promise<Worker>|null=null,digits:Promise<Worker>|null=null;
  const engine:OcrEngine={
    progress:()=>{},dpi:light?250:300,pixels:light?7000000:10000000,
    main:()=>main??=makeWorker(['ara','eng'],v=>engine.progress(v)),
    digits:()=>digits??=makeWorker(['eng'],v=>engine.progress(v)),
    // A broken or stopped engine is started afresh on the next page.
    drop:()=>{const m=main,d=digits;main=digits=null;for(const w of [m,d])void w?.then(x=>x.terminate()).catch(()=>{})},
    close:async()=>{const m=main,d=digits;main=digits=null;await Promise.all([m,d].map(w=>w?.then(x=>x.terminate()).catch(()=>{})))},
  };
  return engine;
}
