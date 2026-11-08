// A player's places on their profile: arcades, Inkborn sanctuaries, farms and businesses, each as a card in its
// own style (neon for arcades, a meadow with the actual residents for habitats, a field for farms, a skyline for
// businesses), edged in the colour of its rarest plot, with a button to go and visit.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import type { PlayerPlaces } from '../backend/types';
import { CreatureView } from '../inkborn/CreatureView';
import { cleanGenome } from '../inkborn/genome';
import { useOnboardedMe } from '../lib/queries';
import { fmt } from '../lib/utils';
import { RarityBadge } from '../plot/RarityBadge';
import { rarityInfo, type RarityId } from '../shared/rarity';
import { Button } from '../ui';
import { poll } from '../lib/poll';

const NEON: Record<string, string> = { pink: '#FF3D9A', cyan: '#22E3FF', lime: '#B6FF3D', violet: '#8B5CFF', sunset: '#FF7A3D', rainbow: '#FF3D6E' };

function Card({ rarity, bg, children, testid }: { rarity: string | null; bg: string; children: React.ReactNode; testid: string }) {
  const r = rarity ? rarityInfo(rarity) : null;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3 }}
      className="relative overflow-hidden rounded-3xl p-4 text-white shadow-xl" data-testid={testid}
      style={{ background: bg, boxShadow: r ? `0 0 0 2px ${r.color}, 0 8px 30px -8px ${r.color}` : undefined }}>
      {children}
      {rarity && <div className="absolute right-3 top-3 rounded-full bg-black/55 p-0.5 backdrop-blur"><RarityBadge r={rarity as RarityId} small /></div>}
    </motion.div>
  );
}
const Stat = ({ children }: { children: React.ReactNode }) => <span className="rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-bold backdrop-blur">{children}</span>;

export function ProfilePlaces({ username, isMe }: { username: string; isMe: boolean }) {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['places', username], queryFn: () => api.playerPlaces(username), refetchInterval: poll(30_000) });
  const d: PlayerPlaces | undefined = q.data;
  if (!d) return null;
  const n = d.arcades.length + d.habitats.length + d.farms.length + d.businesses.length;
  if (!n) return null;
  const go = (to: string) => nav(to);
  const can = !!me; // visiting needs a player account
  return (
    <section className="mt-5" data-testid="profile-places">
      <div className="mb-3 flex items-end justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{isMe ? 'Your places' : 'Places to visit'}</h2>
        <span className="text-xs text-muted">{[d.arcades.length && `${d.arcades.length} arcade${d.arcades.length > 1 ? 's' : ''}`, d.habitats.length && `${d.habitats.length} sanctuar${d.habitats.length > 1 ? 'ies' : 'y'}`, d.farms.length && `${d.farms.length} farm${d.farms.length > 1 ? 's' : ''}`, d.businesses.length && `${d.businesses.length} business${d.businesses.length > 1 ? 'es' : ''}`].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {d.arcades.map((a) => {
          const neon = NEON[a.neon] ?? NEON.pink;
          return (
            <Card key={a.id} rarity={a.rarity} testid="place-arcade" bg={`radial-gradient(120% 90% at 10% 0%, ${neon}44, transparent 60%), linear-gradient(160deg, #1A1238, #0A0618)`}>
              <div className="pr-20">
                <div className="lv-arc-marquee truncate text-lg" style={{ ['--glow' as string]: neon }}>{a.name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Stat>🕹️ Arcade · LV {a.level}</Stat>
                  <Stat>{a.machines} machines</Stat>
                  <Stat>{fmt(a.plays)} plays</Stat>
                  {a.plots > 1 && <Stat>{a.plots} plots</Stat>}
                </div>
              </div>
              <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
                {a.emojis.slice(0, 10).map((e, i) => (
                  <motion.span key={i} animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.6, delay: i * 0.12 }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `${neon}22`, boxShadow: `inset 0 0 0 1px ${neon}66` }}>{e}</motion.span>
                ))}
                {a.emojis.length > 10 && <span className="grid h-9 shrink-0 place-items-center px-1 text-xs font-bold text-white/70">+{a.emojis.length - 10}</span>}
              </div>
              <div className="mt-3 flex items-center gap-2">
                {a.playing > 0 && <span className="flex items-center gap-1.5 rounded-full bg-[#FF3D9A]/25 px-2 py-0.5 text-[11px] font-black"><span className="h-2 w-2 animate-pulse rounded-full bg-[#FF3D9A]" /> {a.playing} playing now</span>}
                {can && <Button size="sm" variant={a.playing > 0 ? 'rainbow' : 'secondary'} className="ml-auto" onClick={() => go(`/arcade/${a.id}`)} data-testid="place-arcade-join">{isMe ? 'Open' : a.playing > 0 ? '🕹️ Join arcade' : 'Visit arcade'}</Button>}
              </div>
            </Card>
          );
        })}
        {d.habitats.map((h) => (
          <Card key={h.id} rarity={h.rarity} testid="place-habitat" bg="linear-gradient(180deg, #8FD3FF 0%, #BDE8FF 28%, #6CC463 29%, #3E9A4C 100%)">
            <div className="pr-20">
              <div className="truncate font-display text-lg font-black drop-shadow">🌳 {h.name}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Stat>🐾 {h.residents} resident{h.residents === 1 ? '' : 's'}</Stat>
                {h.plots > 0 && <Stat>{h.plots} plot{h.plots === 1 ? '' : 's'}</Stat>}
              </div>
            </div>
            <div className="mt-2 flex min-h-[40px] items-end gap-1">
              {h.genomes.length ? h.genomes.map((g, i) => <CreatureView key={i} genome={cleanGenome(g as Parameters<typeof cleanGenome>[0])} size={64} state={i % 2 ? 'idle' : 'walk'} ground={false} />)
                : <span className="pb-3 text-sm font-bold text-white/85">No one lives here yet</span>}
            </div>
            {can && <div className="mt-1 flex justify-end"><Button size="sm" variant="secondary" onClick={() => go(`/habitat/${h.id}`)} data-testid="place-habitat-visit">{isMe ? 'Open' : 'Visit sanctuary'}</Button></div>}
          </Card>
        ))}
        {d.farms.map((f) => (
          <Card key={f.id} rarity={f.rarity} testid="place-farm" bg="linear-gradient(180deg, #FFE9A8 0%, #FFD27A 30%, #7CC95A 31%, #5A9E3E 100%)">
            <div className="pr-20">
              <div className="truncate font-display text-lg font-black text-[#3A2412]">🌾 {f.name}</div>
              <div className="mt-1 flex flex-wrap gap-1.5"><Stat>{fmt(f.harvests)} harvests</Stat><Stat>{f.plots} plot{f.plots === 1 ? '' : 's'}</Stat></div>
            </div>
            <div className="mt-3 grid grid-cols-8 gap-1">
              {Array.from({ length: 16 }, (_, i) => <span key={i} className="grid h-7 place-items-center rounded-md bg-[#7A4B2A] text-sm">{['🥕', '🌽', '🍅', '🎃', '🍓', '🌻', '🥬', '🍆'][(i * 3 + f.plots) % 8]}</span>)}
            </div>
            {can && <div className="mt-3 flex justify-end"><Button size="sm" variant="secondary" onClick={() => go(`/farm/${f.id}`)} data-testid="place-farm-visit">{isMe ? 'Open' : 'Visit farm'}</Button></div>}
          </Card>
        ))}
        {d.businesses.map((b) => (
          <Card key={b.id} rarity={b.rarity} testid="place-business" bg="linear-gradient(180deg, #2B1F5C 0%, #6A3FA0 55%, #FF9F5A 100%)">
            <div className="pr-20">
              <div className="truncate font-display text-lg font-black">🍋 {b.name}</div>
              <div className="mt-1 flex flex-wrap gap-1.5"><Stat>💰 ${fmt(Math.round(b.alltime))} earned</Stat><Stat>{fmt(b.tips)} tips</Stat><Stat>{b.plots} plot{b.plots === 1 ? '' : 's'}</Stat></div>
            </div>
            {/* a little skyline */}
            <div className="mt-3 flex h-16 items-end gap-1">
              {[34, 52, 26, 60, 40, 48, 30, 56, 38].map((h, i) => (
                <div key={i} className="flex-1 rounded-t-md bg-[#1A1238]/80" style={{ height: h }}>
                  <div className="grid grid-cols-2 gap-0.5 p-1">{Array.from({ length: Math.floor(h / 10) * 2 }, (_, k) => <span key={k} className="h-1 rounded-sm" style={{ background: (i + k) % 3 ? '#FFE14D' : '#FFE14D44' }} />)}</div>
                </div>
              ))}
            </div>
            {can && <div className="mt-3 flex justify-end"><Button size="sm" variant="secondary" onClick={() => go(`/business/${b.id}`)} data-testid="place-business-visit">{isMe ? 'Open' : 'Visit business'}</Button></div>}
          </Card>
        ))}
      </div>
    </section>
  );
}
