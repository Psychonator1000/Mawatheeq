// Where the last record window was opened from (the clicked row or card), so the window can grow out of it.
let origin: { x: number; y: number } | null = null;
let pointer: { x: number; y: number; t: number } | null = null;
// Any press counts as the origin for a window that opens right after it, so every list gets the effect without wiring each button.
if (typeof addEventListener === 'function') addEventListener('pointerdown', e => { pointer = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
export const setCaseOrigin = (x: number, y: number) => { origin = { x, y }; };
export const takeCaseOrigin = () => {
  const o = origin ?? (pointer && Date.now() - pointer.t < 1500 ? pointer : null);
  origin = null; pointer = null;
  return o ? { x: o.x, y: o.y } : null;
};
