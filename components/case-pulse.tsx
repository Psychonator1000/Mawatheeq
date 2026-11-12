'use client';
import { useMemo } from 'react';
import { Scale, Gavel, ShieldCheck, RadioTower, Hourglass, ChartPie } from 'lucide-react';
import type { CaseRecord, CaseCategory, Rules } from '@/lib/domain';
import { casePulse } from '@/lib/case-line';
import { PulseStrip, PulseTile } from './pulse';

/**
 * The register's summary tiles: the cases by level, the results (each picks out its cases), the appeal deadlines, and
 * the execution, insurance and telecom sections, each split by what matters in it. The section tiles pick their section
 * as the old category buttons did.
 */
export default function CasePulse({ records, rules, category, onCategory, outcome, onOutcome, onDeadlines }: {
  records: CaseRecord[]; rules: Rules; category: string; onCategory: (v: CaseCategory) => void;
  outcome: string; onOutcome: (v: string) => void; onDeadlines: () => void;
}) {
  const p = useMemo(() => casePulse(records, rules), [records, rules]);
  const pick = (v: string) => () => onOutcome(outcome === v ? '' : v);
  return <PulseStrip label="ملخص القضايا">
    <PulseTile icon={<Scale size={16} aria-hidden/>} title="كل القضايا" value={p.all} on={category === ''} onClick={() => onCategory('')}
      parts={[{ label: 'أول درجة', value: p.levels[0], tone: 'brand' }, { label: 'استئناف', value: p.levels[1], tone: 'blue' }, { label: 'تمييز', value: p.levels[2], tone: 'amber' }]}/>
    <PulseTile icon={<ChartPie size={16} aria-hidden/>} title="النتائج"
      parts={[{ label: 'لصالحنا', value: p.outcome['لصالحنا'] || 0, tone: 'green', onClick: pick('لصالحنا'), on: outcome === 'لصالحنا' },
        { label: 'ضدنا', value: p.outcome['غير صالحنا'] || 0, tone: 'red', onClick: pick('غير صالحنا'), on: outcome === 'غير صالحنا' },
        { label: 'غير محدد', value: p.outcome['غير محدد'] || 0, tone: 'grey', onClick: pick('غير محدد'), on: outcome === 'غير محدد' }]}/>
    <PulseTile icon={<Hourglass size={16} aria-hidden/>} title="مواعيد الطعن" onClick={onDeadlines}
      parts={[{ label: 'خلال أسبوع', value: p.deadline.week, tone: 'red' }, { label: 'خلال شهر', value: p.deadline.month, tone: 'amber' }, { label: 'انتهت', value: p.deadline.ended, tone: 'grey' }, { label: 'بلا ميعاد', value: p.deadline.none, tone: 'green' }]}/>
    <PulseTile icon={<Gavel size={16} aria-hidden/>} title="التنفيذ" value={p.execution.total} on={category === 'execution'} onClick={() => onCategory('execution')}
      parts={[{ label: 'تنفيذ قائم', value: p.execution.running, tone: 'green' }, { label: 'جاهز', value: p.execution.ready, tone: 'amber' }, { label: 'بياناته ناقصة', value: p.execution.missing, tone: 'red' }, { label: 'أخرى', value: p.execution.other, tone: 'grey' }]}/>
    <PulseTile icon={<ShieldCheck size={16} aria-hidden/>} title="التأمين" value={p.insurance.total} on={category === 'insurance'} onClick={() => onCategory('insurance')}
      parts={[{ label: 'لصالحنا', value: p.insurance.favour, tone: 'green' }, { label: 'ضدنا', value: p.insurance.against, tone: 'red' }, { label: 'غير محدد', value: p.insurance.open, tone: 'grey' }]}/>
    <PulseTile icon={<RadioTower size={16} aria-hidden/>} title="اتصالات" value={p.telecom.total} on={category === 'telecom'} onClick={() => onCategory('telecom')}
      parts={[{ label: 'لصالحنا', value: p.telecom.favour, tone: 'green' }, { label: 'ضدنا', value: p.telecom.against, tone: 'red' }, { label: 'غير محدد', value: p.telecom.open, tone: 'grey' }]}/>
  </PulseStrip>;
}
