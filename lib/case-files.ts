// Case documents: the categories, the file types the office accepts and small helpers for the upload list.
// The database checks the same lists (migration 20261014050000_case_files.sql).
export type CaseFile = { id: string; caseId: string; name: string; title: string; category: string; docDate: string | null; size: number; mime: string; uploadedBy: string; createdAt: string; revision: number };

export const CASE_FILE_CATEGORIES = ['صحيفة الدعوى', 'مذكرات', 'حوافظ مستندات', 'أحكام', 'محاضر الجلسات', 'إعلانات', 'تقارير الخبراء', 'بيانات مالية', 'توكيلات', 'مراسلات', 'أخرى'] as const;
export const MAX_CASE_FILE = 25 * 1024 * 1024;

const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff', txt: 'text/plain',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export const CASE_FILE_ACCEPT = Object.keys(BY_EXTENSION).map(x => '.' + x).join(',');
const extension = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase();

/** The file's type as the office stores it, or '' when it is not accepted. Browsers leave the type empty for some files, so the extension decides. */
export function caseFileMime(file: { name: string; type: string }) {
  const byName = BY_EXTENSION[extension(file.name)] || '';
  return Object.values(BY_EXTENSION).includes(file.type) ? file.type : byName;
}
/** The file name without its extension, as a starting title. */
export const titleFromName = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || name;

/** A starting category from words in the file name; the person can change it before uploading. */
export function guessCategory(name: string): string {
  const n = name.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');
  const rules: [RegExp, string][] = [
    [/صحيف|صحيفه الدعوي|لائحه/, 'صحيفة الدعوى'], [/مذكر/, 'مذكرات'], [/حافظ|حوافظ/, 'حوافظ مستندات'], [/حكم|احكام|منطوق/, 'أحكام'],
    [/محضر|محاضر|رول/, 'محاضر الجلسات'], [/اعلان|إعلان/, 'إعلانات'], [/خبير|خبراء|تقرير/, 'تقارير الخبراء'],
    [/كشف حساب|فاتور|سند|ايصال|مالي/, 'بيانات مالية'], [/توكيل|وكال/, 'توكيلات'], [/كتاب|خطاب|مراسل|رساله/, 'مراسلات'],
  ];
  return rules.find(([r]) => r.test(n))?.[1] || 'أخرى';
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' بايت';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' ك.ب';
  return (bytes / 1024 / 1024).toFixed(1) + ' م.ب';
}
export const isPreviewable = (mime: string) => mime === 'application/pdf' || mime.startsWith('image/') && mime !== 'image/tiff' || mime === 'text/plain';
