// 🎨 Paintbrawl, instantly: the offline preview's way straight into a battle with no sign-up. It makes a guest
// player in the browser's own little database, gives them a Paintbrawl Arena, and starts a match against the CPU.
// Only reachable in the local (offline) build — the real game always goes through sign-up.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import { config } from '../env';
import { realmRoute } from '../realms/kinds';
import { Button, Spinner } from '../ui';
import { setDemoAutoPractice } from './BrawlScreen';
import { CARDS, RARITY_INFO } from '../shared/brawl/cards';

// somewhere to stand (Salt Lake City); the street map doesn't load offline, so the spot doesn't matter
const SPOT = { lng: -111.8929, lat: 40.7608 };

async function ensureArena(step: (s: string) => void): Promise<string> {
  const be = getBackend();
  if (!be.session()) {
    step('Making you a guest player…');
    const tag = Math.random().toString(36).slice(2, 8);
    const email = `guest-${tag}@demo.local`, pw = `paint-${tag}-${Date.now()}`;
    await be.signUp(email, pw);
    if (!be.session()) await be.signIn(email, pw);
  }
  let st = await api.myState();
  if (!st.onboarded) {
    step('Setting up your profile…');
    const n = Math.floor(1000 + Math.random() * 9000);
    st = await api.completeOnboarding({ username: `Guest${n}`, displayName: 'Guest', avatarSeed: `guest${n}`, avatarStyle: 'prism', accentColor: '#7B5CFF', termsVersion: st.terms_current });
  }
  // already have an arena (a revisit)? go straight there
  let groups = await api.myGroups();
  const ready = groups.find((g) => g.kind === 'brawl' && g.realm_id);
  if (ready) return ready.realm_id!;
  step('Building your arena…');
  if (!groups.length) {
    const ex = await api.reportPosition(SPOT.lng, SPOT.lat, 8);
    await api.claimStarter(ex.gx, ex.gy, 'Demo Arena');
    groups = await api.myGroups();
  }
  // plenty of ink so switching the plot's type never stops the demo
  const db = (be as unknown as { db?: { query(q: string, a: unknown[]): Promise<unknown> } }).db;
  await db?.query(`update resource_balances set amount = greatest(amount, 1000) where player_id = $1 and resource = 'ink'`, [st.user_id]).catch(() => {});
  await api.setGroupKind(groups[0].id, 'brawl');
  const g = (await api.myGroups()).find((x) => x.id === groups[0].id);
  if (!g?.realm_id) throw new Error('The arena didn’t open — try again.');
  return g.realm_id;
}

/** Plenty of shards in the demo (packs to open), and every card unlocked. */
async function giveShards(db: { query(q: string, a: unknown[]): Promise<unknown> } | undefined, uid: string) {
  const all = Object.fromEntries(CARDS.map((c) => [c.id, RARITY_INFO[c.rarity].max]));
  await db?.query(`select private.rbr_player($1)`, [uid]).catch(() => {});
  await db?.query(`update public.brawl_players set cards = $2 where player_id = $1`, [uid, JSON.stringify(all)]).catch(() => {});
  await db?.query(`select private.rlm_player($1, 'brawl')`, [uid]).catch(() => {});
  await db?.query(`update public.realm_players set wallet = jsonb_set(wallet, '{shards}', to_jsonb(greatest(coalesce((wallet ->> 'shards')::int, 0), 5000))) where player_id = $1 and kind = 'brawl'`, [uid]).catch(() => {});
}

type Pick = 'bot' | 'lab' | 'lobby';
const CHOICES: [Pick, string, string][] = [
  ['bot', '⚔️ Battle the CPU', 'A real match against a practice bot'],
  ['lab', '🧪 Card Lab', 'Put any card in your hand and try it out'],
  ['lobby', '🎁 Open packs', 'The arena: packs, your cards and decks'],
];

export default function BrawlDemo() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState('Warming up the arena…');
  const [err, setErr] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [arena, setArena] = useState<string | null>(null);
  const go = async (id: string, pick: Pick) => { await qc.resetQueries(); if (pick !== 'lobby') setDemoAutoPractice(pick); nav(realmRoute(id), { replace: true }); };
  useEffect(() => {
    if (config.backend !== 'local') { nav('/welcome', { replace: true }); return; }
    let stop = false;
    // the browser tests go straight into a battle unless they ask for the menu
    const auto = location.search.includes('e2e=1') && !location.search.includes('menu=1');
    void ensureArena((s) => { if (!stop) setStep(s); })
      .then(async (id) => {
        if (stop) return;
        const db = (getBackend() as unknown as { db?: { query(q: string, a: unknown[]): Promise<unknown> } }).db;
        await giveShards(db, (await api.myState()).user_id);
        if (auto) await go(id, 'bot'); else setArena(id);
      })
      .catch((e) => { if (!stop) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { stop = true; };
  }, [tries]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 grid place-items-center bg-[#120A22] p-6 text-center text-white" data-testid="brawl-demo">
      <div className="grid justify-items-center gap-3">
        <div className="text-6xl">🎨</div>
        <div className="font-display text-3xl font-black">Paintbrawl</div>
        {err ? (
          <>
            <p className="max-w-xs text-sm text-white/70">Something went wrong getting the arena ready: {err}</p>
            <Button variant="primary" onClick={() => { setErr(null); setTries((t) => t + 1); }}>Try again</Button>
          </>
        ) : arena ? (
          <div className="grid w-72 gap-2" data-testid="brawl-demo-menu">
            {CHOICES.map(([k, n, d]) => (
              <button key={k} onClick={() => void go(arena, k)} className="rounded-2xl bg-white/10 px-4 py-3 text-left transition hover:bg-white/20" data-testid={`brawl-demo-${k}`}>
                <div className="font-display text-lg font-black">{n}</div><div className="text-xs text-white/65">{d}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-white/70"><Spinner /> {step}</div>
        )}
      </div>
    </div>
  );
}
