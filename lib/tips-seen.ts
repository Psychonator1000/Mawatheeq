// Whether the tips were seen since they last changed (the account menu's dot), apart from the tips themselves, which
// load only when opened.
/** Bump when adding tips so the account menu shows its dot again. */
export const TIPS_VERSION = '2026-10-12i';
const KEY = 'mawatheeq.tips.seen';
export const tipsUnseen = () => { try { return localStorage.getItem(KEY) !== TIPS_VERSION; } catch { return false; } };
export const markTipsSeen = () => { try { localStorage.setItem(KEY, TIPS_VERSION); } catch { /* Still shown next time. */ } };
