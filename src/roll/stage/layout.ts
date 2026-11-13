// Where everything sits on the roll's stage, for the phone it's rolled on and for a 9:16 clip. The card is the anchor:
// the reels sit just above it, the details (live) or the caption (clip) below.
export type Layout = {
  mode: 'live' | 'clip';
  W: number; H: number;
  /** the card: centre and width */
  cx: number; cy: number; u: number;
  /** scale against the design size (a 310 px card) */
  s: number;
  cardTop: number;
  /** the reels' window (its centre line) */
  ry: number;
  /** where the details / caption start */
  panelTop: number;
};

export function layoutFor(W: number, H: number, o: { mode?: 'live' | 'clip'; safeTop?: number; multi?: boolean } = {}): Layout {
  const mode = o.mode ?? 'live';
  if (mode === 'clip') {
    const u = Math.round(W * 0.56), s = u / 310;
    const cardTop = Math.round(H * 0.315) + (o.multi ? 24 : 0);
    return { mode, W, H, u, s, cx: W / 2, cy: cardTop + u / 2, cardTop, ry: cardTop - 66 * s, panelTop: cardTop + u + 34 * s };
  }
  const u = Math.round(Math.min(W * 0.72, 310, Math.max(200, (H - 300) * 0.6)));
  const s = u / 310;
  const zone = 150 * s + (o.multi ? 66 : 0);
  const total = zone + u + 28 + 250;
  const top = Math.max((o.safeTop ?? 0) + 6, (H - total) / 2);
  const cardTop = Math.round(top + zone);
  return { mode, W, H, u, s, cx: W / 2, cy: cardTop + u / 2, cardTop, ry: cardTop - 66 * s, panelTop: cardTop + u + 26 };
}
