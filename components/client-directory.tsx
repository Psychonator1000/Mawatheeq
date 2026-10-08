'use client';
import { useMemo, useState } from 'react';
import { Building2, Users, Plus, Search, Save, Trash2, ArrowUpLeft, Merge, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { CLIENT_KINDS, CLIENT_SECTORS, emptyClient, emptyContact, type ClientEntity } from '@/lib/clients';
import type { CaseRecord } from '@/lib/domain';
import { formatDate } from '@/lib/domain';
import { normalizeSearch } from '@/lib/case-browse';
import { clampPage } from '@/lib/pagination';
import { Field, Empty, api } from './shared';
import PageNavigation from './page-navigation';

type EditorProps = {
  entity: ClientEntity; clients: ClientEntity[]; records?: CaseRecord[]; canMerge?: boolean; readOnly?: boolean;
  onClose: () => void; onSaved: (client: ClientEntity) => void; onMerged?: () => Promise<void>;
  onOpenCase?: (record: CaseRecord) => void; onShowCases?: (id: string) => void; onAddCase?: (id: string) => void;
};
export function ClientEditor({ entity, clients, records = [], canMerge, readOnly=false, onClose, onSaved, onMerged, onOpenCase, onShowCases, onAddCase }: EditorProps) {
  const [draft, setDraft] = useState(entity), [busy, setBusy] = useState(false), [targetId, setTargetId] = useState('');
  const [casePage, setCasePage] = useState(1);
  const linked = records.filter(c => c.clientEntityId === draft.id), target = clients.find(c => c.id === targetId);
  const dirty = JSON.stringify(draft) !== JSON.stringify(entity);
  const duplicate = clients.find(c => c.id !== draft.id && normalizeSearch(c.name) === normalizeSearch(draft.name));
  const set = <K extends keyof ClientEntity>(key: K, value: ClientEntity[K]) => setDraft(c => ({ ...c, [key]: value }));
  const pages = Math.max(1, Math.ceil(linked.length / 10)), page = clampPage(casePage, pages);
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
  return <Sheet open onOpenChange={v => !v && !busy && onClose()}><SheetContent side="left" className="detail-sheet client-sheet" dir="rtl">
    <SheetHeader className="sheet-header"><div className="eyebrow">CLIENT PROFILE</div><SheetTitle>{entity.revision ? entity.name : 'إضافة موكل'}</SheetTitle>
      <SheetDescription>الموكل هو الجهة أو الشخص صاحب الملف. سجّل ممثليه وموظفيه هنا، وحدد الشخص المعني داخل كل قضية.</SheetDescription></SheetHeader>
    <fieldset className="readonly-fields" disabled={readOnly}><div className="form-grid"><Field label="اسم الموكل / الجهة" value={draft.name} onChange={v => set('name', v)} wide/>
      <label className="field"><span>نوع الموكل</span><select value={draft.kind} onChange={e => set('kind', e.target.value as ClientEntity['kind'])}>{Object.entries(CLIENT_KINDS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <label className="field"><span>القطاع</span><select value={draft.sector} onChange={e => set('sector', e.target.value as ClientEntity['sector'])}>{Object.entries(CLIENT_SECTORS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <Field label="ملاحظات عن الموكل" value={draft.notes} onChange={v => set('notes', v)} wide multiline/>
      <label className="checkbox-line wide"><input type="checkbox" checked={draft.needsReview} onChange={e => set('needsReview', e.target.checked)}/> هوية الجهة أو بياناتها تحتاج مراجعة</label>
    </div>
    {duplicate && <div className="notice">يوجد ملف آخر بهذا الاسم: {duplicate.name}. راجع الملف الموجود قبل إنشاء جهة جديدة؛ تشابه الأسماء وحده لا يثبت أنها الجهة نفسها.</div>}
    <div className="client-section-heading"><h3>الأشخاص المرتبطون بالموكل</h3><button type="button" className="btn" onClick={() => set('contacts', [...draft.contacts, emptyContact()])}><Plus size={16}/> إضافة شخص</button></div>
    <p className="subtitle">أضف موظف الشركة الذي يطلب الدعوى أو يتابعها، أو الممثل القانوني، مع صفته. يمكن للشخص نفسه تمثيل أكثر من جهة في ملفات منفصلة.</p>
    {!draft.contacts.length && <p className="client-empty">لم يُسجل شخص مرتبط بعد. لا يُفترض اسم الموظف أو صفته من اسم الشركة.</p>}
    {draft.contacts.map((person, index) => {
      const patch = (key: string, value: string | boolean) => set('contacts', draft.contacts.map(p => p.id === person.id ? { ...p, [key]: value } : p));
      const used = records.some(c => c.clientEntityId === draft.id && c.clientContactId === person.id);
      return <section className="client-contact" key={person.id}><div className="client-section-heading"><b>الشخص {index + 1}</b><button type="button" className="icon-btn" aria-label={`إزالة ${person.name || 'الشخص'}`} title={used ? 'مرتبط بقضية؛ غيّر ارتباطها أولاً' : 'إزالة الشخص'} disabled={used} onClick={() => set('contacts', draft.contacts.filter(p => p.id !== person.id))}><Trash2 size={16}/></button></div>
        <div className="form-grid"><Field label="اسم الشخص" value={person.name} onChange={v => patch('name', v)}/><Field label="صفته / دوره لدى الموكل" value={person.role} onChange={v => patch('role', v)} placeholder="موظف متابعة، مفوض، ممثل قانوني…"/>
          <Field label="رقم التواصل (اختياري)" value={person.phone || ''} onChange={v => patch('phone', v)}/><Field label="ملاحظات الشخص" value={person.notes || ''} onChange={v => patch('notes', v)}/>
          <label className="checkbox-line wide"><input type="checkbox" checked={Boolean(person.needsReview)} onChange={e => patch('needsReview', e.target.checked)}/> بيانات الشخص تحتاج مراجعة</label></div>
      </section>;
    })}
    {draft.aliases.length > 0 && <details className="client-aliases"><summary>الأسماء والصيغ السابقة المحفوظة ({draft.aliases.length})</summary><ul>{draft.aliases.map(name => <li key={name}>{name}</li>)}</ul></details>}
    {!readOnly&&<div className="detail-actions"><button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin"/> : <Save/>} حفظ ملف الموكل</button></div>}</fieldset>
    {Boolean(entity.revision) && <><div className="client-section-heading"><h3>قضايا الموكل ({linked.length})</h3><div className="actions">
      {onShowCases && <button className="text-link" onClick={() => { onClose(); onShowCases(entity.id); }}>عرض في سجل الأحكام <ArrowUpLeft size={16}/></button>}
      {onAddCase && <button className="btn" onClick={() => { onClose(); onAddCase(entity.id); }}><Plus size={16}/> إضافة قضية</button>}
    </div></div>
      <div className="client-linked-cases">{linked.slice((page - 1) * 10, page * 10).map(c => <button className="client-case-row" key={c.id} onClick={() => { onClose(); onOpenCase?.(c); }} disabled={!onOpenCase}>
        <b>{c.code || 'بدون كود'}</b><span>{c.opponent || 'خصم غير مسجل'}<small>{c.clientContactName && `المتابع: ${c.clientContactName} · `}{c.casePerson && `الشخص المعني: ${c.casePerson} · `}{formatDate(c.date)}{c.archived ? ' · مؤرشف' : ''}</small></span><ArrowUpLeft size={16}/>
      </button>)}</div>
      {linked.length > 10 && <PageNavigation page={page} pages={pages} total={linked.length} onChange={setCasePage}/>}
    </>}
    {canMerge && entity.revision && <details className="client-merge"><summary><Merge size={16}/> دمج ملف مكرر مع موكل آخر</summary>
      <p className="subtitle">استخدم الدمج فقط بعد التأكد من أن الملفين يمثلان الجهة نفسها. تُنقل القضايا والأشخاص والصيغ السابقة، وتبقى بيانات القضايا الأصلية محفوظة.</p>
      <label className="field"><span>الملف الذي سيبقى</span><select value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">اختر الموكل</option>{clients.filter(c => c.id !== entity.id).sort((a,b)=>a.name.localeCompare(b.name,'ar')).map(c => <option value={c.id} key={c.id}>{c.name} · {c.id.slice(0,8)}</option>)}</select></label>
      {dirty && <p className="subtitle">احفظ تعديلات الملف ثم افتحه مجدداً قبل الدمج.</p>}
      {target && <AlertDialog><AlertDialogTrigger asChild><button className="btn" disabled={busy || dirty}>مراجعة الدمج</button></AlertDialogTrigger><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>دمج ملفَي الموكل؟</AlertDialogTitle>
        <AlertDialogDescription>سيُدمج «{entity.name}» داخل «{target.name}». ستُنقل {linked.length} قضية وجميع الأشخاص والصيغ السابقة. يظل اسم الملف الهدف وقطاعه هما المعتمدين.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={merge}>تأكيد أنهما الجهة نفسها والدمج</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    </details>}
  </SheetContent></Sheet>;
}

export function ClientSelect({ clients, value, onChange, onCreate }: { clients: ClientEntity[]; value: string; onChange: (id: string) => void; onCreate?: () => void }) {
  const [search, setSearch] = useState('');
  const options = clients.filter(c => c.id === value || normalizeSearch([c.name, ...c.aliases].join(' ')).includes(normalizeSearch(search))).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  return <div className="field wide client-selector"><div className="client-section-heading"><span>الموكل / الجهة</span>{onCreate&&<button type="button" className="text-link" onClick={onCreate}><Plus size={14}/> موكل جديد</button>}</div>
    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن ملف الموكل الموجود أولاً" aria-label="بحث عن موكل"/>
    <select value={value} onChange={e => onChange(e.target.value)} aria-label="الموكل / الجهة"><option value="">اختر الموكل</option>{options.map(c => <option key={c.id} value={c.id}>{c.name}{c.needsReview ? ' · يحتاج مراجعة' : ''}{clients.some(x => x.id !== c.id && x.name === c.name) ? ` · ${c.id.slice(0,8)}` : ''}</option>)}</select>
  </div>;
}

export default function ClientDirectory({ clients, records, canMerge, readOnly=false, onSaved, onReload, onShowCases, onAddCase, onOpenCase }: {
  clients: ClientEntity[]; records: CaseRecord[]; canMerge: boolean; readOnly?: boolean; onSaved: (c: ClientEntity) => void;
  onReload: () => Promise<void>; onShowCases: (id: string) => void; onAddCase?: (id: string) => void; onOpenCase: (c: CaseRecord) => void;
}) {
  const [search, setSearch] = useState(''), [reviewOnly, setReviewOnly] = useState(false), [page, setPage] = useState(1), [selected, setSelected] = useState<ClientEntity | null>(null);
  const counts = useMemo(() => { const map = new Map<string, number>(); for (const c of records) if (!c.archived && c.clientEntityId) map.set(c.clientEntityId, (map.get(c.clientEntityId) || 0) + 1); return map; }, [records]);
  const filtered = clients.filter(c => (!reviewOnly || c.needsReview || c.contacts.some(p => p.needsReview)) && normalizeSearch([c.name, ...c.aliases, ...c.contacts.map(p=>p.name)].join(' ')).includes(normalizeSearch(search))).sort((a,b)=>(counts.get(b.id)||0)-(counts.get(a.id)||0)||a.name.localeCompare(b.name,'ar'));
  const pages = Math.max(1, Math.ceil(filtered.length / 18)), current = clampPage(page, pages);
  return <><div className="page-head"><div><div className="eyebrow">MAWATHEEQ / CLIENTS</div><h1>الموكلون</h1><p className="subtitle">ملف مستقل لكل جهة أو فرد، يجمع الأشخاص المرتبطين به وقضاياه.</p></div>{!readOnly&&<button className="btn primary" onClick={()=>setSelected(emptyClient())}><Plus/> إضافة موكل</button>}</div>
    <section className="panel"><div className="toolbar"><div className="searchbox"><Search/><input aria-label="بحث في الموكلين والأشخاص" placeholder="ابحث باسم الجهة أو أحد الأشخاص…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div>
      <label className="checkbox-line"><input type="checkbox" checked={reviewOnly} onChange={e=>{setReviewOnly(e.target.checked);setPage(1);}}/> يحتاج مراجعة ({clients.filter(c=>c.needsReview||c.contacts.some(p=>p.needsReview)).length})</label></div>
      <div className="client-grid">{filtered.slice((current-1)*18,current*18).map(c=><button className="client-card" key={c.id} onClick={()=>setSelected(c)}><div className="client-card-top"><Building2 size={22}/><span className="tag">{counts.get(c.id)||0} قضية</span></div><h3>{c.name}</h3><p>{CLIENT_KINDS[c.kind]} · {CLIENT_SECTORS[c.sector]}</p><div className="client-card-people"><Users size={15}/>{c.contacts.length ? `${c.contacts.length} شخص مرتبط` : 'الأشخاص غير مسجلين'}</div>{(c.needsReview||c.contacts.some(p=>p.needsReview))&&<span className="tag amber">يحتاج مراجعة</span>}</button>)}</div>
      {!filtered.length&&<Empty/>}<PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/></section>
    {selected&&<ClientEditor readOnly={readOnly} key={selected.id} entity={selected} clients={clients} records={records} canMerge={canMerge} onClose={()=>setSelected(null)} onSaved={onSaved} onMerged={onReload} onOpenCase={onOpenCase} onShowCases={onShowCases} onAddCase={onAddCase}/>}
  </>;
}
