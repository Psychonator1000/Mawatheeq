// Double-entry books: account types, money in fils (three decimals) and the statements built from the trial balance.

export type AccountType = 'asset_receivable' | 'asset_cash' | 'asset_current' | 'asset_non_current' | 'asset_prepayments' | 'asset_fixed'
  | 'liability_payable' | 'liability_credit_card' | 'liability_current' | 'liability_non_current' | 'equity' | 'equity_unaffected'
  | 'income' | 'income_other' | 'expense' | 'expense_depreciation' | 'expense_direct_cost' | 'off_balance';
export type AccountGroup = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'off';
export type JournalType = 'sale' | 'purchase' | 'cash' | 'bank' | 'general';
export type MoveState = 'draft' | 'posted' | 'cancel';
export type PartnerKind = 'customer' | 'vendor' | 'both' | 'other';

export type Account = { id: string; code: string; name: string; type: AccountType; reconcile: boolean; deprecated: boolean; note: string; revision: number };
export type Journal = { id: string; code: string; name: string; type: JournalType; defaultAccount: string; active: boolean; revision: number };
export type Partner = { id: string; name: string; kind: PartnerKind; clientEntityId: string; phone: string; email: string; reference: string; note: string; active: boolean; revision: number };
export type BooksSettings = { lockDate: string | null; fiscalLockDate: string | null; taxLockDate: string | null; fiscalYearEnd: string; currency: string; revision: number };
export type BooksSetup = { canEdit: boolean; canConfigure: boolean; accounts: Account[]; journals: Journal[]; partners: Partner[]; settings: BooksSettings;
  journalStats: Record<string, { drafts: number; posted: number; balance: string }> };
export type MoveLine = { id?: string; accountId: string; partnerId: string; caseId: string; label: string; debit: string; credit: string; dateMaturity: string | null };
export type Move = { id: string; journalId: string; name: string; moveType: string; state: MoveState; date: string; ref: string; narration: string; partnerId: string; caseId: string;
  reversedFrom: string; reversedBy: string; source: string; revision: number; createdBy: string; postedBy: string; postedAt: string | null; debit: string; credit: string; lines: MoveLine[] };
export type MoveSummary = { id: string; journalId: string; name: string; moveType: string; state: MoveState; date: string; ref: string; partnerId: string; caseId: string; amount: string; reversedFrom: string; revision: number };
export type TrialRow = { accountId: string; code: string; name: string; type: AccountType; opening: string; debit: string; credit: string; balance: string };
export type LedgerLine = { moveId: string; name: string; date: string; ref: string; label: string; accountId: string; partnerId: string; caseId: string; debit: string; credit: string };

export const ACCOUNT_TYPES: Record<AccountType, { label: string; group: AccountGroup }> = {
  asset_receivable: { label: 'ذمم مدينة', group: 'asset' }, asset_cash: { label: 'بنك ونقد', group: 'asset' }, asset_current: { label: 'أصول متداولة', group: 'asset' },
  asset_non_current: { label: 'أصول غير متداولة', group: 'asset' }, asset_prepayments: { label: 'مدفوعات مقدمة', group: 'asset' }, asset_fixed: { label: 'أصول ثابتة', group: 'asset' },
  liability_payable: { label: 'ذمم دائنة', group: 'liability' }, liability_credit_card: { label: 'بطاقة ائتمان', group: 'liability' }, liability_current: { label: 'التزامات متداولة', group: 'liability' },
  liability_non_current: { label: 'التزامات غير متداولة', group: 'liability' }, equity: { label: 'حقوق الملكية', group: 'equity' }, equity_unaffected: { label: 'أرباح السنة الحالية', group: 'equity' },
  income: { label: 'إيرادات', group: 'income' }, income_other: { label: 'إيرادات أخرى', group: 'income' }, expense: { label: 'مصروفات', group: 'expense' },
  expense_depreciation: { label: 'إهلاك', group: 'expense' }, expense_direct_cost: { label: 'تكلفة مباشرة', group: 'expense' }, off_balance: { label: 'خارج الميزانية', group: 'off' },
};
export const GROUP_LABELS: Record<AccountGroup, string> = { asset: 'الأصول', liability: 'الالتزامات', equity: 'حقوق الملكية', income: 'الإيرادات', expense: 'المصروفات', off: 'خارج الميزانية' };
export const JOURNAL_TYPES: Record<JournalType, string> = { sale: 'المبيعات', purchase: 'المشتريات', bank: 'البنك', cash: 'النقد', general: 'متنوع' };
export const MOVE_STATES: Record<MoveState, string> = { draft: 'مسودة', posted: 'مرحّل', cancel: 'ملغى' };
export const PARTNER_KINDS: Record<PartnerKind, string> = { customer: 'عميل', vendor: 'مورد', both: 'عميل ومورد', other: 'آخر' };

/** An amount as whole fils; blank is zero. Throws on anything but a plain amount with up to three decimals. */
export function toFils(v: string | number | null | undefined): number {
  const s = String(v ?? '').trim().replace(/,/g, '');
  if (!s) return 0;
  const m = /^(-)?(\d+)(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) throw new Error(`راجع المبلغ «${s.slice(0, 30)}»: أرقام فقط وحتى ثلاث خانات عشرية.`);
  const f = Number(m[2]) * 1000 + Number((m[3] || '').padEnd(3, '0'));
  if (!Number.isSafeInteger(f)) throw new Error('المبلغ أكبر من المسموح.');
  return m[1] ? -f : f;
}
export const isAmount = (v: string) => { try { return toFils(v) >= 0; } catch { return false; } };
/** Fils as a plain amount ("150.500"), for sending back to the server. */
export function filsText(f: number): string { const n = f < 0 ? -f : f; return (f < 0 ? '-' : '') + Math.floor(n / 1000).toString() + '.' + (n % 1000).toString().padStart(3, '0'); }
/** Fils for reading: thousands separated, negatives in brackets as accountants write them. */
export function money(f: number): string {
  const n = f < 0 ? -f : f, whole = Math.floor(n / 1000).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const s = whole + '.' + (n % 1000).toString().padStart(3, '0');
  return f < 0 ? '(' + s + ')' : s;
}
const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0);

/** Totals of an entry being edited, and whether it can be posted. */
export function moveTotals(lines: Pick<MoveLine, 'debit' | 'credit'>[]) {
  let debit = 0, credit = 0, valid = true, both = false, filled = 0;
  for (const l of lines) {
    let d = 0, c = 0;
    try { d = toFils(l.debit); c = toFils(l.credit); } catch { valid = false; continue; }
    if (d < 0 || c < 0) valid = false;
    if (d > 0 && c > 0) both = true;
    if (d || c) filled++;
    debit += d; credit += c;
  }
  return { debit, credit, difference: debit - credit, valid: valid && !both, both, balanced: valid && !both && debit === credit && filled >= 2 && debit > 0 };
}

/** The first day of the fiscal year holding a date, for a year ending on "MM-DD". */
export function fiscalYearStart(date: string, yearEnd = '12-31'): string {
  const [y] = date.split('-').map(Number), end = `${y}-${yearEnd}`;
  const startOf = (endDate: string) => { const d = new Date(endDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
  const previousEnd = `${y - 1}-${yearEnd}`;
  return date <= end ? startOf(previousEnd) : startOf(end);
}

export type StatementLine = { accountId: string; code: string; name: string; type: AccountType; amount: number };
export type StatementSection = { key: string; label: string; lines: StatementLine[]; total: number };
const group = (t: AccountType) => ACCOUNT_TYPES[t]?.group ?? 'off';
const lines = (rows: TrialRow[], pick: (r: TrialRow) => boolean, amount: (r: TrialRow) => number) =>
  rows.filter(pick).map(r => ({ accountId: r.accountId, code: r.code, name: r.name, type: r.type, amount: amount(r) })).filter(l => l.amount !== 0);
const section = (key: string, label: string, ls: StatementLine[]): StatementSection => ({ key, label, lines: ls, total: sum(ls, l => l.amount) });
const movement = (r: TrialRow) => toFils(r.debit) - toFils(r.credit);

/**
 * Profit and loss for a period, from a trial balance asked for that period (its debit and credit columns are the
 * period's movements). Income shows as positive, expenses as positive costs; the result is income less expenses.
 */
export function profitAndLoss(rows: TrialRow[]) {
  const income = section('income', 'الإيرادات التشغيلية', lines(rows, r => r.type === 'income', r => -movement(r)));
  const other = section('other_income', 'إيرادات أخرى', lines(rows, r => r.type === 'income_other', r => -movement(r)));
  const direct = section('direct', 'تكاليف مباشرة', lines(rows, r => r.type === 'expense_direct_cost', movement));
  const expenses = section('expenses', 'المصروفات التشغيلية', lines(rows, r => r.type === 'expense', movement));
  const depreciation = section('depreciation', 'الإهلاك', lines(rows, r => r.type === 'expense_depreciation', movement));
  const gross = income.total - direct.total, operating = gross - expenses.total - depreciation.total;
  return { sections: [income, direct, expenses, depreciation, other], gross, operating, net: operating + other.total };
}

/**
 * Balance sheet at the end of a trial balance asked from the start of the fiscal year: asset and liability balances,
 * equity with this year's result (income and expenses moved since the year start, plus anything kept in the
 * current-year earnings account) and earlier years' result not yet closed into equity.
 */
export function balanceSheet(rows: TrialRow[]) {
  const balance = (r: TrialRow) => toFils(r.balance);
  const assets = section('assets', GROUP_LABELS.asset, lines(rows, r => group(r.type) === 'asset', balance));
  const liabilities = section('liabilities', GROUP_LABELS.liability, lines(rows, r => group(r.type) === 'liability', r => -balance(r)));
  const pl = rows.filter(r => group(r.type) === 'income' || group(r.type) === 'expense');
  const currentYear = -sum(pl, movement), earlier = -sum(pl, r => toFils(r.opening));
  const equityLines = lines(rows, r => r.type === 'equity' || r.type === 'equity_unaffected', r => -balance(r));
  if (currentYear) equityLines.push({ accountId: '', code: '', name: 'نتيجة السنة الحالية', type: 'equity_unaffected', amount: currentYear });
  if (earlier) equityLines.push({ accountId: '', code: '', name: 'نتائج سنوات سابقة غير مقفلة', type: 'equity_unaffected', amount: earlier });
  const equity = section('equity', GROUP_LABELS.equity, equityLines);
  return { assets, liabilities, equity, totalLiabilitiesEquity: liabilities.total + equity.total, balanced: assets.total === liabilities.total + equity.total };
}

/** General ledger lines of one account with a running balance from the opening. */
export function runningLedger(rows: LedgerLine[], opening = 0) {
  let run = opening;
  return rows.map(r => { run += toFils(r.debit) - toFils(r.credit); return { ...r, running: run }; });
}

/** Lines that bring a draft into balance: the difference goes on a new line for the account chosen. */
export function balancingLine(lines: Pick<MoveLine, 'debit' | 'credit'>[], accountId: string, label = ''): MoveLine | null {
  const t = moveTotals(lines);
  if (!t.valid || t.difference === 0) return null;
  return { accountId, partnerId: '', caseId: '', label, debit: t.difference < 0 ? filsText(-t.difference) : '', credit: t.difference > 0 ? filsText(t.difference) : '', dateMaturity: null };
}

/** A free six-digit code in the type's range (1 assets … 5 expenses): after the last used one, else the first gap. */
export function nextAccountCode(accounts: Pick<Account, 'code'>[], type: AccountType): string {
  const base = { asset: 1, liability: 2, equity: 3, income: 4, expense: 5, off: 9 }[group(type)] * 100000;
  const used = new Set(accounts.map(a => a.code).filter(c => /^\d{6}$/.test(c)).map(Number));
  const mine = [...used].filter(n => n >= base && n < base + 100000);
  const after = mine.length ? Math.floor(Math.max(...mine) / 1000) * 1000 + 1000 : base + 1000;
  for (const start of [after, base + 1000]) for (let n = start; n < base + 100000; n += 1000) if (!used.has(n)) return String(n);
  for (let n = base + 1; n < base + 100000; n++) if (!used.has(n)) return String(n);
  return '';
}
