'use client';
import { Scale, Gavel, ShieldCheck, RadioTower } from 'lucide-react';
import { inCaseCategory, type CaseRecord, type CaseCategory, type Rules } from '@/lib/domain';
export const CASE_CATEGORIES = [
  { id: '', label: 'كل القضايا', icon: Scale },
  { id: 'execution', label: 'التنفيذ', icon: Gavel },
  { id: 'insurance', label: 'التأمين', icon: ShieldCheck },
  { id: 'telecom', label: 'اتصالات', icon: RadioTower },
] as const;
export default function CaseCategories({ records, rules, value, onChange }: { records: CaseRecord[]; rules: Rules; value: string; onChange: (v: CaseCategory) => void }) {
  return <nav className="case-categories" aria-label="أقسام القضايا">{CASE_CATEGORIES.map(c => <button type="button" key={c.id} className={`case-category ${value === c.id ? 'active' : ''}`} aria-pressed={value === c.id} onClick={() => onChange(c.id)}><c.icon size={20}/><span>{c.label}</span><strong>{records.filter(r => inCaseCategory(r,c.id,rules)).length}</strong></button>)}</nav>;
}
