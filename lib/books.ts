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
export type MoveLine = { id?: string; accountId: string; partnerId: string; caseId: string; label: string; debit: string; credit: string; dateMaturity: string | null; analyticId?: string; taxIds?: string[]; amountCurrency?: string };
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
export const PARTNER_KINDS: Record<PartnerKind, string> = { customer: 'موكل', vendor: 'مورد', both: 'موكل ومورد', other: 'آخر' };

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

// Invoicing: invoices, bills, credit notes and payments.
export type DocKind = 'out_invoice' | 'out_refund' | 'in_invoice' | 'in_refund' | 'customer_payment' | 'vendor_payment';
export type PaymentState = 'n/a' | 'not_paid' | 'partial' | 'paid' | 'reversed';
export type PaymentTermLine = { kind: 'balance' | 'percent'; percent?: number; days: number };
export type PaymentTerm = { id: string; name: string; lines: PaymentTermLine[]; note: string; active: boolean; revision: number };
export type Product = { id: string; name: string; incomeAccount: string; expenseAccount: string; salePrice: string; purchasePrice: string; description: string; active: boolean; revision: number };
export type Invoicing = { receivableAccount: string; payableAccount: string; invoiceNote: string; revision: number };
export type DocStats = { draft: number; open: number; openAmount: string; late: number; lateAmount: string };
export type InvoicingSetup = { paymentTerms: PaymentTerm[]; products: Product[]; invoicing: Invoicing; documentStats: Record<string, DocStats>; partnerBalances: Record<string, { receivable: string; payable: string }> };
export type DocLine = MoveLine & { id?: string; kind: 'line' | 'product' | 'term' | 'payment'; productId: string; quantity: string; priceUnit: string; discount: string; residual?: string; reconciled?: boolean };
export type Match = { partialId: string; amount: string; moveId: string; name: string; date: string; moveType: string; paymentType: string };
export type Outstanding = { lineId: string; moveId: string; name: string; date: string; amount: string };
export type Doc = Omit<Move, 'lines'> & { invoiceDateDue: string | null; paymentTermId: string; paymentType: '' | 'inbound' | 'outbound'; partnerType: '' | 'customer' | 'vendor';
  amountTotal: string; amountResidual: string; paymentState: PaymentState; lines: DocLine[]; matches: Match[]; outstanding: Outstanding[]; currency?: string; currencyRate?: string; amountTotalCurrency?: string } & PaymentDetails;
export type DocSummary = { id: string; journalId: string; name: string; moveType: string; paymentType: string; partnerType: string; state: MoveState; date: string; dueDate: string | null; ref: string;
  partnerId: string; caseId: string; amountTotal: string; amountResidual: string; paymentState: PaymentState; reversedFrom: string; revision: number };

export const DOC_KINDS: Record<DocKind, { label: string; one: string; side: 'customer' | 'vendor' }> = {
  out_invoice: { label: 'فواتير الموكلين', one: 'فاتورة موكل', side: 'customer' }, out_refund: { label: 'إشعارات دائنة للموكلين', one: 'إشعار دائن', side: 'customer' },
  in_invoice: { label: 'فواتير الموردين', one: 'فاتورة مورد', side: 'vendor' }, in_refund: { label: 'إشعارات الموردين', one: 'إشعار مورد', side: 'vendor' },
  customer_payment: { label: 'المقبوضات', one: 'سند قبض', side: 'customer' }, vendor_payment: { label: 'المدفوعات', one: 'سند صرف', side: 'vendor' },
};
export const PAYMENT_STATES: Record<PaymentState, string> = { 'n/a': '—', not_paid: 'غير مدفوعة', partial: 'مدفوعة جزئياً', paid: 'مدفوعة', reversed: 'معكوسة' };
export const PAYMENT_MATCH: Record<PaymentState, string> = { 'n/a': '—', not_paid: 'غير مطابقة', partial: 'رصيد غير مستخدم', paid: 'مطابقة', reversed: 'معكوسة' };
export const docKindOf = (d: Pick<DocSummary, 'moveType' | 'paymentType' | 'partnerType'>): DocKind | null =>
  d.paymentType ? (d.partnerType === 'vendor' ? 'vendor_payment' : 'customer_payment') : d.moveType in DOC_KINDS ? d.moveType as DocKind : null;

/** A service line's amount: quantity × price less its discount, rounded to the fils. */
export function lineSubtotal(quantity: string, price: string, discount: string): number {
  const q = toFils(quantity || '1'), p = toFils(price), d = Number(discount || 0);
  if (!(d >= 0 && d <= 100)) throw new Error('الخصم بين 0 و100٪.');
  return Math.round(q * p / 1000 * (1 - d / 100));
}
/** Due dates and amounts of a total split by a payment term (the last instalment takes what is left). */
export function termSchedule(total: number, lines: PaymentTermLine[] | null, date: string, dueDate = ''): { date: string; amount: number }[] {
  const plus = (days: number) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  if (!date) return [];
  if (!lines?.length) return [{ date: dueDate && dueDate > date ? dueDate : date, amount: total }];
  let rest = total;
  return lines.map((l, i) => {
    const amount = l.kind === 'percent' && i < lines.length - 1 ? Math.min(Math.round(total * (l.percent || 0) / 100), rest) : rest;
    rest -= amount;
    return { date: plus(l.days || 0), amount };
  }).filter(x => x.amount > 0);
}
/** Days past due, for the overdue tag (0 when not yet due or nothing is open). */
export function daysLate(due: string | null, today: string, residual: string): number {
  if (!due || toFils(residual) <= 0 || due >= today) return 0;
  return Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(due + 'T00:00:00Z')) / 864e5);
}

// Bank and cash.
export const PAYMENT_METHODS = { transfer: 'تحويل بنكي', cash: 'نقداً', cheque: 'شيك', knet: 'كي نت', card: 'بطاقة' } as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;
export const CHEQUE_STATES = { held: 'قيد التحصيل', deposited: 'مودع', cleared: 'صُرف', bounced: 'مرتجع' } as const;
export type BankStats = { booksBalance: string; statementBalance: string; lastStatementDate: string | null; toReconcile: number; chequesHeld: number };
export type BankLine = { id: string; date: string; label: string; ref: string; partnerName: string; partnerId: string; amount: string; reconciled: boolean; moveId: string; moveName: string };
export type Statement = { id: string; journalId: string; name: string; date: string; balanceStart: string; balanceEnd: string; note: string; sourceFile: string; revision: number; computedEnd: string; lines: BankLine[] };
export type StatementSummary = { id: string; journalId: string; name: string; date: string; balanceStart: string; balanceEnd: string; computedEnd: string; lines: number; open: number };
export type Suggestions = { items: { lineId: string; moveId: string; name: string; date: string; dueDate: string | null; partnerId: string; partner: string; residual: string; ref: string }[];
  payments: { moveId: string; name: string; date: string; partner: string; amount: string; method: string; chequeNumber: string }[] };
export type Cheque = { id: string; name: string; date: string; paymentType: string; partner: string; amount: string; chequeNumber: string; chequeDate: string | null; chequeBank: string; chequeState: string; journalId: string };
export type Batch = { id: string; name: string; journalId: string; type: 'inbound' | 'outbound'; date: string; method: string; total: string; payments: { id: string; name: string; state: string; partner: string; amount: string }[] };
export type PaymentDetails = { method?: PaymentMethod; chequeNumber?: string; chequeDate?: string | null; chequeBank?: string; chequeState?: string; batch?: string };

// Advanced: taxes, currencies, cost centres, schedules, recurring entries, follow-up and year-end.
export type Tax = { id: string; name: string; typeUse: 'sale' | 'purchase'; amountType: 'percent' | 'fixed'; amount: string; priceInclude: boolean; accountId: string; active: boolean; revision: number };
export type Currency = { code: string; name: string; active: boolean; rate: string; rateDate: string | null };
export type Analytic = { id: string; code: string; name: string; plan: string; active: boolean; revision: number };
export type AdvancedSetup = { advanced: true; taxesEnabled: boolean; taxes: Tax[]; currencies: Currency[]; analytic: Analytic[]; productTaxes: Record<string, { sale: string[]; purchase: string[] }>;
  due: { recurring: number; schedules: number; followups: number } };
export type ScheduleKind = 'asset' | 'deferred_revenue' | 'deferred_expense';
export type Schedule = { id: string; kind: ScheduleKind; name: string; journalId: string; debitAccount: string; creditAccount: string; assetAccount: string; value: string; salvage: string; months: number; firstDate: string;
  state: 'draft' | 'running' | 'closed'; partnerId: string; caseId: string; analyticId: string; ref: string; revision: number; posted: string; lines: { id: string; seq: number; date: string; amount: string; moveId: string; moveName: string }[] };
export const SCHEDULE_KINDS: Record<ScheduleKind, { label: string; one: string; debit: string; credit: string }> = {
  asset: { label: 'الأصول الثابتة', one: 'أصل', debit: '508000', credit: '151900' },
  deferred_revenue: { label: 'الإيرادات المؤجلة', one: 'إيراد مؤجل', debit: '212100', credit: '401000' },
  deferred_expense: { label: 'المصروفات المؤجلة', one: 'مصروف مؤجل', debit: '502000', credit: '132000' },
};
export type Recurring = { id: string; name: string; kind: 'entry' | 'out_invoice' | 'in_invoice'; template: Record<string, unknown>; interval: number; nextDate: string; endDate: string | null; autoPost: boolean; active: boolean; lastRun: string | null; revision: number };
export type FollowupLevel = { id: string; days: number; name: string; message: string; revision?: number };
export type FollowupPartner = { partnerId: string; name: string; phone: string; email: string; overdue: string; maxDays: number; level: FollowupLevel | null;
  last: { date: string; level: string; levelDays: number; note: string } | null; invoices: { moveId: string; name: string; date: string; due: string; days: number; amount: string }[] };
export type YearEnd = { yearEnd: string; from: string; drafts: number; statementLines: number; schedules: number; recurring: number; openReceivable: string; profit: string; lockDate: string | null; fiscalLockDate: string | null; closed?: boolean };

/** Taxes on one line as the server books them: those included in the price come out of it, the others are added. */
export function lineTaxes(subtotal: number, quantity: string, taxes: Pick<Tax, 'amountType' | 'amount' | 'priceInclude'>[]): { base: number; tax: number } {
  let base = subtotal;
  for (const t of taxes) if (t.priceInclude && t.amountType === 'percent') base = Math.round(base / (1 + Number(t.amount) / 100));
  const included = taxes.filter(t => t.priceInclude && t.amountType === 'percent').length;
  let tax = 0;
  for (const t of taxes) {
    const one = t.amountType === 'percent' ? Math.round(base * Number(t.amount) / 100) : Math.round(Number(t.amount) * 1000 * Number(quantity || 1));
    tax += t.priceInclude && t.amountType === 'percent' && included === 1 ? subtotal - base : one;
  }
  return { base, tax };
}
