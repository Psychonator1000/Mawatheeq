/** Fixed choices and typing suggestions that keep office data consistent (no typos, one spelling per value). */

export const CLIENT_ROLES = ['مدعي', 'مدعى عليه', 'مستأنف', 'مستأنف ضده', 'طاعن', 'مطعون ضده', 'متظلم', 'متظلم ضده', 'طالب التنفيذ', 'منفذ ضده', 'شاكي', 'مجني عليه', 'متهم', 'مدعٍ بالحق المدني', 'متدخل', 'خصم مدخل'];
export const COURTS = ['المحكمة الكلية', 'المحكمة الجزئية', 'محكمة الاستئناف', 'محكمة التمييز', 'محكمة الأسرة', 'الدائرة الإدارية', 'محكمة الوزراء', 'إدارة التنفيذ', 'إدارة الخبراء'];
export const EXECUTION_STAGES = ['استلام الصيغة التنفيذية', 'إعلان الصيغة التنفيذية', 'فتح ملف التنفيذ', 'حجز', 'منع سفر', 'ضبط وإحضار', 'حبس', 'تحصيل', 'مخالصة', 'انتهاء التنفيذ'];
export const PERSON_ROLES = ['موظف', 'مندوب', 'وكيل', 'شريك', 'كفيل', 'مدير', 'زوج', 'زوجة', 'ابن', 'ابنة', 'أب', 'أم', 'أخ', 'أخت'];
export const CONTACT_ROLES = ['مدير', 'مسؤول قانوني', 'محاسب', 'مندوب', 'موظف', 'مالك', 'شريك', 'سكرتير'];
export const WORK_TITLES = ['حضور جلسة', 'تقديم مذكرة', 'مراجعة إدارة التنفيذ', 'استلام صيغة تنفيذية', 'إعلان', 'مراجعة إدارة الخبراء', 'تقديم صحيفة دعوى', 'متابعة مع الموكل', 'سداد رسوم'];
export const JOB_TITLES = ['محامٍ', 'محامٍ متدرب', 'مستشار قانوني', 'سكرتير', 'مندوب', 'محاسب', 'مدير مكتب', 'موظف استقبال', 'موظف تحصيل', 'موارد بشرية'];
export const HR_DEPARTMENTS = ['القضايا', 'التنفيذ', 'التحصيل', 'المحاسبة', 'الموارد البشرية', 'السكرتارية', 'الإدارة'];
export const LEAVE_TYPES = ['سنوية', 'مرضية', 'طارئة', 'بدون راتب', 'أمومة', 'حج', 'وفاة'];
export const NATIONALITIES = ['كويتي', 'سعودي', 'بحريني', 'قطري', 'إماراتي', 'عماني', 'مصري', 'سوري', 'لبناني', 'أردني', 'فلسطيني', 'عراقي', 'يمني', 'سوداني', 'هندي', 'باكستاني', 'بنغلاديشي', 'سريلانكي', 'فلبيني', 'نيبالي', 'إيراني', 'غير محدد الجنسية'];
export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
export const HOLIDAYS = ['رأس السنة الميلادية', 'الإسراء والمعراج', 'العيد الوطني', 'عيد التحرير', 'عيد الفطر', 'وقفة عرفة', 'عيد الأضحى', 'رأس السنة الهجرية', 'المولد النبوي'];

const squash = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
/** Values already used in the data, most frequent first, merged after a base list, without duplicates or blanks. */
export function suggestions<T>(rows: T[], get: (row: T) => unknown, base: string[] = [], limit = 300): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) { const v = squash(get(r)); if (v && v.length <= 120) counts.set(v, (counts.get(v) || 0) + 1); }
  const used = [...counts].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  return [...new Set([...base, ...used])].slice(0, limit);
}
/** The weekday of a date-only ISO value, without timezone shifts. */
export function weekdayOf(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
