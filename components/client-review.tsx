'use client';
import { useMemo, useState } from 'react';
import { Check, CheckCheck, FolderOpen, LoaderCircle, Merge } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { CLIENT_KINDS, CLIENT_SECTORS, type ClientEntity } from '@/lib/clients';
import { normalizeSearch } from '@/lib/case-browse';
import { clampPage } from '@/lib/pagination';
import { api, Empty } from './shared';
import PageNavigation from './page-navigation';
import { SelectList } from './filter-select';

const PER_PAGE = 20;
// A name without what does not tell two clients apart: the company words, brackets and the English name beside it.
const core = (name: string) => normalizeSearch(name).replace(/[()（）\-–_.,،"']/g, ' ').replace(/[a-z0-9]+/gi, ' ')
  .split(/\s+/).filter(w => w && !/^(ال)?(شركه|شركة|مؤسسه|مؤسسة|مكتب)$/.test(w)).join(' ');

/** The other client most likely to be the same one: the same name, or one name the other with words added (8+ letters). */
export function likelyDuplicate(c: ClientEntity, clients: ClientEntity[], counts: Map<string, number>) {
  const k = core(c.name); if (k.length < 4) return undefined;
  const same = clients.filter(o => o.id !== c.id && [o.name, ...o.aliases].some(n => { const ok = core(n); return ok === k || (Math.min(ok.length, k.length) >= 8 && (ok.startsWith(k + ' ') || k.startsWith(ok + ' '))); }));
  return same.sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0))[0];
}

/**
 * «مراجعة سريعة»: the client files still marked for review (most of them carried over from the old records), busiest
 * first. Each is confirmed in one click (its kind and sector set on the row), opened in full, or merged with the file
 * most likely to be the same client, the one with fewer cases going into the other.
 */
export default function ClientReview({ clients, counts, canMerge, onSaved, onReload, onOpen }: {
  clients: ClientEntity[]; counts: Map<string, number>; canMerge: boolean; onSaved: (c: ClientEntity) => void; onReload: () => Promise<void>; onOpen: (c: ClientEntity) => void;
}) {
  const queue = useMemo(() => clients.filter(c => c.needsReview).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.name.localeCompare(b.name, 'ar')), [clients, counts]);
  const [page, setPage] = useState(1), [edits, setEdits] = useState<Record<string, Partial<ClientEntity>>>({}), [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(''), [merging, setMerging] = useState<{ from: ClientEntity; into: ClientEntity } | null>(null);
  const pages = Math.max(1, Math.ceil(queue.length / PER_PAGE)), current = clampPage(page, pages), rows = queue.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const dupes = useMemo(() => new Map(rows.map(c => [c.id, likelyDuplicate(c, clients, counts)])), [rows, clients, counts]);
  const draft = (c: ClientEntity) => ({ ...c, ...edits[c.id] });
  const set = (id: string, v: Partial<ClientEntity>) => setEdits(e => ({ ...e, [id]: { ...e[id], ...v } }));
  async function confirm(list: ClientEntity[]) {
    setBusy(list.length > 1 ? 'all' : list[0].id); let done = 0;
    try {
      for (const c of list) {
        const r = await api('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: { ...draft(c), needsReview: false } }) });
        onSaved(r.client); done++;
      }
      setPicked(new Set());
      toast.success(done === 1 ? 'رُوجع ملف الموكل.' : `رُوجعت ملفات الموكلين: ${done}.`);
    } catch (e) { toast.error((e as Error).message + (done ? ` (رُوجع قبلها: ${done})` : '')); }
    finally { setBusy(''); }
  }
  async function merge() {
    if (!merging) return;
    const { from, into } = merging; setBusy(from.id);
    try {
      const r = await api('/api/clients/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId: from.id, sourceRevision: from.revision, targetId: into.id, targetRevision: into.revision }) });
      await onReload(); toast.success(`دُمج «${from.name}» في «${into.name}» ونُقل ${r.moved} سجل.`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(''); setMerging(null); }
  }
  const all = rows.length > 0 && rows.every(c => picked.has(c.id));
  if (!queue.length) return <Empty title="لا ملفات تحتاج مراجعة" text="كل ملفات الموكلين رُوجعت."/>;
  return <div className="client-review">
    <div className="client-review-bar" role="status"><b>تحتاج مراجعة: {queue.length}</b><span className="subtitle">الأكثر قضايا أولاً. «تأكيد» يحفظ النوع والقطاع ويرفع علامة المراجعة.</span>
      <button className="btn primary" disabled={!picked.size || !!busy} onClick={() => void confirm(queue.filter(c => picked.has(c.id)))}>{busy === 'all' ? <LoaderCircle className="spin" size={15}/> : <CheckCheck size={15}/>} تأكيد المحدد ({picked.size})</button></div>
    <div className="table-wrap"><table className="office-table client-review-table"><thead><tr>
      <th className="pick-col"><input type="checkbox" aria-label="تحديد كل ملفات الصفحة" checked={all} onChange={e => setPicked(p => { const n = new Set(p); for (const c of rows) if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })}/></th>
      <th>الموكل</th><th>القضايا</th><th>النوع</th><th>القطاع</th><th>مكرر محتمل</th><th aria-label="إجراءات"/></tr></thead>
      <tbody>{rows.map(c => { const d = draft(c), dup = dupes.get(c.id), mine = counts.get(c.id) || 0, theirs = dup ? counts.get(dup.id) || 0 : 0;
        return <tr key={c.id}>
          <td className="pick-col"><input type="checkbox" aria-label={'تحديد ' + c.name} checked={picked.has(c.id)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })}/></td>
          <td><b>{c.name}</b>{c.aliases.length > 1 && <small title={c.aliases.join(' · ')}>صيغ سابقة: {c.aliases.length}</small>}</td>
          <td className="mono">{mine}</td>
          <td><SelectList aria-label={'نوع ' + c.name} value={d.kind} onChange={e => set(c.id, { kind: e.target.value as ClientEntity['kind'] })}>{Object.entries(CLIENT_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectList></td>
          <td><SelectList aria-label={'قطاع ' + c.name} value={d.sector} onChange={e => set(c.id, { sector: e.target.value as ClientEntity['sector'] })}>{Object.entries(CLIENT_SECTORS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectList></td>
          <td>{dup ? <span className="client-dup"><span>{dup.name} <small>(القضايا: {theirs})</small></span>{canMerge && <button className="btn" disabled={!!busy} title="دمج الملف الأقل قضايا في الآخر"
            onClick={() => setMerging(mine > theirs ? { from: dup, into: c } : { from: c, into: dup })}><Merge size={14}/> دمج</button>}</span> : <span className="muted">—</span>}</td>
          <td className="client-review-acts"><button className="btn primary" disabled={!!busy} onClick={() => void confirm([c])}>{busy === c.id ? <LoaderCircle className="spin" size={14}/> : <Check size={14}/>} تأكيد</button>
            <button className="btn" onClick={() => onOpen(c)}><FolderOpen size={14}/> فتح</button></td></tr>; })}</tbody></table></div>
    <PageNavigation page={current} pages={pages} total={queue.length} onChange={setPage}/>
    <AlertDialog open={!!merging} onOpenChange={o => { if (!o && !busy) setMerging(null); }}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>دمج ملفَي الموكل؟</AlertDialogTitle>
      <AlertDialogDescription>{merging && <>سيُدمج «{merging.from.name}» (القضايا: {counts.get(merging.from.id) || 0}) داخل «{merging.into.name}» (القضايا: {counts.get(merging.into.id) || 0}). تُنقل القضايا وملفات التحصيل والأشخاص والصيغ السابقة، ويبقى اسم «{merging.into.name}» وقطاعه.</>}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={() => void merge()}>تأكيد أنهما الجهة نفسها والدمج</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
