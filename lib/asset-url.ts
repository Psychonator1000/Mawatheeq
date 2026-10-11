/** Vite supplies the Pages prefix; scripts without it use the root. */
export function assetUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
