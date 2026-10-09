import type { CaseRecord } from './domain';
export type ClientContact = { id: string; name: string; role: string; phone: string; notes: string; needsReview?: boolean };
export type ClientEntity = {
  id: string; name: string; kind: 'organization' | 'individual' | 'group' | 'unknown';
  sector: 'telecom' | 'insurance' | 'other'; contacts: ClientContact[]; aliases: string[];
  notes: string; needsReview: boolean; revision?: number;
};
export const CLIENT_KINDS = { organization: 'شركة / جهة', individual: 'فرد', group: 'أطراف مشتركة / ورثة', unknown: 'تحتاج تحديد' };
export const CLIENT_SECTORS = { other: 'عام', insurance: 'تأمين', telecom: 'اتصالات' };
export function emptyClient(): ClientEntity {
  return { id: crypto.randomUUID(), name: '', kind: 'organization', sector: 'other', contacts: [], aliases: [], notes: '', needsReview: false, revision: 0 };
}
export function emptyContact(): ClientContact { return { id: crypto.randomUUID(), name: '', role: '', phone: '', notes: '' }; }
export function clientName(record: Pick<CaseRecord,'clientEntityName'|'clientGroup'|'client'>) { return record.clientEntityName || record.clientGroup || record.client; }
export function enrichCase(record: CaseRecord, clients: ClientEntity[]): CaseRecord {
  const entity = clients.find(c => c.id === record.clientEntityId);
  return { ...record, clientEntityName: entity?.name || '', clientSector: entity?.sector || 'other',
    clientContactName: entity?.contacts.find(p => p.id === record.clientContactId)?.name || '',
    clientNeedsReview: entity?.needsReview ?? true };
}
