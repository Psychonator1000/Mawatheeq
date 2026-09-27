export function pageCount(total: number) {
  return Number.isFinite(total) ? Math.max(1, Math.floor(total)) : 1;
}

export function clampPage(page: number, total: number) {
  return Math.min(pageCount(total), Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1));
}

export function pageNumbers(page: number, total: number): (number | 'gap')[] {
  const count = pageCount(total);
  const current = clampPage(page, count);
  const numbers = new Set([1, count]);
  const start = Math.max(1, Math.min(current - 2, count - 4));
  const end = Math.min(count, Math.max(current + 2, 5));
  for (let n = start; n <= end; n++) numbers.add(n);
  const result: (number | 'gap')[] = [];
  let previous = 0;
  for (const n of [...numbers].sort((a, b) => a - b)) {
    if (n - previous === 2) result.push(previous + 1);
    else if (n - previous > 2) result.push('gap');
    result.push(n);
    previous = n;
  }
  return result;
}

export function parsePage(value: string, total: number): number | null {
  const digits = value.trim()
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0));
  if (!/^\d+$/.test(digits)) return null;
  const page = Number(digits);
  return Number.isSafeInteger(page) && page >= 1 && page <= pageCount(total) ? page : null;
}
