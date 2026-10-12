// Opening a record from anywhere in the app (chat references, for example): the request waits until the case
// workspace is showing and its records are loaded, then the workspace opens it.
export type OpenRef = { type: 'case' | 'client' | 'work'; id: string };
export const OPEN_EVENT = 'mawatheeq-open';
let pending: OpenRef | null = null;
export function requestOpen(ref: OpenRef) { pending = ref; window.dispatchEvent(new Event(OPEN_EVENT)); }
export const pendingOpen = () => pending;
export function takeOpen() { const r = pending; pending = null; return r; }
