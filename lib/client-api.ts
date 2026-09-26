import { DEFAULT_RULES } from './domain';

export const sharedBackend = process.env.NEXT_PUBLIC_DATA_BACKEND === 'supabase';

export async function requestData(path: string, init?: RequestInit): Promise<any> {
  if (sharedBackend) {
    const { sharedRequest } = await import('./shared-backend');
    return sharedRequest(path, init);
  }
  const response = await fetch(path, init);
  const data = await response.json() as any;
  if (!response.ok) throw new Error(data.error || 'تعذر الاتصال. يرجى المحاولة مرة أخرى.');
  return data;
}

export async function getDocumentUrl(id: string): Promise<string> {
  if (!sharedBackend) return '/api/files?id=' + encodeURIComponent(id);
  const { downloadDocument } = await import('./shared-backend');
  return URL.createObjectURL(await downloadDocument(id));
}

export async function getWordTemplate(kind: 'claim' | 'bundle'): Promise<string> {
  if (sharedBackend) return (await import('./data/templates.json')).default[kind];
  return (await requestData('/api/templates?kind=' + kind)).base64;
}

export { DEFAULT_RULES };
