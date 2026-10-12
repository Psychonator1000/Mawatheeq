// Where the last case was opened from (the clicked row), so the case window can grow out of it.
let origin: { x: number; y: number } | null = null;
export const setCaseOrigin = (x: number, y: number) => { origin = { x, y }; };
export const takeCaseOrigin = () => { const o = origin; origin = null; return o; };
