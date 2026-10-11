// Joins several Word files made from the same template into one file, so a batch prints in one go.
// Each copy becomes its own section (same page setup, header and footer, page numbers restart at 1).
// Pure string work on document.xml: no DOM, so it runs in the browser and in Node tests alike.

type Zip = { file(name: string): { asText(): string } | null; file(name: string, data: string): unknown; generate(options: { type: 'uint8array'; compression?: string }): Uint8Array };
type ZipConstructor = new (data: Uint8Array | ArrayBuffer) => Zip;

const BODY = /<w:body>([\s\S]*)<\/w:body>/;
/** The final section properties of a document body (page size, margins, header/footer references). */
function finalSection(body: string): { content: string; sectPr: string } {
  const at = body.lastIndexOf('<w:sectPr');
  if (at < 0) return { content: body, sectPr: '' };
  return { content: body.slice(0, at), sectPr: body.slice(at) };
}
/** Restart page numbering for a section so each document's pages count from 1, keeping Word's element order. */
const AFTER_PAGE_NUMBERS = ['<w:cols', '<w:formProt', '<w:vAlign', '<w:noEndnote', '<w:titlePg', '<w:textDirection', '<w:bidi', '<w:rtlGutter', '<w:docGrid', '<w:printerSettings', '<w:sectPrChange'];
function restartNumbering(sectPr: string): string {
  if (!sectPr) return sectPr;
  if (/<w:pgNumType\b/.test(sectPr)) return sectPr.replace(/<w:pgNumType\b([^>]*?)\s*(\/?)>/, (_, attrs: string, close: string) => `<w:pgNumType${attrs.replace(/\sw:start="[^"]*"/, '')} w:start="1"${close}>`);
  const full = /<w:sectPr\b[^>]*\/>$/.test(sectPr.trim()) ? sectPr.trim().replace(/\/>$/, '></w:sectPr>') : sectPr;
  const positions = AFTER_PAGE_NUMBERS.map(tag => full.indexOf(tag)).filter(i => i >= 0);
  const at = positions.length ? Math.min(...positions) : full.lastIndexOf('</w:sectPr>');
  return full.slice(0, at) + '<w:pgNumType w:start="1"/>' + full.slice(at);
}
/** Remove identifiers that must stay unique in one document; Word regenerates paragraph IDs. */
function dedupe(xml: string, copy: number, drawingIds: { next: number }): string {
  return xml
    .replace(/\s(?:w14:paraId|w14:textId)="[^"]*"/g, '')
    .replace(/<w:bookmark(?:Start|End)\b[^>]*\/>/g, '')
    .replace(/(<wp:docPr\b[^>]*\bid=")\d+(")/g, (_, a: string, b: string) => `${a}${drawingIds.next++}${b}`)
    .replace(/<w:sdtPr>[\s\S]*?<\/w:sdtPr>/g, block => block.replace(/(<w:id w:val=")-?\d+(")/, (_, a: string, b: string) => `${a}${100000 * (copy + 1) + drawingIds.next++}${b}`));
}

/** Merge Word files generated from one template, in order. A single file is returned unchanged. */
export function mergeWord(PizZip: ZipConstructor, files: (Uint8Array | ArrayBuffer)[]): Uint8Array {
  if (!files.length) throw new Error('لا توجد مستندات للدمج.');
  if (files.length === 1) return files[0] instanceof Uint8Array ? files[0] : new Uint8Array(files[0]);
  const base = new PizZip(files[0]);
  const baseXml = base.file('word/document.xml')!.asText();
  const baseBody = baseXml.match(BODY);
  if (!baseBody) throw new Error('ملف Word غير صالح للدمج.');
  const ids = { next: 1 };
  const parts: string[] = [];
  let lastSection = '';
  files.forEach((file, index) => {
    const xml = index === 0 ? baseXml : new PizZip(file).file('word/document.xml')!.asText();
    const body = xml.match(BODY);
    if (!body) throw new Error('ملف Word غير صالح للدمج.');
    const { content, sectPr } = finalSection(body[1]);
    const section = restartNumbering(sectPr);
    // Close the previous copy's section with its own settings; the next copy starts on a new page.
    if (index > 0) parts.push(`<w:p><w:pPr>${lastSection}</w:pPr></w:p>`);
    parts.push(dedupe(content, index, ids));
    lastSection = section;
  });
  const merged = baseXml.replace(BODY, () => `<w:body>${parts.join('')}${lastSection}</w:body>`);
  base.file('word/document.xml', merged);
  return base.generate({ type: 'uint8array', compression: 'DEFLATE' });
}
