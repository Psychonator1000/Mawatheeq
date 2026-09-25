import type {PDFDocumentProxy} from 'pdfjs-dist';
import type {Worker,PSM} from 'tesseract.js';
import {assessText,cleanDocumentText,needsNumericReading,numericReadings} from './document-fields';

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

// The same renderer/OCR pipeline is used by the browser and the source-PDF regression check.
export async function readPDFPages(pdf:PDFDocumentProxy,canvasFactory:()=>HTMLCanvasElement,getWorker:(progress:(value:number)=>void)=>Promise<Worker>,onProgress:Progress,signal:AbortSignal){
  if(pdf.numPages>100)throw new Error('الحد الأقصى 100 صفحة لكل ملف.');
  const pages:PDFPageText[]=[];let worker:Worker|undefined;
  let ocrProgress:((value:number)=>void)=()=>{};
  let renderTask:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
  const cancel=()=>{renderTask?.cancel();if(worker)void worker.terminate().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{
    for(let i=1;i<=pdf.numPages;i++){
      check(signal);onProgress((i-1)/pdf.numPages*100,`قراءة الصفحة ${i} من ${pdf.numPages}`);
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
          const scale=Math.min(300/72,Math.sqrt(10000000/(base.width*base.height)),4000/Math.max(base.width,base.height));
          const viewport=page.getViewport({scale});canvas=canvasFactory();
          canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('تعذر تجهيز صورة الصفحة.');
          renderTask=page.render({canvasContext:ctx,viewport,canvas,background:'#ffffff'});
          await interruptible(renderTask.promise,signal);
          await worker.setParameters({tessedit_pageseg_mode:'3' as PSM,preserve_interword_spaces:'0',user_defined_dpi:String(Math.round(scale*72))});
          onProgress((i-.75)/pdf.numPages*100,`قراءة النص المصوّر في الصفحة ${i} من ${pdf.numPages}`);
          ocrProgress=p=>onProgress((i-.75+.4*p)/pdf.numPages*100,`قراءة النص المصوّر في الصفحة ${i} من ${pdf.numPages}`);
          let result=await interruptible(worker.recognize(canvas,{rotateAuto:true}),signal);
          text=cleanDocumentText(result.data.text);confidence=result.data.confidence;
          if((confidence<50||!assessText(text).usable)&&text.length<4000){
            onProgress((i-.35)/pdf.numPages*100,`تحسين قراءة الصفحة ${i} من ${pdf.numPages}`);
            ocrProgress=p=>onProgress((i-.35+.3*p)/pdf.numPages*100,`تحسين قراءة الصفحة ${i} من ${pdf.numPages}`);
            await worker.setParameters({tessedit_pageseg_mode:'11' as PSM});
            const retry=await interruptible(worker.recognize(canvas,{rotateAuto:true}),signal);
            const a=assessText(text),b=assessText(retry.data.text);
            if((b.usable&&!a.usable)||(b.usable===a.usable&&retry.data.confidence>confidence)){
              result=retry;text=cleanDocumentText(result.data.text);confidence=result.data.confidence;
            }
          }
          if(needsNumericReading(text)){
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
              onProgress((i-.3)/pdf.numPages*100,`تدقيق الأرقام والتواريخ في الصفحة ${i}`);
              ocrProgress=p=>onProgress((i-.3+.25*p)/pdf.numPages*100,`تدقيق الأرقام والتواريخ في الصفحة ${i}`);
              await worker.reinitialize('eng');
              await worker.setParameters({tessedit_pageseg_mode:'11' as PSM,user_defined_dpi:String(Math.round(scale*72))});
              const numbers=await interruptible(worker.recognize(canvas,{rotateAuto:true}),signal,45000);
              const extra=numericReadings(numbers.data.text);
              if(extra)text+='\n\nقراءة إضافية للأرقام والتواريخ:\n'+extra;
            }catch(e){if(signal.aborted)throw aborted();/* Keep the successful primary reading. */}
            finally{small.width=small.height=0;await worker.reinitialize('ara+eng');}
          }
        }
        const quality=assessText(text);
        pages.push({page:i,text,method,confidence,...(!quality.usable||(confidence!==undefined&&confidence<55)?{warning:'قراءة غير واضحة؛ راجع الصفحة الأصلية.'}:{})});
      }catch(e){
        if(signal.aborted)throw aborted();
        renderTask?.cancel();
        if(worker){await worker.terminate().catch(()=>{});worker=undefined;}
        pages.push({page:i,text:'',method:'ocr',warning:`تعذرت قراءة هذه الصفحة؛ راجع الأصل. ${e instanceof Error?e.message:''}`});
      }finally{ocrProgress=()=>{};if(canvas)canvas.width=canvas.height=0;page.cleanup();renderTask=undefined;}
      onProgress(i/pdf.numPages*100,`اكتملت الصفحة ${i} من ${pdf.numPages}`);
    }
    check(signal);return pages;
  }finally{signal.removeEventListener('abort',cancel);if(worker)await worker.terminate().catch(()=>{});}
}

export async function extractPDF(file:File,onProgress:Progress,signal:AbortSignal){
  check(signal);onProgress(0,'تجهيز قارئ PDF واللغة العربية…');
  const pdfjs=await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc='/ocr/pdf.worker.min.mjs';
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,
    wasmUrl:'/ocr/pdfjs/wasm/',cMapUrl:'/ocr/pdfjs/cmaps/',standardFontDataUrl:'/ocr/pdfjs/standard_fonts/',
    // Do not silently discard a damaged/unsupported scanned image layer.
    stopAtErrors:true});
  const cancel=()=>{void task.destroy().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{
    const pdf=await interruptible(task.promise,signal);
    return await readPDFPages(pdf,()=>document.createElement('canvas'),async progress=>{
      const {createWorker}=await import('tesseract.js');
      return createWorker(['ara','eng'],1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr',langPath:'/ocr',logger:m=>{if(m.status==='recognizing text')progress(m.progress);}});
    },onProgress,signal);
  }catch(e){
    if(signal.aborted)throw aborted();
    if(e instanceof Error&&e.name==='PasswordException')throw new Error('الملف محمي بكلمة مرور. ارفع نسخة غير محمية.');
    throw e instanceof Error?new Error(`تعذر إكمال قراءة الملف: ${e.message}`):new Error('تعذر قراءة الملف. يرجى رفع نسخة PDF سليمة.');
  }finally{signal.removeEventListener('abort',cancel);await task.destroy().catch(()=>{});}
}
