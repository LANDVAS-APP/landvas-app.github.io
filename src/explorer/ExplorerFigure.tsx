// A player's explorer as a standalone figure (visit room, customiser, profiles).
import { useMemo } from 'react';
import type { ExplorerStyle } from '../backend/types';
import { cn } from '../lib/utils';
import { auraColor, explorerSvg, styleOf } from './character';

export function ExplorerFigure({ style, accent, size = 92, walking, className, label }: {
  style?: ExplorerStyle | null; accent: string; size?: number; walking?: boolean; className?: string; label?: string;
}) {
  const s = styleOf(style);
  const key = `${s.hat}|${s.hold}|${s.outfit}|${s.trail}|${s.aura}`;
  const svg = useMemo(() => explorerSvg(s, accent, size), [key, accent, size]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      className={cn('lv-figure', `aura-${s.aura}`, `trail-${s.trail}`, walking && 'walking', className)}
      style={{ ['--c' as string]: auraColor(s, accent), width: size, height: Math.round((size * 68) / 46) }}
      role="img"
      aria-label={label ?? 'Explorer'}
    >
      <div className="lv-figure-aura" aria-hidden />
      {s.trail !== 'none' && <div className="lv-trail" aria-hidden>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>}
      <div className="lv-figure-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
