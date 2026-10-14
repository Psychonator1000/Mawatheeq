// A court circuit written as «النوع / الرقم · الدور N», e.g. «تجاري كلي / 5 · الدور 3». Each part is optional.
export type Circuit = { kind: string; number: string; floor: string };
export function splitCircuit(value: string): Circuit {
  const floor = /(?:^|\s*·\s*)الدور\s*(.*)$/.exec(value || '');
  const rest = (floor ? value.slice(0, floor.index) : value || '').trim();
  const m = /^(.*?)\s*\/\s*([^/]+)$/.exec(rest);
  // A number on its own (no kind picked yet, or an older record) is the circuit number, not a kind.
  if (!m && /^[0-9\u0660-\u0669A-Za-z-]+$/.test(rest)) return { kind: '', number: rest, floor: floor ? floor[1].trim() : '' };
  return { kind: (m ? m[1] : rest).trim(), number: (m ? m[2] : '').trim(), floor: floor ? floor[1].trim() : '' };
}
export function joinCircuit(c: Circuit): string {
  const main = [c.kind, c.number].map(s => s.trim()).filter(Boolean).join(' / ');
  return [main, c.floor.trim() && 'الدور ' + c.floor.trim()].filter(Boolean).join(' · ');
}
