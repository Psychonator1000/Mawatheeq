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
  /** New lines typed into a piece of text: the line breaks and the lines after the first, kept beside that piece. */
  extras: Map<number, Element[]>;
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
  return { zip, dom, texts, twins, extras: new Map() };
}

/** Draws the document into `body` and makes its text editable. */
export function renderWord(doc: WordDoc, body: HTMLElement) {
  return renderDocument(doc.zip, doc.dom, doc.texts, body, drawn(doc));
}
/** The pieces of text with the lines typed into them (each drawn as part of its piece), and the line breaks typed. */
function drawn(doc: WordDoc) {
  const index = new Map(doc.texts.map((t, i) => [t, i])), breaks = new Set<Element>();
  for (const [i, els] of doc.extras) for (const el of els) if (el.localName === 'br') breaks.add(el); else index.set(el, i);
  return { index, breaks };
}
/** A piece's text as it now stands, the lines typed into it included. */
const textOf = (doc: WordDoc, i: number) => [doc.texts[i], ...(doc.extras.get(i) || [])].map(el => el.localName === 'br' ? '\n' : el.textContent || '').join('');
const XML = 'http://www.w3.org/XML/1998/namespace';
/** Writes a piece's text: its first line in the piece itself, then a Word line break and a text for every other line. */
function writeText(doc: WordDoc, i: number, text: string) {
  const t = doc.texts[i]; if (!t) return;
  for (const el of doc.extras.get(i) || []) el.remove();
  doc.extras.delete(i);
  const [first, ...rest] = text.split('\n');
  t.textContent = first; t.setAttributeNS(XML, 'xml:space', 'preserve');
  if (!rest.length) return;
  const made: Element[] = []; let after: Element = t;
  for (const line of rest) {
    const br = doc.dom.createElementNS(W, 'w:br'), next = doc.dom.createElementNS(W, 'w:t');
    next.setAttributeNS(XML, 'xml:space', 'preserve'); next.textContent = line;
    after.after(br, next); after = next; made.push(br, next);
  }
  doc.extras.set(i, made);
}

/** Reads the drawn text back into the document: each piece takes its span's text; typed text joins the piece before it. */
export function collectWord(doc: WordDoc, body: HTMLElement) {
  const out = new Map<number, string>();
  for (const block of Array.from(body.querySelectorAll<HTMLElement>('.word-edit'))) {
    let last: number | null = null, endsWithBreak = false;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      // A line break typed (Enter) or kept from an earlier one belongs to the piece before it.
      if (n.nodeType === Node.ELEMENT_NODE) {
        if ((n as Element).tagName === 'BR' && !(n as HTMLElement).dataset.fixed && last !== null) { out.set(last, (out.get(last) || '') + '\n'); endsWithBreak = true; }
        continue;
      }
      if (!(n as Text).data) continue;
      endsWithBreak = false;
      const el = n.parentElement!, owner = el.closest<HTMLElement>('[data-t]');
      if (el.closest('[data-fixed]') && !owner) continue;
      const at: number | null = owner ? Number(owner.dataset.t) : last;
      if (at === null) continue;
      out.set(at, (out.get(at) || '') + (n as Text).data);
      last = at;
    }
    // The browser keeps an extra break at the end of a line ended by Enter, only so the new line shows.
    if (endsWithBreak && last !== null) out.set(last, out.get(last)!.replace(/\n$/, ''));
    // Pieces whose spans were deleted entirely become empty.
    for (const span of Array.from(block.querySelectorAll<HTMLElement>('[data-t]'))) if (!out.has(Number(span.dataset.t))) out.set(Number(span.dataset.t), '');
  }
  // A changed piece also changes its twin (when only one of the two is drawn, or the other was left as it was).
  const final = new Map(out);
  for (const [i, text] of out) if (doc.texts[i] && text !== textOf(doc, i)) for (const j of doc.twins.get(i) || []) final.set(j, text);
  for (const [i, text] of final) if (doc.texts[i] && textOf(doc, i) !== text) writeText(doc, i, text);
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
    const l = renderDocument(doc.zip, doc.dom, doc.texts, host, drawn(doc)), sheet = host.querySelector<HTMLElement>('.wd-sheet')!;
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

