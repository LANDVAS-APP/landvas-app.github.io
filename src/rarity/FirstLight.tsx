// 🌅 First Light: when a First Light Primordial stands within 5 km of your land, its holder's drawing greets you here.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import { powerPath } from './powers';
import './rarity.css';

export function FirstLightCard() {
  const q = useQuery({ queryKey: ['first-light'], queryFn: api.firstLight, staleTime: 10 * 60_000, enabled: !!getBackend().session() });
  const f = q.data;
  const img = useQuery({ queryKey: ['first-light-img', f?.art_path], queryFn: () => getBackend().publicAssetUrl(f!.art_path), enabled: !!f?.art_path, staleTime: Infinity });
  const src = img.data;
  if (!f || !f.art_path || !src) return null;
  return (
    <Link to={powerPath(f.gx, f.gy)} className="lvrx-prim-card mb-4 flex items-center gap-3 rounded-3xl p-3" style={{ ['--c' as string]: '#F59E0B', ['--g' as string]: '#FFFBEB' }} data-testid="first-light">
      <img src={src} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" loading="lazy" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FDE68A]">🌅 First Light</div>
        <b className="block truncate text-white">{f.name || (f.mine ? 'Your drawing' : `@${f.owner_name}’s drawing`)}</b>
        <span className="text-xs text-white/60">{f.mine ? 'greets every player with land within 5 km' : 'greets the land around you'}</span>
      </div>
    </Link>
  );
}
