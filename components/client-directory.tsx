'use client';
import { useMemo, useState } from 'react';
import { Building2, Users, Plus, Search, Save, Trash2, ArrowUpLeft, Merge, LoaderCircle, Phone, MessageCircle, Printer, CheckCheck } from 'lucide-react';
import { clientRollCards, clientRollHtml } from '@/lib/client-roll';
import { printHtml } from '@/lib/print';
import { phoneLinks } from '@/lib/contact-links';
import { toast } from 'sonner';
import RecordWindow, { useListNav, type WindowNav, type Enter } from './record-window';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { CLAIM_DETAILS, CLIENT_KINDS, CLIENT_SECTORS, emptyClient, emptyContact, type ClientEntity } from '@/lib/clients';
import { DEFAULT_RULES, type CaseRecord, type Rules } from '@/lib/domain';
import { clientLine, clientStats } from '@/lib/client-line';
import { Meter, PulseStrip, PulseTile, StackBar } from './pulse';
import { formatDate,caseCode} from '@/lib/domain';
import { normalizeSearch } from '@/lib/case-browse';
import { clampPage } from '@/lib/pagination';
import { Field, Empty, api } from './shared';
import { CONTACT_ROLES, suggestions } from '@/lib/choices';
import PageNavigation from './page-navigation';
import EntityCollections from './departments/entity-collections';
import {FilterBox,SelectList} from './filter-select';
import {arCompare} from '@/lib/domain';
import ClientReview from './client-review';

type EditorProps = {
  entity: ClientEntity; clients: ClientEntity[]; records?: CaseRecord[]; canMerge?: boolean; readOnly?: boolean;
  onClose: () => void; onSaved: (client: ClientEntity) => void; onMerged?: () => Promise<void>;
  onOpenCase?: (record: CaseRecord) => void; onShowCases?: (id: string) => void; onAddCase?: (id: string) => void;
  nav?: WindowNav; onNavigate?: (dir: 'prev' | 'next') => void; enter?: Enter; canCollections?: boolean;
};
export function ClientEditor({ entity, clients, records = [], canMerge, canCollections=false, readOnly=false, onClose, onSaved, onMerged, onOpenCase, onShowCases, onAddCase, nav, onNavigate, enter }: EditorProps) {
  const contactRoles = useMemo(() => suggestions(clients.flatMap(c => c.contacts), p => p.role, CONTACT_ROLES, 100), [clients]);
  const [draft, setDraft] = useState(entity), [busy, setBusy] = useState(false), [targetId, setTargetId] = useState('');
  const [casePage, setCasePage] = useState(1), [rollOpenOnly, setRollOpenOnly] = useState(true), [mergeOpen, setMergeOpen] = useState(false);
  const linked = records.filter(c => c.clientEntityId === draft.id), target = clients.find(c => c.id === targetId);
  const dirty = JSON.stringify(draft) !== JSON.stringify(entity);
  const duplicate = clients.find(c => c.id !== draft.id && normalizeSearch(c.name) === normalizeSearch(draft.name));
  const set = <K extends keyof ClientEntity>(key: K, value: ClientEntity[K]) => setDraft(c => ({ ...c, [key]: value }));
  const pages = Math.max(1, Math.ceil(linked.length / 10)), page = clampPage(casePage, pages);
  const active = linked.filter(c => !c.archived), latest = linked.reduce((d, c) => c.date && c.date > d ? c.date : d, '');
  const lead = draft.contacts.find(p => p.name.trim());
  async function save() {
    if(readOnly)return;
    if (!draft.name.trim()) { toast.error('أدخل اسم الجهة أو الشخص صاحب الملف'); return; }
    setBusy(true);
    try {
      const result = await api('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: { ...draft, name: draft.name.trim() } }) });
      setDraft(result.client); onSaved(result.client); toast.success('تم حفظ ملف الموكل والأشخاص المرتبطين به'); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function merge() {
    if (!target || !canMerge || dirty) return;
    setBusy(true);
    try {
      const result = await api('/api/clients/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId: entity.id, sourceRevision: entity.revision, targetId, targetRevision: target.revision }) });
      await onMerged?.(); toast.success(`تم الدمج ونقل ${result.moved} سجل مع الاحتفاظ بالتفاصيل الأصلية`); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const addPerson = () => { set('contacts', [...draft.contacts, emptyContact()]); setTimeout(() => document.querySelector<HTMLElement>('.client-contact:last-of-type input')?.focus(), 50); };
  return <RecordWindow eyebrow="ملف موكل" title={draft.name.trim() || (entity.revision ? entity.name : 'موكل جديد')} subtitle={`${CLIENT_KINDS[draft.kind]} · ${CLIENT_SECTORS[draft.sector]}`}
    badges={<><span className="tag">{active.length} قضية نشطة</span>{(draft.needsReview || draft.contacts.some(p => p.needsReview)) && <span className="tag amber">يحتاج مراجعة</span>}</>}
    facts={entity.revision ? [['القضايا النشطة', active.length], ['المؤرشفة', linked.length - active.length], ['لصالحنا', active.filter(c => c.outcome === 'لصالحنا').length], ['آخر حكم', latest ? formatDate(latest) : ''], ['الأشخاص', draft.contacts.length || ''], ['المتابع', lead ? lead.name + (lead.role ? ' · ' + lead.role : '') : '']] : undefined}
    pin={lead?.phone ? <ContactActions name={lead.name} phone={lead.phone}/> : undefined}
    quick={<>{!readOnly && <button type="button" className="btn" onClick={addPerson}><Plus size={16}/> إضافة شخص</button>}{Boolean(entity.revision) && onAddCase && <button type="button" className="btn" onClick={() => { onClose(); onAddCase(entity.id); }}><Plus size={16}/> إضافة قضية</button>}{Boolean(entity.revision) && onShowCases && <button type="button" className="btn" onClick={() => { onClose(); onShowCases(entity.id); }}><ArrowUpLeft size={16}/> عرض في سجل الأحكام</button>}{canMerge && Boolean(entity.revision) && <button type="button" className="btn" onClick={() => setMergeOpen(true)}><Merge size={16}/> دمج ملف مكرر</button>}</>}
    nav={nav} onNavigate={onNavigate} unit="الموكل" enter={enter} dirty={dirty && !readOnly} busy={busy} onSave={readOnly ? undefined : () => void save()} onClose={onClose}
    footer={!readOnly ? <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin"/> : <Save/>} حفظ ملف الموكل</button> : undefined}>
    <fieldset className="readonly-fields" disabled={readOnly}><div className="form-grid"><Field label="اسم الموكل / الجهة" value={draft.name} onChange={v => set('name', v)} wide/>
      <label className="field"><span>نوع الموكل</span><SelectList aria-label="نوع الموكل" value={draft.kind} onChange={e => set('kind', e.target.value as ClientEntity['kind'])}>{Object.entries(CLIENT_KINDS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</SelectList></label>
      <label className="field"><span>القطاع</span><SelectList aria-label="القطاع" value={draft.sector} onChange={e => set('sector', e.target.value as ClientEntity['sector'])}>{Object.entries(CLIENT_SECTORS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</SelectList></label>
      <Field label="ملاحظات عن الموكل" value={draft.notes} onChange={v => set('notes', v)} wide multiline/>
      <label className="checkbox-line wide"><input type="checkbox" checked={draft.needsReview} onChange={e => set('needsReview', e.target.checked)}/> هوية الجهة أو بياناتها تحتاج مراجعة</label>
    </div>
    {draft.kind !== 'individual' && <><div className="client-section-heading"><h3>بيانات الصحيفة</h3></div>
    <p className="subtitle">تُكتب كما هي في كل صحيفة دعوى لهذا الموكل (من ملفات التحصيل)، بدلاً مما في ملف التحصيل. الحقل الفارغ يُترك لما في الملف.</p>
    <div className="form-grid">{CLAIM_DETAILS.map(([k, label]) => <Field key={k} label={label} value={draft.claimDetails?.[k] || ''} wide={k === 'companyAddress'}
      onChange={v => set('claimDetails', { ...(draft.claimDetails || {}), [k]: v })}/>)}</div></>}
    {duplicate && <div className="notice">يوجد ملف آخر بهذا الاسم: {duplicate.name}. راجع الملف الموجود قبل إنشاء جهة جديدة؛ تشابه الأسماء وحده لا يثبت أنها الجهة نفسها.</div>}
    <div className="client-section-heading"><h3>الأشخاص المرتبطون بالموكل</h3><button type="button" className="btn" onClick={addPerson}><Plus size={16}/> إضافة شخص</button></div>
    <p className="subtitle">أضف موظف الشركة الذي يطلب الدعوى أو يتابعها، أو الممثل القانوني، مع صفته. يمكن للشخص نفسه تمثيل أكثر من جهة في ملفات منفصلة.</p>
    {!draft.contacts.length && <p className="client-empty">لم يُسجل شخص مرتبط بعد. لا يُفترض اسم الموظف أو صفته من اسم الشركة.</p>}
    {draft.contacts.map((person, index) => {
      const patch = (key: string, value: string | boolean) => set('contacts', draft.contacts.map(p => p.id === person.id ? { ...p, [key]: value } : p));
      const used = records.some(c => c.clientEntityId === draft.id && c.clientContactId === person.id);
      return <section className="client-contact" key={person.id}><div className="client-section-heading"><b>الشخص {index + 1}</b><button type="button" className="icon-btn" aria-label={`إزالة ${person.name || 'الشخص'}`} title={used ? 'مرتبط بقضية؛ غيّر ارتباطها أولاً' : 'إزالة الشخص'} disabled={used} onClick={() => set('contacts', draft.contacts.filter(p => p.id !== person.id))}><Trash2 size={16}/></button></div>
        <div className="form-grid"><Field label="اسم الشخص" value={person.name} onChange={v => patch('name', v)}/><Field label="صفته / دوره لدى الموكل" suggestions={contactRoles} value={person.role} onChange={v => patch('role', v)} placeholder="موظف متابعة، مفوض، ممثل قانوني…"/>
          <Field type="tel" label="رقم التواصل (اختياري)" value={person.phone || ''} onChange={v => patch('phone', v)}/><ContactActions name={person.name} phone={person.phone || ''}/><Field label="ملاحظات الشخص" value={person.notes || ''} onChange={v => patch('notes', v)}/>
          <label className="checkbox-line wide"><input type="checkbox" checked={Boolean(person.needsReview)} onChange={e => patch('needsReview', e.target.checked)}/> بيانات الشخص تحتاج مراجعة</label></div>
      </section>;
    })}
    {draft.aliases.length > 0 && <details className="client-aliases"><summary>الأسماء والصيغ السابقة المحفوظة ({draft.aliases.length})</summary><ul>{draft.aliases.map(name => <li key={name}>{name}</li>)}</ul></details>}</fieldset>
    {Boolean(entity.revision) && <><div className="client-section-heading"><h3>قضايا الموكل ({linked.length})</h3>
      {linked.length > 0 && <div className="client-roll-print"><label className="checkbox-line"><input type="checkbox" checked={rollOpenOnly} onChange={e => setRollOpenOnly(e.target.checked)}/> المفتوحة فقط</label>
        <button type="button" className="btn" onClick={() => { const html = clientRollHtml(draft.name, linked, rollOpenOnly); if (!clientRollCards(linked, rollOpenOnly).length) { toast.info('لا توجد قضايا مفتوحة لهذا الموكل.'); return; } if (!printHtml(html)) toast.error('اسمح بالنوافذ المنبثقة في المتصفح لطباعة الرول.'); }}><Printer size={15}/> طباعة رول قضايا الموكل</button></div>}</div>
      <div className="client-linked-cases">{linked.slice((page - 1) * 10, page * 10).map(c => <button className="client-case-row" key={c.id} onClick={() => { onClose(); onOpenCase?.(c); }} disabled={!onOpenCase}>
        <b>{caseCode(c) || 'بدون كود'}</b><span>{c.opponent || 'خصم غير مسجل'}<small>{c.clientContactName && `المتابع: ${c.clientContactName} · `}{c.casePerson && `الشخص المعني: ${c.casePerson} · `}{formatDate(c.date)}{c.archived ? ' · مؤرشف' : ''}</small></span><ArrowUpLeft size={16}/>
      </button>)}</div>
      {linked.length > 10 && <PageNavigation page={page} pages={pages} total={linked.length} onChange={setCasePage}/>}
      {canCollections && <EntityCollections entityId={entity.id}/>}
    </>}
    {canMerge && Boolean(entity.revision) && <Dialog open={mergeOpen} onOpenChange={setMergeOpen}><DialogContent className="office-dialog client-merge" dir="rtl"><DialogHeader><DialogTitle>دمج ملف مكرر مع موكل آخر</DialogTitle>
      <DialogDescription>استخدم الدمج فقط بعد التأكد من أن الملفين يمثلان الجهة نفسها. تُنقل القضايا والأشخاص والصيغ السابقة، وتبقى بيانات القضايا الأصلية محفوظة.</DialogDescription></DialogHeader>
      <label className="field"><span>الملف الذي سيبقى</span><SelectList aria-label="الملف الذي سيبقى" value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">اختر الموكل</option>{clients.filter(c => c.id !== entity.id).sort((a,b)=>arCompare(a.name,b.name)).map(c => <option value={c.id} key={c.id}>{c.name} · {c.id.slice(0,8)}</option>)}</SelectList></label>
      {dirty && <p className="subtitle">احفظ تعديلات الملف ثم افتحه مجدداً قبل الدمج.</p>}
      {target && <AlertDialog><AlertDialogTrigger asChild><button className="btn" disabled={busy || dirty}>مراجعة الدمج</button></AlertDialogTrigger><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>دمج ملفَي الموكل؟</AlertDialogTitle>
        <AlertDialogDescription>سيُدمج «{entity.name}» داخل «{target.name}». ستُنقل {linked.length} قضية وجميع الأشخاص والصيغ السابقة. يظل اسم الملف الهدف وقطاعه هما المعتمدين.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={merge}>تأكيد أنهما الجهة نفسها والدمج</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    </DialogContent></Dialog>}
  </RecordWindow>;
}

export function ClientSelect({ clients, value, onChange, onCreate, onManage, disabled = false }: { clients: ClientEntity[]; value: string; onChange: (id: string) => void; onCreate?: () => void; onManage?: () => void; disabled?: boolean }) {
  const options = useMemo(() => [...clients].sort((a,b)=>arCompare(a.name,b.name)).map(c => ({ value: c.id, label: c.name + (clients.some(x => x.id !== c.id && x.name === c.name) ? ` · ${c.id.slice(0,8)}` : ''),
    hint: c.needsReview ? 'يحتاج مراجعة' : undefined, terms: c.aliases.join(' ') })), [clients]);
  const current = clients.find(c => c.id === value);
  return <div className="field wide client-selector"><div className="client-select-head"><span>الموكل / الجهة</span>
    {current?.needsReview && <span className="tag amber" title="تبقى صيغة الموكل الأصلية محفوظة في السجل.">ملف يحتاج مراجعة</span>}
    <span className="client-select-links">{onManage && current && <button type="button" className="text-link" onClick={onManage}>إدارة الملف والأشخاص</button>}
    {onCreate && <button type="button" className="text-link" onClick={onCreate}><Plus size={14}/> موكل جديد</button>}</span></div>
    <FilterBox label="الموكل / الجهة" value={value} onChange={onChange} options={options} empty="اختر الموكل" placeholder="اكتب اسم الموكل للبحث" disabled={disabled}/>
  </div>;
}

/** Client lines per page. */
const PER_PAGE = 25;

export default function ClientDirectory({ clients, records, rules=DEFAULT_RULES, canMerge, canCollections=false, readOnly=false, onSaved, onReload, onShowCases, onAddCase, onOpenCase }: {
  clients: ClientEntity[]; records: CaseRecord[]; rules?: Rules; canMerge: boolean; canCollections?: boolean; readOnly?: boolean; onSaved: (c: ClientEntity) => void;
  onReload: () => Promise<void>; onShowCases: (id: string) => void; onAddCase?: (id: string) => void; onOpenCase: (c: CaseRecord) => void;
}) {
  const [search, setSearch] = useState(''), [reviewOnly, setReviewOnly] = useState(false), [reviewing, setReviewing] = useState(false), [page, setPage] = useState(1), [selected, setSelectedRaw] = useState<ClientEntity | null>(null);
  const counts = useMemo(() => { const map = new Map<string, number>(); for (const c of records) if (!c.archived && c.clientEntityId) map.set(c.clientEntityId, (map.get(c.clientEntityId) || 0) + 1); return map; }, [records]);
  const filtered = clients.filter(c => (!reviewOnly || c.needsReview || c.contacts.some(p => p.needsReview)) && normalizeSearch([c.name, ...c.aliases, ...c.contacts.map(p=>p.name)].join(' ')).includes(normalizeSearch(search))).sort((a,b)=>(counts.get(b.id)||0)-(counts.get(a.id)||0)||arCompare(a.name,b.name));
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE)), current = clampPage(page, pages);
  const stats = useMemo(() => clientStats(records, rules), [records, rules]), busiest = Math.max(1, ...[...stats.values()].map(t => t.cases));
  const { nav, step, enter, openItem: setSelected } = useListNav(filtered, selected, setSelectedRaw);
  return <><div className="list-desk"><div className="page-head"><div><div className="eyebrow">MAWATHEEQ / CLIENTS</div><h1>الموكلون</h1><p className="subtitle">ملف مستقل لكل جهة أو فرد، يجمع الأشخاص المرتبطين به وقضاياه.</p></div>{!readOnly&&<button className="btn primary" onClick={()=>setSelected(emptyClient())}><Plus/> إضافة موكل</button>}</div>
    <section className="panel list-desk-panel"><div className="toolbar"><div className="searchbox"><Search/><input aria-label="بحث في الموكلين والأشخاص" placeholder="ابحث باسم الجهة أو أحد الأشخاص…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div>
      <label className="checkbox-line"><input type="checkbox" checked={reviewOnly} onChange={e=>{setReviewOnly(e.target.checked);setPage(1);}}/> يحتاج مراجعة ({clients.filter(c=>c.needsReview||c.contacts.some(p=>p.needsReview)).length})</label>
      {!readOnly&&<button type="button" className={'btn'+(reviewing?' primary':'')} aria-pressed={reviewing} onClick={()=>setReviewing(r=>!r)}><CheckCheck size={15}/> {reviewing?'عرض القائمة':`مراجعة سريعة (${clients.filter(c=>c.needsReview).length})`}</button>}</div>
      {reviewing?<ClientReview clients={clients} counts={counts} canMerge={canMerge} onSaved={onSaved} onReload={onReload} onOpen={c=>setSelected(c)}/>:<>
      <ClientPulse clients={clients} stats={stats} reviewOnly={reviewOnly} onReviewOnly={v=>{setReviewOnly(v);setPage(1);}}/>
      {filtered.length>0&&<ul className="story-list client-lines" aria-label="الموكلون">
       <li className="story-head" aria-hidden><span>الموكل</span><span>النوع</span><span>القضايا</span><span>النتائج</span><span>في التنفيذ</span><span>باختصار</span></li>
       {filtered.slice((current-1)*PER_PAGE,current*PER_PAGE).map(c=>{const t=stats.get(c.id),l=clientLine(c,t);
        return <li key={c.id}><button type="button" className={'story-row client-card e-'+l.edge} onClick={()=>setSelected(c)} title={c.name+(l.story?' — '+l.story:'')}>
         <span className="story-name"><Building2 size={15} aria-hidden/><h3>{c.name}</h3></span>
         <span className="muted">{CLIENT_KINDS[c.kind]} · {CLIENT_SECTORS[c.sector]}</span>
         <Meter pct={(t?.cases||0)/busiest*100} tone="brand" label={t?.cases||0} title={`القضايا: ${t?.cases||0}`}/>
         {t?.cases?<StackBar parts={[{label:'لصالحنا',value:t.favour,tone:'green'},{label:'ضدنا',value:t.against,tone:'red'},{label:'غير محدد',value:t.open,tone:'grey'}]}/>:<span className="muted">—</span>}
         <span className="story-num">{t?.executing||t?.ready?<>{t.executing}{t.ready>0&&<small> (جاهز: {t.ready})</small>}</>:<span className="muted">—</span>}</span>
         <span className="line-story">{l.story}</span></button></li>;})}
      </ul>}
      {!filtered.length&&<Empty/>}<PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/></>}</section></div>
    {selected&&<ClientEditor nav={nav} onNavigate={step} enter={enter} readOnly={readOnly} key={selected.id} entity={selected} clients={clients} records={records} canMerge={canMerge} canCollections={canCollections} onClose={()=>setSelected(null)} onSaved={onSaved} onMerged={onReload} onOpenCase={onOpenCase} onShowCases={onShowCases} onAddCase={onAddCase}/>}
  </>;
}

/** Call and WhatsApp shortcuts for a stored contact number; hidden until the number is usable. */
export function ContactActions({ name, phone }: { name: string; phone: string }) {
  const links = phoneLinks(phone);
  if (!links) return phone.trim() ? <p className="contact-actions muted">تحقق من الرقم لإظهار أزرار الاتصال.</p> : null;
  return <div className="contact-actions"><a className="btn" href={links.tel} aria-label={`اتصال بـ ${name || 'الشخص'}`}><Phone size={15}/> اتصال</a><a className="btn" href={links.whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`واتساب ${name || 'الشخص'}`}><MessageCircle size={15}/> واتساب</a><span className="mono muted" dir="ltr">{links.phone}</span></div>;
}

/** The page's summary tiles: the clients by kind, the cases by sector, the files still to review, the busiest five. */
function ClientPulse({ clients, stats, reviewOnly, onReviewOnly }: { clients: ClientEntity[]; stats: Map<string, ReturnType<typeof clientStats> extends Map<string, infer T> ? T : never>; reviewOnly: boolean; onReviewOnly: (v: boolean) => void }) {
  const kinds = { organization: 0, individual: 0, group: 0, unknown: 0 } as Record<ClientEntity['kind'], number>, sectors = { telecom: 0, insurance: 0, other: 0 } as Record<ClientEntity['sector'], number>;
  let review = 0, total = 0;
  for (const c of clients) { kinds[c.kind]++; const n = stats.get(c.id)?.cases || 0; sectors[c.sector] += n; total += n; if (c.needsReview || c.contacts.some(p => p.needsReview)) review++; }
  const top = [...clients].map(c => [c, stats.get(c.id)?.cases || 0] as const).sort((a, b) => b[1] - a[1]).slice(0, 4).filter(([, n]) => n > 0);
  const topSum = top.reduce((n, [, v]) => n + v, 0), tones = ['brand', 'blue', 'amber', 'green'] as const;
  return <PulseStrip label="ملخص الموكلين">
    <PulseTile icon={<Building2 size={16} aria-hidden/>} title="الموكلون" value={clients.length} parts={[{ label: 'جهات', value: kinds.organization, tone: 'brand' }, { label: 'أفراد', value: kinds.individual, tone: 'blue' }, { label: 'ورثة / مشتركة', value: kinds.group, tone: 'amber' }, { label: 'تحتاج تحديد', value: kinds.unknown, tone: 'grey' }]}/>
    <PulseTile title="القضايا حسب القطاع" value={total} parts={[{ label: 'اتصالات', value: sectors.telecom, tone: 'brand' }, { label: 'تأمين', value: sectors.insurance, tone: 'blue' }, { label: 'عام', value: sectors.other, tone: 'grey' }]}/>
    <PulseTile icon={<CheckCheck size={16} aria-hidden/>} title="ملفات تحتاج مراجعة" value={review} sub={'من ' + clients.length} on={reviewOnly} onClick={() => onReviewOnly(!reviewOnly)} parts={[{ label: 'تحتاج مراجعة', value: review, tone: 'amber' }, { label: 'رُوجعت', value: clients.length - review, tone: 'green' }]}/>
    <PulseTile icon={<Users size={16} aria-hidden/>} title="الأكثر قضايا" value={total ? Math.round(topSum / total * 100) + '%' : '—'} sub="من كل القضايا" parts={[...top.map(([c, n], i) => ({ label: c.name.length > 18 ? c.name.slice(0, 17) + '…' : c.name, value: n, tone: tones[i] })), { label: 'الباقي', value: total - topSum, tone: 'grey' as const }]}/>
  </PulseStrip>;
}
