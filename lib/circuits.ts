// A court circuit written as «النوع / رقم الدائرة · قاعة N · الدور N», e.g. «تجاري كلي / 5 · قاعة 30 · الدور 3».
// The circuit number and the hall are different things; each part is optional.
export type Circuit = { kind: string; number: string; room: string; floor: string };
export function splitCircuit(value: string): Circuit {
  let rest = value || '';
  const take = (word: string) => {
    const m = new RegExp(`(?:^|\\s*·\\s*)${word}\\s*([^·]*)$`).exec(rest);
    if (!m) return '';
    rest = rest.slice(0, m.index); return m[1].trim();
  };
  const floor = take('الدور'), room = take('قاعة');
  rest = rest.trim();
  const m = /^(.*?)\s*\/\s*([^/]+)$/.exec(rest);
  // A number on its own (no kind picked yet, or an older record) is the circuit number, not a kind.
  if (!m && /^[0-9٠-٩A-Za-z-]+$/.test(rest)) return { kind: '', number: rest, room, floor };
  return { kind: (m ? m[1] : rest).trim(), number: (m ? m[2] : '').trim(), room, floor };
}
export function joinCircuit(c: Partial<Circuit>): string {
  const part = (s?: string) => (s || '').trim();
  const main = [part(c.kind), part(c.number)].filter(Boolean).join(' / ');
  return [main, part(c.room) && 'قاعة ' + part(c.room), part(c.floor) && 'الدور ' + part(c.floor)].filter(Boolean).join(' · ');
}
