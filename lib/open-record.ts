// Opening a record from anywhere in the app (chat references, for example): the request waits until the case
// workspace is showing and its records are loaded, then the workspace opens it.
export type OpenRef = { type: 'case' | 'client' | 'work'; id: string };
export const OPEN_EVENT = 'mawatheeq-open';
let pending: OpenRef | null = null;
export function requestOpen(ref: OpenRef) { pending = ref; window.dispatchEvent(new Event(OPEN_EVENT)); }
export const pendingOpen = () => pending;
export function takeOpen() { const r = pending; pending = null; return r; }
// Opening another workspace from a page (an empty list that says «set this up in «فريق المكتب»» offers a button).
export const OPEN_WORKSPACE_EVENT = 'mawatheeq-open-workspace';
export function openWorkspace(workspace: string) { window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT, { detail: { workspace } })); }
