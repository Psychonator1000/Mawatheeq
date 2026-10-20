// Every spreadsheet import opens files here, so they all take the same kinds of file: every Excel format (old and new,
// macro, binary, template, 2003 XML), OpenDocument sheets, and CSV/TSV text saved as UTF-8 or as Arabic Windows text.
export const EXCEL_ACCEPT = [
  '.xlsx', '.xlsm', '.xlsb', '.xls', '.xltx', '.xltm', '.xlt', '.xml', '.ods', '.fods', '.csv', '.tsv',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12', 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  'application/vnd.oasis.opendocument.spreadsheet', 'text/csv', 'text/tab-separated-values',
].join(',');

type ReadOptions = { cellDates?: boolean; raw?: boolean };

/** Text files are decoded first: Excel saves Arabic CSV as Windows-1256 unless «CSV UTF-8» is chosen. */
function decodeText(bytes: Uint8Array) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1256').decode(bytes); }
}

export async function openWorkbook(file: File, options: ReadOptions = {}) {
  const xlsx = await import('xlsx'); const X = (xlsx as unknown as { default?: typeof xlsx }).default || xlsx;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('الملف فارغ.');
  try {
    const book = /\.(csv|tsv|txt)$/i.test(file.name)
      // Text cells stay as written, so numbers like an automatic number keep their leading zeros.
      ? X.read(decodeText(bytes), { type: 'string', ...options, raw: true })
      : X.read(bytes, { type: 'array', ...options });
    if (!book.SheetNames.length) throw new Error('لا توجد أوراق في الملف.');
    return { X, book };
  } catch (e) {
    if (/password|encrypt/i.test(String((e as Error)?.message))) throw new Error('الملف محمي بكلمة مرور. احفظه من Excel بدون كلمة مرور ثم أعد المحاولة.');
    throw e;
  }
}
