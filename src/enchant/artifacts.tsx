// The Crucible's artifacts, drawn: each one in its own metal, and grander as it levels — a polished rim (2), runes
// cut into it (3), a golden aura (4), and at 5 a Legendary's starsteel halo with sparks. The sparks are the only thing
// that moves (opacity and transform only), and they rest with the other decorations.
import { useId } from 'react';
import { cn } from '../lib/utils';

export type ArtifactInfo = { name: string; emoji: string; text: string; carry: boolean; glow: string };
export const ARTIFACTS: Record<string, ArtifactInfo> = {
  horseshoe: { name: 'Iron Horseshoe', emoji: '🧲', text: 'Carry it: Luck every day', carry: true, glow: '#9EA6B2' },
  bell: { name: 'Silver Bell', emoji: '🔔', text: 'Carry it: your Leviathan hits land harder', carry: true, glow: '#DDE6F0' },
  lantern: { name: 'Gold Lantern', emoji: '🏮', text: 'Hang it on a plot: its minigames pay more', carry: false, glow: '#FFB000' },
  anchor: { name: 'Starsteel Anchor', emoji: '⚓', text: 'Set it on a plot: no Parasites, no pranks there', carry: false, glow: '#9C7BFF' },
  nest: { name: 'Golden Nest', emoji: '🪺', text: 'Carry it: your Golden Goose’s eggs pay more', carry: true, glow: '#FFD23F' },
  lodestone: { name: 'Lodestone', emoji: '🪨', text: 'Set it on a plot: more minigame Ink on your plots all around it', carry: false, glow: '#4FE3FF' },
  feather: { name: 'Phoenix Feather', emoji: '🪶', text: 'Carry it: a missed strike keeps more of the Heat', carry: true, glow: '#FF6A1F' },
  amphora: { name: 'Ink Amphora', emoji: '🏺', text: 'Carry it: it fills with Ink every day', carry: true, glow: '#5B8CFF' },
};
export const ARTIFACT_ORDER = ['horseshoe', 'bell', 'lantern', 'anchor', 'nest', 'lodestone', 'feather', 'amphora'];
export const LEVEL_NAMES = ['', 'Forged', 'Tempered', 'Runed', 'Gilded', 'Legendary'];

/** one artifact, drawn at its level (`ghost`: one you don't have yet) */
export function ArtifactArt({ kind, level = 1, size = 56, ghost, className }: { kind: string; level?: number; size?: number; ghost?: boolean; className?: string }) {
  const id = 'ar' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const g = (n: string) => `${id}-${n}`;
  const u = (n: string) => `url(#${g(n)})`;
  const info = ARTIFACTS[kind] ?? ARTIFACTS.horseshoe;
  const rim = level >= 2 && !ghost;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn('lvx-art shrink-0 overflow-visible', ghost && 'opacity-30 grayscale', className)} aria-hidden data-level={level}>
      <defs>
        <linearGradient id={g('iron')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#D5D9E0" /><stop offset="0.45" stopColor="#8A8F98" /><stop offset="1" stopColor="#3E424A" /></linearGradient>
        <linearGradient id={g('silver')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="0.5" stopColor="#C9D3DE" /><stop offset="1" stopColor="#6F7B8A" /></linearGradient>
        <linearGradient id={g('gold')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF0A8" /><stop offset="0.45" stopColor="#E8B530" /><stop offset="1" stopColor="#7A520A" /></linearGradient>
        <linearGradient id={g('star')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E7DCFF" /><stop offset="0.5" stopColor="#9C7BFF" /><stop offset="1" stopColor="#2E1A78" /></linearGradient>
        <linearGradient id={g('copper')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F3B08A" /><stop offset="0.5" stopColor="#C46A35" /><stop offset="1" stopColor="#5E2A12" /></linearGradient>
        <linearGradient id={g('fire')} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#7A1A00" /><stop offset="0.35" stopColor="#FF3D00" /><stop offset="0.7" stopColor="#FF9A1F" /><stop offset="1" stopColor="#FFF3B0" /></linearGradient>
        <linearGradient id={g('rock')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5D6470" /><stop offset="0.5" stopColor="#2B2F37" /><stop offset="1" stopColor="#111317" /></linearGradient>
        <radialGradient id={g('ink')} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#9FC2FF" /><stop offset="0.45" stopColor="#3460E0" /><stop offset="1" stopColor="#0C1650" /></radialGradient>
        <radialGradient id={g('flame')} cx="50%" cy="55%" r="55%"><stop offset="0" stopColor="#FFF7C8" /><stop offset="0.45" stopColor="#FFB000" /><stop offset="1" stopColor="#FF5A00" stopOpacity="0" /></radialGradient>
        <radialGradient id={g('aura')} cx="50%" cy="50%" r="50%"><stop offset="0.35" stopColor={level >= 5 ? '#B596FF' : '#FFD27A'} stopOpacity="0.75" /><stop offset="1" stopColor={level >= 5 ? '#6A3DFF' : '#FF9A1F'} stopOpacity="0" /></radialGradient>
      </defs>
      {/* the aura: gold at 4, a starsteel halo at 5 */}
      {level >= 4 && !ghost && <circle cx="32" cy="32" r="31" fill={u('aura')} />}
      {level >= 5 && !ghost && <circle cx="32" cy="32" r="27" fill="none" stroke="#E7DCFF" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="2 4" />}
      <g stroke={rim ? '#FFFFFF' : '#0B0C0E'} strokeOpacity={rim ? 0.55 : 0.85} strokeWidth={rim ? 1.4 : 1.6} strokeLinejoin="round">
        {kind === 'horseshoe' && (
          <>
            <path d="M14 14 L14 34 A18 18 0 0 0 50 34 L50 14 L41 14 L41 34 A9 9 0 0 1 23 34 L23 14 Z" fill={u('iron')} />
            {[[18.5, 19], [18.5, 29], [45.5, 19], [45.5, 29], [24, 44], [40, 44]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill="#1A1C20" stroke="none" />)}
            <rect x="12" y="10" width="13" height="5" rx="1.5" fill={u('iron')} /><rect x="39" y="10" width="13" height="5" rx="1.5" fill={u('iron')} />
          </>
        )}
        {kind === 'bell' && (
          <>
            <path d="M32 8 C22 8 18 18 18 30 C18 38 14 42 11 46 L53 46 C50 42 46 38 46 30 C46 18 42 8 32 8 Z" fill={u('silver')} />
            <rect x="9" y="45" width="46" height="5" rx="2.5" fill={u('silver')} />
            <circle cx="32" cy="54" r="4.5" fill={u('iron')} />
            <path d="M29 5 h6 v4 h-6 z" fill={u('iron')} />
            <path d="M24 16 C22 22 22 30 22 34" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </>
        )}
        {kind === 'lantern' && (
          <>
            <path d="M32 3 a5 5 0 0 1 5 5" fill="none" stroke={u('gold')} strokeWidth="2.5" />
            <path d="M21 13 L43 13 L47 19 L17 19 Z" fill={u('gold')} />
            <rect x="19" y="19" width="26" height="30" rx="3" fill="#2A1400" />
            <rect x="21" y="21" width="22" height="26" rx="2" fill={u('flame')} stroke="none" />
            <ellipse cx="32" cy="36" rx="4" ry="7" fill="#FFF7C8" stroke="none" />
            {[23.5, 32, 40.5].map((x) => <rect key={x} x={x - 1} y="19" width="2" height="30" fill={u('gold')} stroke="none" />)}
            <path d="M17 49 L47 49 L43 56 L21 56 Z" fill={u('gold')} />
          </>
        )}
        {kind === 'anchor' && (
          <>
            <circle cx="32" cy="11" r="5.5" fill="none" stroke={u('star')} strokeWidth="3.5" />
            <rect x="29.5" y="16" width="5" height="34" rx="2" fill={u('star')} />
            <rect x="20" y="20" width="24" height="5" rx="2" fill={u('star')} />
            <path d="M10 36 C12 50 22 56 32 56 C42 56 52 50 54 36 L48 40 C46 47 40 51 32 51 C24 51 18 47 16 40 Z" fill={u('star')} />
            <path d="M10 36 L7 43 L14 41 Z M54 36 L57 43 L50 41 Z" fill={u('star')} />
          </>
        )}
        {kind === 'nest' && (
          <>
            <ellipse cx="32" cy="44" rx="25" ry="11" fill="#5A3A1C" />
            {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${8 + i * 2} ${40 + (i % 3)} Q32 ${30 + i * 3} ${56 - i * 2} ${41 + ((i + 1) % 3)}`} fill="none" stroke={i % 2 ? '#C98B3A' : '#8A5A24'} strokeWidth="2" strokeOpacity="1" />)}
            <ellipse cx="32" cy="33" rx="11" ry="13" fill={u('gold')} />
            <ellipse cx="28" cy="27" rx="3" ry="4.5" fill="#FFFFFF" fillOpacity="0.75" stroke="none" />
            <path d="M8 44 Q32 60 56 44" fill="none" stroke="#6B4421" strokeWidth="3" strokeOpacity="1" />
          </>
        )}
        {kind === 'lodestone' && (
          <>
            {[0, 1, 2].map((i) => <path key={i} d={`M${12 - i * 4} 32 C${12 - i * 4} ${14 - i * 4} ${52 + i * 4} ${14 - i * 4} ${52 + i * 4} 32`} fill="none" stroke="#4FE3FF" strokeOpacity={0.55 - i * 0.15} strokeWidth="1.4" strokeDasharray="3 3" />)}
            <path d="M14 38 L20 22 L34 16 L48 22 L52 38 L42 50 L24 52 Z" fill={u('rock')} />
            <path d="M20 22 L34 16 L32 30 Z M34 16 L48 22 L32 30 Z" fill="#FFFFFF" fillOpacity="0.12" stroke="none" />
            <path d="M24 34 L30 30 L38 33 L42 41" fill="none" stroke="#4FE3FF" strokeWidth="1.8" strokeOpacity="0.9" />
            {[[16, 58], [26, 60], [40, 59], [50, 57], [33, 61]].map(([x, y], i) => <rect key={i} x={x} y={y - 3} width="1.5" height="4" rx="0.7" fill="#AEB6C2" stroke="none" transform={`rotate(${-30 + i * 15} ${x} ${y})`} />)}
          </>
        )}
        {kind === 'feather' && (
          <>
            <path d="M46 6 C56 18 52 38 36 50 C30 54 24 56 18 58 C20 50 22 44 26 38 C30 26 36 14 46 6 Z" fill={u('fire')} />
            {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${24 + i * 4} ${48 - i * 7} L${34 + i * 4} ${44 - i * 7}`} stroke="#FFF3B0" strokeOpacity="0.55" strokeWidth="1" fill="none" />)}
            <path d="M14 62 C24 46 36 28 46 6" fill="none" stroke="#FFF7C8" strokeWidth="1.8" strokeOpacity="0.95" strokeLinecap="round" />
            <circle cx="44" cy="12" r="3" fill="#FFF7C8" stroke="none" opacity="0.8" />
          </>
        )}
        {kind === 'amphora' && (
          <>
            <path d="M18 18 C10 18 10 30 18 30" fill="none" stroke={u('silver')} strokeWidth="3" />
            <path d="M46 18 C54 18 54 30 46 30" fill="none" stroke={u('silver')} strokeWidth="3" />
            <path d="M25 6 L39 6 L37 14 C48 18 50 30 46 42 C43 50 38 56 32 58 C26 56 21 50 18 42 C14 30 16 18 27 14 Z" fill={u('silver')} />
            <path d="M20 34 C24 37 40 37 44 34 C43 46 38 54 32 56 C26 54 21 46 20 34 Z" fill={u('ink')} stroke="none" />
            <path d="M24 5 h16" stroke="#0B0C0E" strokeWidth="2" />
            <path d="M24 22 C23 28 23 32 24 36" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        )}
      </g>
      {/* runes cut in at 3+ */}
      {level >= 3 && !ghost && (
        <g fill="none" stroke={info.glow} strokeOpacity="0.95" strokeWidth="1.2" strokeLinecap="round">
          <path d="M5 54 l3 -5 l3 5 M8 49 v8" /><path d="M53 54 l3 -5 l3 5 M56 49 v8" />
        </g>
      )}
      {/* a Legendary's sparks */}
      {level >= 5 && !ghost && [[8, 10], [56, 12], [6, 40], [58, 44]].map(([x, y], i) => (
        <path key={i} className="lvx-art-spark" style={{ animationDelay: `${i * 0.45}s`, transformOrigin: `${x}px ${y}px` }} d={`M${x} ${y - 4} L${x + 1} ${y - 1} L${x + 4} ${y} L${x + 1} ${y + 1} L${x} ${y + 4} L${x - 1} ${y + 1} L${x - 4} ${y} L${x - 1} ${y - 1} Z`} fill="#FFFFFF" />
      ))}
    </svg>
  );
}

/** ◆◆◆ and its name */
export function LevelPips({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="text-[#FFD23F]">{'◆'.repeat(level)}<span className="text-white/20">{'◆'.repeat(Math.max(0, 5 - level))}</span></span>
      <span className={cn('text-[10px] font-black uppercase tracking-wide', level >= 5 ? 'text-[#C9B4FF]' : level >= 4 ? 'text-[#FFD27A]' : 'text-white/55')}>{LEVEL_NAMES[level]}</span>
    </span>
  );
}
