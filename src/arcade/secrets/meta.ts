// What a secret game wants remembered with its score (the level reached, the stage, whether a chart was cleared):
// the game writes it here as it plays and the cabinet sends it with the score. One game runs at a time.
export const ROUND_META: { v: Record<string, unknown> } = { v: {} };
export const setMeta = (m: Record<string, unknown>) => { ROUND_META.v = { ...ROUND_META.v, ...m }; };
export const takeMeta = () => { const m = ROUND_META.v; ROUND_META.v = {}; return m; };

/** The LANDVAS logo's plot colours, in the order of the L. */
export const LOGO = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF'];
export const LOGO_DEEP = ['#C81E45', '#D06A00', '#D9A900', '#14A36A', '#0B8AD1'];
