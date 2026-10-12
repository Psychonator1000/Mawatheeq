export const SECTIONS = {
  overview: 'نظرة عامة', cases: 'سجل الأحكام', clients: 'الموكلون',
  deadlines: 'المواعيد والمتابعة', analytics: 'التحليل والإحصائيات',
  verification: 'التحقق من القضايا', work: 'المهام والجلسات',
  conflicts: 'فحص الأطراف', documents: 'المستندات والأدلة',
  secretary: 'السكرتارية', collections: 'التحصيل', accounting: 'المحاسبة', hr: 'الموارد البشرية',
} as const;
export type Section = keyof typeof SECTIONS;
export type Permissions = {
  sections: Section[]; caseScope: 'all' | 'selected'; caseIds: string[];
  /** With selected cases: every case whose lawyer field matches one of these names, now and later. */
  lawyerNames?: string[];
  canEdit: boolean; canExport: boolean; revision: number;
};
export const NO_ACCESS: Permissions = { sections: [], caseScope: 'selected', caseIds: [], canEdit: false, canExport: false, revision: 0 };
export const FULL_ACCESS: Permissions = { ...NO_ACCESS, sections: Object.keys(SECTIONS) as Section[], caseScope: 'all', canEdit: true, canExport: true };
export function canOpen(access: Permissions, section: string, owner = false) {
  return section === 'help' || (section === 'settings' ? owner : access.sections.includes(section as Section));
}
export const LEGAL_SECTIONS: Section[] = ['overview','cases','clients','deadlines','analytics','verification','work','conflicts','documents'];
export function canReadCases(access: Permissions) { return access.sections.some(s => LEGAL_SECTIONS.includes(s) && s !== 'documents'); }
export function canEditClients(access: Permissions) { return access.canEdit && access.caseScope === 'all' && access.sections.includes('clients'); }
export function canCreateCases(access: Permissions) { return access.canEdit && access.caseScope === 'all' && access.sections.includes('cases'); }
/** The workspaces (top-level pages) an account opens, in the order of the workspace chooser. */
export const WORKSPACE_LABELS = { legal: 'القضايا (الصفحة الرئيسية)', secretary: 'السكرتارية', collections: 'التحصيل', accounting: 'المحاسبة', hr: 'الموارد البشرية' } as const;
export function workspacesOf(access: Pick<Permissions, 'sections'>) {
  return (Object.keys(WORKSPACE_LABELS) as (keyof typeof WORKSPACE_LABELS)[]).filter(id => id === 'legal' ? access.sections.some(s => LEGAL_SECTIONS.includes(s)) : access.sections.includes(id as Section));
}
/** One-click page sets for new staff. Case scope and edit/export choices are kept as they are. */
export const PAGE_PRESETS: [string, Section[]][] = [
  ['بلا صفحات', []], ['السكرتارية فقط', ['secretary']], ['التحصيل فقط', ['collections']], ['المحاسبة فقط', ['accounting']],
  ['الموارد البشرية فقط', ['hr']], ['القضايا فقط', LEGAL_SECTIONS.filter(s => s !== 'documents')],
];
