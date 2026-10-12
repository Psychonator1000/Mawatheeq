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
  /** The job the owner chose for the account. A label that preselects settings; it grants nothing by itself. */
  jobRole?: JobRole;
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

/** Job roles offered when adding staff. Picking one fills in the settings below it; the owner can still adjust them. */
export type JobRole = 'manager' | 'lawyer' | 'secretary' | 'collections' | 'accountant' | 'hr' | 'custom';
export const JOB_ROLES: { id: JobRole; label: string; hint: string; preset?: Omit<Permissions, 'revision' | 'jobRole'> }[] = [
  { id: 'manager', label: 'مدير — صلاحيات كاملة', hint: 'كل الصفحات وكل القضايا، مع التعديل والتصدير.',
    preset: { sections: Object.keys(SECTIONS) as Section[], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'lawyer', label: 'محامٍ', hint: 'يرى القضايا المسجلة باسمه، مع الجلسات والمهام.',
    preset: { sections: ['overview', 'cases', 'clients', 'deadlines', 'work', 'conflicts'], caseScope: 'selected', caseIds: [], canEdit: true, canExport: false } },
  { id: 'secretary', label: 'سكرتارية', hint: 'السكرتارية والمواعيد والمهام لكل القضايا، مع الطباعة.',
    preset: { sections: ['secretary', 'overview', 'cases', 'deadlines', 'work'], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'collections', label: 'تحصيل', hint: 'ملفات التحصيل وصحف الدعاوى لكل القضايا.',
    preset: { sections: ['collections'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false } },
  { id: 'accountant', label: 'محاسب', hint: 'المحاسبة والأتعاب والتقارير المالية.',
    preset: { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'hr', label: 'موارد بشرية', hint: 'ملفات الموظفين والإجازات والحضور، دون القضايا.',
    preset: { sections: ['hr'], caseScope: 'selected', caseIds: [], canEdit: true, canExport: false } },
  { id: 'custom', label: 'مخصص', hint: 'تختار الصفحات والقضايا والعمليات بنفسك.' },
];
export function jobRoleLabel(role?: JobRole) { return JOB_ROLES.find(r => r.id === role)?.label.split(' — ')[0] || ''; }
