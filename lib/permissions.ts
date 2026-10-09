export const SECTIONS = {
  overview: 'نظرة عامة', cases: 'سجل الأحكام', clients: 'الموكلون',
  deadlines: 'المواعيد والمتابعة', analytics: 'التحليل والإحصائيات',
  verification: 'التحقق من القضايا', work: 'المهام والجلسات',
  conflicts: 'فحص الأطراف', documents: 'إعداد المستندات',
  secretary: 'السكرتارية', collections: 'التحصيل', accounting: 'المحاسبة', hr: 'الموارد البشرية',
} as const;
export type Section = keyof typeof SECTIONS;
export type Permissions = {
  sections: Section[]; caseScope: 'all' | 'selected'; caseIds: string[];
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
