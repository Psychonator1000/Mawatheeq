import type { CaseRecord } from './domain';
export type ClientContact = { id: string; name: string; role: string; phone: string; notes: string; needsReview?: boolean };
export type ClientEntity = {
  id: string; name: string; kind: 'organization' | 'individual' | 'group' | 'unknown';
  sector: 'telecom' | 'insurance' | 'other'; contacts: ClientContact[]; aliases: string[];
  notes: string; needsReview: boolean; revision?: number;
  /** «بيانات الصحيفة»: what every claim for this client states about it, in place of the collection file's own. */
  claimDetails?: ClaimDetails;
};
export type ClaimDetails = { companyAddress?: string; email?: string; companyCivil?: string; companyRegister?: string };
export const CLAIM_DETAILS: [keyof ClaimDetails, string][] = [['companyAddress', 'الكائن مقرها في (العنوان)'], ['email', 'البريد الإلكتروني'], ['companyCivil', 'الرقم المدني للجهة'], ['companyRegister', 'رقم السجل التجاري']];
export const CLIENT_KINDS = { organization: 'شركة / جهة', individual: 'فرد', group: 'أطراف مشتركة / ورثة', unknown: 'تحتاج تحديد' };
export const CLIENT_SECTORS = { other: 'عام', insurance: 'تأمين', telecom: 'اتصالات' };
export function emptyClient(): ClientEntity {
  return { id: crypto.randomUUID(), name: '', kind: 'organization', sector: 'other', contacts: [], aliases: [], notes: '', needsReview: false, revision: 0 };
}
export function emptyContact(): ClientContact { return { id: crypto.randomUUID(), name: '', role: '', phone: '', notes: '' }; }
export function clientName(record: Pick<CaseRecord,'clientEntityName'|'clientGroup'|'client'>) { return record.clientEntityName || record.clientGroup || record.client; }
// Lookups by id, built once per client list (lists are replaced, not mutated), so enriching every case stays linear.
const clientIndex = new WeakMap<ClientEntity[], Map<string, ClientEntity>>();
function clientById(clients: ClientEntity[], id?: string) {
  let index = clientIndex.get(clients);
  if (!index) { index = new Map(clients.map(c => [c.id, c])); clientIndex.set(clients, index); }
  return id ? index.get(id) : undefined;
}
export function enrichCase(record: CaseRecord, clients: ClientEntity[]): CaseRecord {
  const entity = clientById(clients, record.clientEntityId);
  return { ...record, clientEntityName: entity?.name || '', clientSector: entity?.sector || 'other',
    clientContactName: entity?.contacts.find(p => p.id === record.clientContactId)?.name || '',
    clientNeedsReview: entity?.needsReview ?? true };
}
