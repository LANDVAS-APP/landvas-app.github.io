// Admin → Stars: a painting on its star, turning (the same globe players see in a star's preview). Loaded only when a
// moderator opens one, so the 3D library stays out of the rest of the portal.
import { useEffect, useState } from 'react';
import { StarGlobe } from '../../../src/stars/StarPreview';
import { starSkin, type UvRect } from '../../../src/stars/skin';
import type { StarCard } from '../../../src/stars/types';

export default function StarsArtGlobe({ star, m, cls, cells, img, rect }: { star: number; m: number; cls: string; cells: number; img: string; rect: UvRect | null }) {
  const [skin, setSkin] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let live = true;
    void starSkin(m, [], [{ owner: 'x', rev: 1, w: 0, h: 0, img, rect }], 2048).then((c) => { if (live) setSkin(c); });
    return () => { live = false; };
  }, [m, img, rect]);
  const card = { id: star, m, cls, cells, claimed: 0, art: [] } as unknown as StarCard;
  return <StarGlobe card={card} plots={[]} skin={skin} ball className="h-full w-full" />;
}
