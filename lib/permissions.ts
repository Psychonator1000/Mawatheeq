export const SECTIONS = {
  overview: 'نظرة عامة', cases: 'سجل الأحكام', clients: 'الموكلون',
  deadlines: 'المواعيد والمتابعة', analytics: 'التحليل والإحصائيات',
  verification: 'التحقق من القضايا', work: 'المهام والجلسات',
  conflicts: 'فحص الأطراف', documents: 'المستندات والأدلة',
  secretary: 'السكرتارية', collections: 'التحصيل', accounting: 'المحاسبة', hr: 'الموارد البشرية', archive: 'الأرشيف',
} as const;
export type Section = keyof typeof SECTIONS;
export type Permissions = {
  sections: Section[]; caseScope: 'all' | 'selected'; caseIds: string[];
  /** With selected cases: every case whose lawyer field matches one of these names, now and later. */
  lawyerNames?: string[];
  /** The account's main job (the first of jobRoles). A label that preselects settings; it grants nothing by itself. */
  jobRole?: JobRole;
  /** Every job the employee does, main one first. Labels only, like jobRole. */
  jobRoles?: JobRole[];
  /** Delegated admin powers. The original owner holds all of them; staff hold only those granted. */
  adminPowers?: AdminPower[];
  canEdit: boolean; canExport: boolean; revision: number;
};
export const NO_ACCESS: Permissions = { sections: [], caseScope: 'selected', caseIds: [], canEdit: false, canExport: false, revision: 0 };
export const FULL_ACCESS: Permissions = { ...NO_ACCESS, sections: Object.keys(SECTIONS) as Section[], caseScope: 'all', canEdit: true, canExport: true };
/** «settings» opens for the owner and for admins holding the staff, settings or backup power. */
export function canOpen(access: Permissions, section: string, admin = false) {
  return section === 'help' || (section === 'settings' ? admin : access.sections.includes(section as Section));
}
export type AdminPower = 'staff' | 'reviews' | 'settings' | 'backup' | 'chat';
export const ADMIN_POWERS: Record<AdminPower, { label: string; hint: string }> = {
  staff: { label: 'إدارة الموظفين والصلاحيات', hint: 'إضافة الحسابات وتعديل صلاحياتها وكلمات مرورها، والدخول بحساباتهم، ومنح صلاحيات الإدارة التي يملكها.' },
  reviews: { label: 'الاعتماد وتصحيح الدرجات', hint: 'اعتماد مراجعات المصادر، وتصحيح درجات التقاضي المغلقة أو التراجع عن النقل.' },
  settings: { label: 'إعدادات المكتب والاستيراد', hint: 'مدد المواعيد، واستيراد السجلات من Excel، ودمج ملفات الموكلين.' },
  backup: { label: 'النسخة الكاملة للبيانات', hint: 'تنزيل نسخة احتياطية كاملة لكل السجلات.' },
  chat: { label: 'مراجعة المحادثات والتعليقات', hint: 'قراءة كل محادثات الموظفين للمراجعة، وحذف التعليقات.' },
};
export const ALL_POWERS = Object.keys(ADMIN_POWERS) as AdminPower[];
export function powersOf(access: Pick<Permissions, 'adminPowers'>, owner = false): AdminPower[] { return owner ? ALL_POWERS : access.adminPowers || []; }
/** Admins who see the settings page of the cases workspace (office rules, import or backups). */
export function isAdmin(powers: AdminPower[]) { return powers.some(p => p === 'settings' || p === 'backup'); }
/** Admins who open the separate «فريق المكتب» page (accounts, roles and permissions). */
export function canManageStaff(powers: AdminPower[]) { return powers.includes('staff'); }
export const LEGAL_SECTIONS: Section[] = ['overview','cases','clients','deadlines','analytics','verification','work','conflicts','documents'];
export function canReadCases(access: Permissions) { return access.sections.some(s => LEGAL_SECTIONS.includes(s) && s !== 'documents'); }
export function canEditClients(access: Permissions) { return access.canEdit && access.caseScope === 'all' && access.sections.includes('clients'); }
export function canCreateCases(access: Permissions) { return access.canEdit && access.caseScope === 'all' && access.sections.includes('cases'); }
/** The workspaces (top-level pages) an account opens, in the order of the workspace chooser. */
export const WORKSPACE_LABELS = { legal: 'القضايا (الصفحة الرئيسية)', secretary: 'السكرتارية', collections: 'التحصيل', accounting: 'المحاسبة', hr: 'الموارد البشرية', archive: 'الأرشيف' } as const;
export function workspacesOf(access: Pick<Permissions, 'sections'>) {
  return (Object.keys(WORKSPACE_LABELS) as (keyof typeof WORKSPACE_LABELS)[]).filter(id => id === 'legal' ? access.sections.some(s => LEGAL_SECTIONS.includes(s)) : access.sections.includes(id as Section));
}
/** One-click page sets for new staff. Case scope and edit/export choices are kept as they are. */
export const PAGE_PRESETS: [string, Section[]][] = [
  ['بلا صفحات', []], ['السكرتارية فقط', ['secretary']], ['التحصيل فقط', ['collections']], ['المحاسبة فقط', ['accounting']],
  ['الموارد البشرية فقط', ['hr']], ['الأرشيف فقط', ['archive']], ['القضايا فقط', LEGAL_SECTIONS.filter(s => s !== 'documents')],
];

/** Job roles offered when adding staff. Picking one fills in the settings below it; the owner can still adjust them. */
export type JobRole = 'manager' | 'lawyer' | 'traineeLawyer' | 'counsel' | 'legalResearcher' | 'translator' | 'secretary' | 'receptionist' | 'sessionsClerk' | 'executionClerk'
  | 'collections' | 'callCenter' | 'accountant' | 'hr' | 'archivist' | 'dataEntry' | 'courier' | 'driver' | 'officeAdmin' | 'officeBoy'
  | 'developer' | 'networkEngineer' | 'itSupport' | 'engineer' | 'custom';
export const JOB_ROLES: { id: JobRole; label: string; hint: string; preset?: Omit<Permissions, 'revision' | 'jobRole'> }[] = [
  { id: 'manager', label: 'مدير — صلاحيات كاملة', hint: 'كل الصفحات وكل القضايا، مع التعديل والتصدير وكل صلاحيات الإدارة التي تملكها.',
    preset: { sections: Object.keys(SECTIONS) as Section[], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'lawyer', label: 'محامٍ', hint: 'يرى القضايا المسجلة باسمه، مع الجلسات والمهام.',
    preset: { sections: ['overview', 'cases', 'clients', 'deadlines', 'work', 'conflicts'], caseScope: 'selected', caseIds: [], canEdit: true, canExport: false } },
  { id: 'counsel', label: 'مستشار', hint: 'مستشار قانوني: كل القضايا والموكلين والتحليل والمستندات للدراسة والرأي، مع التعديل والتصدير.',
    preset: { sections: ['overview', 'cases', 'clients', 'deadlines', 'analytics', 'verification', 'work', 'conflicts', 'documents'], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'secretary', label: 'سكرتارية', hint: 'السكرتارية والمواعيد والمهام لكل القضايا، مع الطباعة.',
    preset: { sections: ['secretary', 'overview', 'cases', 'deadlines', 'work'], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'sessionsClerk', label: 'إداري جلسات', hint: 'الجلسات ومواعيدها وتوزيعها وطباعة رول الجلسات لكل القضايا.',
    preset: { sections: ['overview', 'cases', 'deadlines', 'work', 'secretary'], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'executionClerk', label: 'إداري تنفيذ', hint: 'متابعة التنفيذ والإعلانات والمواعيد والتحقق لكل القضايا.',
    preset: { sections: ['overview', 'cases', 'deadlines', 'verification', 'work'], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'collections', label: 'تحصيل', hint: 'ملفات التحصيل وصحف الدعاوى لكل القضايا.',
    preset: { sections: ['collections'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false } },
  { id: 'callCenter', label: 'كول سنتر', hint: 'اتصالات التحصيل وتسجيل الإفادات في ملفات التحصيل، دون تصدير.',
    preset: { sections: ['collections'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false } },
  { id: 'accountant', label: 'محاسب', hint: 'المحاسبة والأتعاب والتقارير المالية.',
    preset: { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'hr', label: 'موارد بشرية', hint: 'ملفات الموظفين والإجازات والحضور، دون القضايا.',
    preset: { sections: ['hr'], caseScope: 'selected', caseIds: [], canEdit: true, canExport: false } },
  { id: 'archivist', label: 'أرشيف', hint: 'الملفات الورقية: أماكن حفظها وتسليمها واستلامها وطلباتها وجردها، لكل القضايا.',
    preset: { sections: ['archive'], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'courier', label: 'خارجيات', hint: 'المهام الخارجية في المحاكم والجهات: الأجندة والمهام لكل القضايا، دون تصدير.',
    preset: { sections: ['secretary', 'work'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false } },
  { id: 'officeAdmin', label: 'موظف إداري', hint: 'الأعمال الإدارية العامة: الأجندة والمهام والأرشيف، مع الطباعة.',
    preset: { sections: ['secretary', 'work', 'archive'], caseScope: 'all', caseIds: [], canEdit: true, canExport: true } },
  { id: 'traineeLawyer', label: 'محامٍ متدرب', hint: 'يطّلع على القضايا التي يحددها له المسؤول للتعلم والمساعدة، دون تعديل أو تصدير.',
    preset: { sections: ['overview', 'cases', 'deadlines', 'work'], caseScope: 'selected', caseIds: [], canEdit: false, canExport: false } },
  { id: 'legalResearcher', label: 'باحث قانوني', hint: 'دراسة القضايا والأحكام والمستندات وإعداد المذكرات، قراءة مع الطباعة.',
    preset: { sections: ['overview', 'cases', 'clients', 'analytics', 'conflicts', 'documents'], caseScope: 'all', caseIds: [], canEdit: false, canExport: true } },
  { id: 'translator', label: 'مترجم', hint: 'ترجمة مستندات القضايا: يطّلع على القضايا والمستندات ويطبعها.',
    preset: { sections: ['cases', 'documents'], caseScope: 'all', caseIds: [], canEdit: false, canExport: true } },
  { id: 'receptionist', label: 'استقبال', hint: 'استقبال المراجعين والاتصالات وتسجيل المواعيد والمهام.',
    preset: { sections: ['secretary', 'work'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false } },
  { id: 'dataEntry', label: 'إدخال بيانات', hint: 'إدخال القضايا والموكلين وتحديث بياناتها، دون تصدير.',
    preset: { sections: ['overview', 'cases', 'clients'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false } },
  { id: 'driver', label: 'سائق', hint: 'توصيل الملفات والمراسلات: يرى المهام المسندة إليه فقط.',
    preset: { sections: ['work'], caseScope: 'selected', caseIds: [], canEdit: true, canExport: false } },
  { id: 'officeBoy', label: 'عامل خدمات (أوفيس بوي)', hint: 'خدمات المكتب. حساب للمحادثة والحضور فقط، دون صفحات أو قضايا.',
    preset: { sections: [], caseScope: 'selected', caseIds: [], canEdit: false, canExport: false } },
  { id: 'developer', label: 'مطوّر برمجيات', hint: 'تطوير النظام وصيانته. لا يفتح بيانات المكتب إلا بما تمنحه يدوياً من صفحات أو صلاحيات إدارة.',
    preset: { sections: [], caseScope: 'selected', caseIds: [], canEdit: false, canExport: false } },
  { id: 'networkEngineer', label: 'مهندس شبكات', hint: 'الشبكة والأجهزة وأجهزة البصمة. لا يفتح بيانات المكتب إلا بما تمنحه يدوياً.',
    preset: { sections: [], caseScope: 'selected', caseIds: [], canEdit: false, canExport: false } },
  { id: 'itSupport', label: 'دعم فني', hint: 'مساعدة الموظفين في الأجهزة والحسابات. لا يفتح بيانات المكتب إلا بما تمنحه يدوياً.',
    preset: { sections: [], caseScope: 'selected', caseIds: [], canEdit: false, canExport: false } },
  { id: 'engineer', label: 'مهندس', hint: 'الأعمال الهندسية والفنية للمكتب. لا يفتح بيانات المكتب إلا بما تمنحه يدوياً.',
    preset: { sections: [], caseScope: 'selected', caseIds: [], canEdit: false, canExport: false } },
  { id: 'custom', label: 'مخصص', hint: 'تختار الصفحات والقضايا والعمليات بنفسك.' },
];
export function jobRoleLabel(role?: JobRole) { return JOB_ROLES.find(r => r.id === role)?.label.split(' — ')[0] || ''; }
/** The employee's jobs, main one first (older accounts hold a single jobRole). */
export function rolesOf(p: Pick<Permissions, 'jobRole' | 'jobRoles'>): JobRole[] {
  return p.jobRoles?.length ? p.jobRoles : p.jobRole ? [p.jobRole] : [];
}
export const rolesLabel = (roles: JobRole[]) => roles.map(jobRoleLabel).filter(Boolean).join(' · ');
/**
 * The settings suggested for several jobs together: every page any of them uses, all cases when any of them works
 * on all cases, and editing or export when any of them needs it. A role without suggestions changes nothing.
 */
export function combinedPreset(roles: JobRole[]): Omit<Permissions, 'revision' | 'jobRole'> | undefined {
  const presets = roles.map(id => JOB_ROLES.find(r => r.id === id)?.preset).filter(Boolean) as NonNullable<(typeof JOB_ROLES)[number]['preset']>[];
  if (!presets.length) return undefined;
  const sections = (Object.keys(SECTIONS) as Section[]).filter(s => presets.some(p => p.sections.includes(s)));
  return { sections, caseScope: presets.some(p => p.caseScope === 'all') ? 'all' : 'selected', caseIds: [],
    canEdit: presets.some(p => p.canEdit), canExport: presets.some(p => p.canExport) };
}
