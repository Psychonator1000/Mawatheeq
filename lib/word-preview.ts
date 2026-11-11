// A Word file shown in the app as it will print, with its text editable in place; the edits are written back into the
// same Word file, so what is downloaded keeps the template's layout, fonts and boxes exactly.
//
// How the edits find their way back: before the file is drawn, every piece of text in it (each <w:t>) is prefixed with
// an invisible private-use mark carrying its number. Once drawn, each mark becomes a <span data-t="n"> around that text,
// and the marks themselves are removed. Reading the spans back gives each piece's new text.
import type PizZipType from 'pizzip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const START = 0xe000, END = 0xe00b, DIGIT = 0xe001;
const mark = (n: number) => String.fromCharCode(START) + [...String(n)].map(d => String.fromCharCode(DIGIT + Number(d))).join('') + String.fromCharCode(END);
const MARKS = /([-]+)/g;

export type WordDoc = {
  zip: PizZipType;
  dom: Document;
  texts: Element[];
  /** A text box is stored twice (the drawing and an older copy for old Word); an edit goes to both. */
  twins: Map<number, number[]>;
};

export async function openWord(data: ArrayBuffer | Blob): Promise<WordDoc> {
  const PizZip = (await import('pizzip')).default;
  const zip = new PizZip(data instanceof Blob ? await data.arrayBuffer() : data);
  const dom = new DOMParser().parseFromString(zip.file('word/document.xml')!.asText(), 'application/xml');
  const texts = Array.from(dom.getElementsByTagNameNS(W, 't'));
  const index = new Map(texts.map((t, i) => [t, i]));
  const twins = new Map<number, number[]>();
  for (const alt of Array.from(dom.getElementsByTagNameNS(MC, 'AlternateContent'))) {
    const part = (name: string) => { const el = Array.from(alt.children).find(c => c.localName === name); return el ? Array.from(el.getElementsByTagNameNS(W, 't')).map(t => index.get(t)!) : []; };
    const a = part('Choice'), b = part('Fallback');
    if (a.length && a.length === b.length) a.forEach((n, i) => { twins.set(n, [b[i]]); twins.set(b[i], [n]); });
  }
  return { zip, dom, texts, twins };
}

/** Draws the document into `body` (its styles into `styles`) and makes its text editable. */
export async function renderWord(doc: WordDoc, body: HTMLElement, styles: HTMLElement) {
  const { renderAsync } = await import('docx-preview');
  const PizZip = (await import('pizzip')).default;
  const marked = doc.dom.cloneNode(true) as Document;
  Array.from(marked.getElementsByTagNameNS(W, 't')).forEach((t, i) => { t.textContent = mark(i) + (t.textContent || ''); });
  const copy = new PizZip(doc.zip.generate({ type: 'arraybuffer' }));
  copy.file('word/document.xml', new XMLSerializer().serializeToString(marked));
  body.replaceChildren(); styles.replaceChildren();
  await renderAsync(copy.generate({ type: 'blob' }), body, styles, { inWrapper: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true, breakPages: true, experimental: false, useBase64URL: true });
  // Each marked piece of text becomes its own span; text that was not marked (headers, tabs, numbering) stays fixed.
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const node of nodes) {
    const text = node.data;
    if (!//.test(text)) { if (text.trim() && node.parentElement && !node.parentElement.closest('[data-t]')) node.parentElement.dataset.fixed = ''; continue; }
    const frag = document.createDocumentFragment();
    let last = 0, current: number | null = null;
    const flush = (to: number) => {
      const part = text.slice(last, to);
      if (current === null) { if (part) frag.append(part); return; }
      const span = document.createElement('span'); span.dataset.t = String(current); span.textContent = part; frag.append(span);
    };
    for (const m of text.matchAll(MARKS)) {
      flush(m.index!);
      current = Number([...m[1]].map(c => c.charCodeAt(0) - DIGIT).join(''));
      last = m.index! + m[0].length;
    }
    flush(text.length);
    node.replaceWith(frag);
  }
  // Only the document's own paragraphs are editable (not the header or footer, which come from other parts).
  for (const span of Array.from(body.querySelectorAll<HTMLElement>('[data-t]'))) {
    const block = span.closest<HTMLElement>('p,td,li') || span.parentElement!;
    if (!block.isContentEditable) { block.contentEditable = 'true'; block.spellcheck = false; block.classList.add('word-edit'); }
  }
}

/** Reads the drawn text back into the document: each piece takes its span's text; typed text joins the piece before it. */
export function collectWord(doc: WordDoc, body: HTMLElement) {
  const out = new Map<number, string>();
  for (const block of Array.from(body.querySelectorAll<HTMLElement>('.word-edit'))) {
    let last: number | null = null;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement!, owner = el.closest<HTMLElement>('[data-t]');
      if (el.closest('[data-fixed]') && !owner) continue;
      const at: number | null = owner ? Number(owner.dataset.t) : last;
      if (at === null) continue;
      out.set(at, (out.get(at) || '') + (n as Text).data);
      last = at;
    }
    // Pieces whose spans were deleted entirely become empty.
    for (const span of Array.from(block.querySelectorAll<HTMLElement>('[data-t]'))) if (!out.has(Number(span.dataset.t))) out.set(Number(span.dataset.t), '');
  }
  // A changed piece also changes its twin (when only one of the two is drawn, or the other was left as it was).
  const final = new Map(out);
  for (const [i, text] of out) if (text !== doc.texts[i]?.textContent) for (const j of doc.twins.get(i) || []) final.set(j, text);
  for (const [i, text] of final) {
    const t = doc.texts[i]; if (!t || t.textContent === text) continue;
    t.textContent = text; t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  }
}

/** The clean Word file, with every edit made so far. */
export function wordBlob(doc: WordDoc): Blob {
  doc.zip.file('word/document.xml', new XMLSerializer().serializeToString(doc.dom));
  return doc.zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}

/** A file name Windows and phones accept: no path characters, no trailing dots, at most 120 characters. */
export function safeFileName(name: string, fallback = 'مستند') {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 120);
  return clean || fallback;
}
