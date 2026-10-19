import { useEffect, useState } from 'react';
import { booksRequest } from './local-auth';

let available: Promise<boolean> | null = null;
/** The books appear once their migration is applied and for people with the accounting section; otherwise screens keep the simple ledger. */
export function booksAvailable(): Promise<boolean> {
  available ??= booksRequest('setup').then(() => true, (e: { code?: string }) => { if (e?.code !== 'PGRST202' && e?.code !== '42883' && e?.code !== '42501') available = null; return false; });
  return available;
}
export function useBooksAvailable() { const [ok, setOk] = useState<boolean | null>(null); useEffect(() => { let live = true; void booksAvailable().then(v => { if (live) setOk(v); }); return () => { live = false; }; }, []); return ok; }
