// A Word file shown in the app as it will print (lib/word-render.ts draws it), with its text editable in place; the
// edits are written back into the same Word file, so what is downloaded keeps the template's layout, fonts and boxes.
// Each piece of text (each <w:t>) is drawn as <span data-t="n">; reading the spans back gives each piece's new text.
import type PizZipType from 'pizzip';
import { PAGE_GAP, renderDocument } from './word-render';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

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

/** Draws the document into `body` and makes its text editable. */
export function renderWord(doc: WordDoc, body: HTMLElement) {
  return renderDocument(doc.zip, doc.dom, doc.texts, body);
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

/**
 * Prints the papers as they are drawn here, straight to the printer (no Word file to open): each paper's pages are cut
 * from its drawing onto A4 sheets, and only they print. Corrections made on the page are already in the documents.
 */
export async function printWords(docs: WordDoc[]) {
  document.getElementById('wd-print-root')?.remove();
  const root = document.createElement('div'); root.id = 'wd-print-root'; root.setAttribute('aria-hidden', 'true');
  document.body.append(root);
  for (const doc of docs) {
    const host = document.createElement('div'); root.append(host);
    const l = renderDocument(doc.zip, doc.dom, doc.texts, host), sheet = host.querySelector<HTMLElement>('.wd-sheet')!;
    const h = (l.height - (l.pages - 1) * PAGE_GAP) / l.pages, pages: HTMLElement[] = [];
    for (let i = 0; i < l.pages; i++) {
      const page = document.createElement('div'); page.className = 'wd-print-page';
      Object.assign(page.style, { width: l.width + 'px', height: h + 'px' });
      const copy = sheet.cloneNode(true) as HTMLElement; Object.assign(copy.style, { position: 'absolute', left: '0', top: -(i * (h + PAGE_GAP)) + 'px' });
      page.append(copy); pages.push(page);
    }
    host.replaceWith(...pages);
  }
  for (const el of Array.from(root.querySelectorAll('[contenteditable]'))) el.removeAttribute('contenteditable');
  await document.fonts?.ready;
  const done = () => { document.documentElement.classList.remove('wd-printing'); root.remove(); window.removeEventListener('afterprint', done); };
  document.documentElement.classList.add('wd-printing'); window.addEventListener('afterprint', done);
  window.print();
}
