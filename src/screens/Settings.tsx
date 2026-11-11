import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Satellite, Shield, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { Page, PageHeader } from '../app/Shell';
import { useSession } from '../app/App';
import { BUILD, hardRefresh } from '../app/updates';
import { useOnboardedMe } from '../lib/queries';
import { useUi, type Theme } from '../lib/store';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import { startGps, stopGps, useExplorer } from '../explorer/explorer';
import { Button, Switch, useConfirm, PlayerAvatar } from '../ui';
import { replayTour } from '../tour/Tour';
import { NavCustomizer } from '../app/NavCustomizer';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-3xl p-5">
      <h2 className="mb-4 font-display text-base font-semibold">{title}</h2>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

export default function Settings() {
  const settings = useUi((s) => s.settings);
  const update = useUi((s) => s.updateSettings);
  const me = useOnboardedMe();
  const session = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const gps = useExplorer((s) => s.gps);
  const blocks = useQuery({ queryKey: ['blocks'], queryFn: api.myBlocks, enabled: !!me });
  const backend = getBackend();
  return (
    <Page>
      <PageHeader eyebrow="Preferences" title="Settings" />
      <div className="grid gap-4">
        <Section title="How you play">
          <Switch id="simple" label="Simple mode" hint="No map: buy plots from one screen and watch your rent grow. The map and its heavy files aren’t loaded at all." checked={!!settings.simpleMode} onCheckedChange={(v) => update({ simpleMode: v })} />
          <Switch id="lite" label="Lite map" hint="The map without plots, art or their effects — they aren’t loaded at all. Much faster on older phones." checked={!!settings.hidePlots} onCheckedChange={(v) => update({ hidePlots: v })} />
        </Section>
        <Section title="Appearance">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
            {(['dark', 'light', 'system'] as Theme[]).map((t) => (
              <button key={t} role="radio" aria-checked={settings.theme === t} onClick={() => update({ theme: t })}
                className={cn('rounded-xl border px-4 py-2 text-sm font-bold capitalize', settings.theme === t ? 'border-accent-2 bg-accent-2/10' : 'border-line text-muted')}>{t}</button>
            ))}
          </div>
          <Switch id="globe" label="Globe view when zoomed out" checked={settings.globe} onCheckedChange={(v) => update({ globe: v })} />
          <Switch id="crisp" label="Crisp pixel art on the map" hint="Nearest-neighbour scaling for pixel murals" checked={settings.crispPixels} onCheckedChange={(v) => update({ crispPixels: v })} />
          <Switch id="motion" label="Reduce motion" checked={settings.reduceMotion} onCheckedChange={(v) => update({ reduceMotion: v })} />
          <Switch id="haptics" label="Haptic feedback" hint="Vibration on supported phones" checked={settings.haptics} onCheckedChange={(v) => update({ haptics: v })} />
        </Section>

        <Section title="Phone navigation">
          <NavCustomizer />
        </Section>

        <Section title="Tutorial">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted">A one-minute walk through everything you can do.</span>
            <Button size="sm" variant="secondary" onClick={() => { replayTour(); nav('/world'); }} data-testid="replay-tour">Replay the tutorial</Button>
          </div>
        </Section>

        <Section title="Location">
          <Switch id="gps" label="Move my explorer with GPS" hint={gps === 'denied' ? 'Location permission is blocked in your browser settings.' : 'Your position is only used to place your explorer and is never shown to other players.'}
            checked={gps === 'on' || gps === 'asking' || (safeStorage('landvas.gps', false) && gps !== 'denied')}
            onCheckedChange={(v) => { saveStorage('landvas.gps', v); if (v) startGps(); else stopGps(); }} />
          <p className="flex items-center gap-2 text-xs text-muted"><Satellite className="h-4 w-4" /> LANDVAS needs GPS: your explorer always stands where you really are. Your location is never shown to other players.</p>
        </Section>

        {me && (
          <Section title="Privacy">
            <PrivacySettings />
          </Section>
        )}

        {me && (
          <Section title="Account">
            <div className="flex items-center gap-3">
              <PlayerAvatar p={me.profile} size={48} />
              <div className="min-w-0">
                <div className="font-bold">@{me.profile.username}</div>
                <div className="truncate text-sm text-muted">{session?.email ?? ''}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => nav('/me')}>Edit profile</Button>
              <Button variant="ghost" onClick={async () => { await backend.signOut(); qc.clear(); nav('/welcome'); }} data-testid="sign-out"><LogOut className="h-4 w-4" /> Sign out</Button>
              {me.roles.length > 0 && <Button variant="ghost" onClick={() => nav('/admin')}><Shield className="h-4 w-4" /> Admin console</Button>}
            </div>
            <DeleteAccount onDone={async () => { await backend.signOut().catch(() => {}); qc.clear(); nav('/welcome'); }} />
          </Section>
        )}

        {me && (
          <Section title="Blocked players">
            {!(blocks.data ?? []).length ? <p className="text-sm text-muted">You haven't blocked anyone. Blocked players' art and profiles are hidden from you.</p> : (
              <div className="grid gap-2">
                {(blocks.data ?? []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-2xl border border-line p-2.5">
                    <span className="flex items-center gap-2"><PlayerAvatar p={p} size={28} /> @{p.username}</span>
                    <Button size="sm" variant="ghost" onClick={async () => { try { await api.blockPlayer(p.id, false); void blocks.refetch(); } catch (e) { toast.error(toGameError(e).message); } }}>Unblock</Button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        <Section title="About">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link to="/legal/terms" className="text-accent-2 hover:underline">Terms</Link>
            <Link to="/legal/privacy" className="text-accent-2 hover:underline">Privacy</Link>
            <Link to="/legal/content" className="text-accent-2 hover:underline">Content policy</Link>
            <Link to="/legal/copyright" className="text-accent-2 hover:underline">Copyright</Link>
            <Link to="/legal/rent" className="text-accent-2 hover:underline">USD rent rules</Link>
          </div>
          <p className="text-xs text-faint"><Link to="/support" className="font-semibold text-accent-2 hover:underline">Get help</Link> · {backend.mode === 'local' ? 'Local mode — this world lives on this device.' : 'Online world.'}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-faint" data-testid="app-version">
            <span>Version <b className="font-mono text-muted">{BUILD.id}</b> · built {new Date(BUILD.at).toLocaleString()}</span>
            {backend.mode !== 'local' && <button className="font-semibold text-accent-2 hover:underline" onClick={() => void hardRefresh(`manual-${Date.now()}`)}>Check for updates</button>}
          </div>
          {backend.mode === 'local' && backend.resetLocalData && (
            <Button variant="danger" size="sm" className="justify-self-start" onClick={async () => {
              if (!(await confirm({ title: 'Erase this device’s world?', body: 'Every account, plot and artwork stored in this browser will be deleted. This cannot be undone.', confirm: 'Erase everything' }))) return;
              await backend.resetLocalData!();
            }}><Trash2 className="h-4 w-4" /> Erase local data</Button>
          )}
          {backend.mode === 'local' && me && !me.roles.length && (
            <Button variant="ghost" size="sm" className="justify-self-start" onClick={async () => {
              try { await api.devGrantSelfAdmin(); toast.success('You are now an admin on this device'); void qc.invalidateQueries(); } catch (e) { toast.error(toGameError(e).message); }
            }}>Make me admin (this device only)</Button>
          )}
        </Section>
      </div>
    </Page>
  );
}

/** Delete your account from inside the game (the App Store and Google Play require it). */
function DeleteAccount({ onDone }: { onDone(): void }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <button className="justify-self-start text-xs font-semibold text-faint hover:text-bad hover:underline" onClick={() => setOpen(true)} data-testid="delete-account">Delete my account…</button>;
  return (
    <div className="grid gap-2 rounded-2xl border border-bad/40 bg-bad/10 p-3 text-sm" data-testid="delete-account-panel">
      <b>Delete your account for good?</b>
      <p className="text-muted">Your profile, plots, artwork, Inkborn, Ink and everything else are removed and can’t be recovered. Your plots go back to the world for others to claim.</p>
      <label className="grid gap-1 text-xs font-bold">Type DELETE to confirm
        <input className="h-10 rounded-xl border border-line bg-surface/80 px-3 text-sm" value={word} onChange={(e) => setWord(e.target.value)} autoCapitalize="characters" data-testid="delete-confirm" />
      </label>
      <div className="flex gap-2">
        <Button variant="danger" size="sm" disabled={word.trim().toUpperCase() !== 'DELETE'} loading={busy} data-testid="delete-go" onClick={async () => {
          setBusy(true);
          try { await api.deleteMyAccount(); toast.success('Your account has been deleted.'); onDone(); }
          catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
        }}><Trash2 className="h-4 w-4" /> Delete everything</Button>
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setWord(''); }}>Keep my account</Button>
      </div>
    </div>
  );
}

type Act = { k: string; label: string };
const FEED_KEYS: { k: string; label: string; hint: string; acts: Act[] }[] = [
  { k: 'feed_account', label: 'Account', hint: 'Joining LANDVAS, inviting friends', acts: [
    { k: 'fa_join', label: 'Joining LANDVAS' }, { k: 'fa_referral', label: 'Inviting a friend' }] },
  { k: 'feed_claims', label: 'Plots & Crowns', hint: 'Plots you claim (and their rarity), Crowns, planet plots', acts: [
    { k: 'fa_claim', label: 'Claiming a plot' }, { k: 'fa_shiny', label: 'Claiming a ✨ shiny plot' }, { k: 'fa_crown', label: 'Claiming a Crown' },
    { k: 'fa_planet_plot', label: 'Claiming a planet plot' }, { k: 'fa_core', label: 'Reaching a planet’s core' }] },
  { k: 'feed_badges', label: 'Badges', hint: 'Badges you earn', acts: [{ k: 'fa_achievement', label: 'Earning a badge' }] },
  { k: 'feed_games', label: 'Game wins', hint: 'Minigames, PvP, arcade, challenges, levels', acts: [
    { k: 'fa_minigame', label: 'Clearing a minigame level' }, { k: 'fa_pvp', label: 'Winning a PvP match' }, { k: 'fa_challenge', label: 'Placing in a challenge' },
    { k: 'fa_sketch', label: 'Placing in Sketch of the Day' }, { k: 'fa_level', label: 'Reaching an artist level' },
    { k: 'fa_arcade_playing', label: 'Playing in an arcade' }, { k: 'fa_arcade_record', label: 'Arcade high scores' }, { k: 'fa_arcade_prize', label: 'Arcade prizes' },
    { k: 'fa_arcade_cosmetic', label: 'Unlocking arcade gear' }, { k: 'fa_arcade_level', label: 'Your arcade levelling up' }, { k: 'fa_arcade_install', label: 'Installing arcade machines' }] },
  { k: 'feed_art', label: 'Art', hint: 'Art you publish, duets, stamps', acts: [
    { k: 'fa_publish', label: 'Publishing art' }, { k: 'fa_featured', label: 'Getting Featured' }, { k: 'fa_duet', label: 'Finishing a duet' }, { k: 'fa_stamp', label: 'Collecting a stamp' }] },
  { k: 'feed_luck', label: 'Luck', hint: 'Sacrifices at the Altar and your lucky picks', acts: [
    { k: 'fa_luck_ink', label: 'Sacrificing Ink for Luck' }, { k: 'fa_luck_inkborn', label: 'Sacrificing an Inkborn' }, { k: 'fa_luck_egg', label: 'Sacrificing an egg' },
    { k: 'fa_luck_plot', label: 'Sacrificing a plot' }, { k: 'fa_luck_pick', label: 'Lucky picks (rolling with Luck)' }] },
  { k: 'feed_travel', label: 'Travel', hint: 'Flights to the Hot Zone, exploring other worlds (never where you are)', acts: [
    { k: 'fa_flight', label: 'Flying somewhere' }, { k: 'fa_exploring', label: 'Exploring a world' }, { k: 'fa_settle', label: 'Settling a new world' }] },
  { k: 'feed_places', label: 'Places', hint: 'Harvests, estates, IPOs, bases, digs, playdates', acts: [
    { k: 'fa_harvest', label: 'Golden harvests' }, { k: 'fa_estate', label: 'Finishing an estate checklist' }, { k: 'fa_ipo', label: 'Taking a business public' },
    { k: 'fa_base', label: 'Building a base' }, { k: 'fa_dig', label: 'Digging deeper' }, { k: 'fa_playdate', label: 'Inkborn playdates' }] },
];
/** a category switch, with each of its activities one tap away */
function FeedGroup({ g, p, set }: { g: (typeof FEED_KEYS)[number]; p: Record<string, boolean>; set(k: string, v: boolean): void }) {
  const [open, setOpen] = useState(false);
  const hidden = g.acts.filter((a) => p[a.k] === false).length;
  return (
    <div data-testid={`pv-group-${g.k}`}>
      <Switch id={`pv-${g.k}`} label={g.label} hint={g.hint} checked={p[g.k] !== false} onCheckedChange={(v) => set(g.k, v)} />
      {p[g.k] !== false && g.acts.length > 1 && (
        <button type="button" className="text-xs font-semibold text-accent-2 hover:underline" onClick={() => setOpen(!open)} data-testid={`pv-more-${g.k}`}>
          {open ? '▾' : '▸'} Choose each one{hidden ? ` · ${hidden} hidden` : ''}
        </button>
      )}
      {open && p[g.k] !== false && g.acts.length > 1 && (
        <div className="mt-1 grid border-l-2 border-line pl-4">
          {g.acts.map((a) => <Switch key={a.k} id={`pv-${a.k}`} label={a.label} checked={p[a.k] !== false} onCheckedChange={(v) => set(a.k, v)} />)}
        </div>
      )}
    </div>
  );
}
const PROFILE_KEYS: { k: string; label: string; hint: string }[] = [
  { k: 'profile_badges', label: 'Badges on my profile', hint: 'The badges you’ve earned' },
  { k: 'profile_games', label: 'Game records on my profile', hint: 'Your minigame levels, best scores and wins' },
  { k: 'profile_stats', label: 'Stats on my profile', hint: 'How many plots and artworks you have, your level' },
];
/** what others can see: the live feed (all of it, or kind by kind) and parts of your public profile */
function PrivacySettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['privacy'], queryFn: api.myPrivacy });
  const p = q.data;
  const set = async (k: string, v: boolean) => {
    qc.setQueryData(['privacy'], { ...(p ?? {}), [k]: v });
    try { qc.setQueryData(['privacy'], await api.setPrivacy({ [k]: v })); } catch (e) { toast.error(toGameError(e).message); void q.refetch(); }
  };
  if (!p) return <div className="text-sm text-muted">Loading…</div>;
  return (
    <div className="grid gap-4" data-testid="privacy-settings">
      <p className="flex items-start gap-2 text-xs text-muted"><Shield className="mt-0.5 h-4 w-4 shrink-0" /> Everything is public unless you turn it off — the whole feed, a category, or any single activity. You always see your own activity. Your location is never shown, whatever you choose.</p>
      <Switch id="pv-feed" label="Show my activity on the live feed" checked={p.feed} onCheckedChange={(v) => void set('feed', v)} />
      {p.feed && (
        <div className="grid gap-3 border-l-2 border-line pl-4">
          {FEED_KEYS.map((g) => <FeedGroup key={g.k} g={g} p={p} set={(k, v) => void set(k, v)} />)}
        </div>
      )}
      {PROFILE_KEYS.map((x) => <Switch key={x.k} id={`pv-${x.k}`} label={x.label} hint={x.hint} checked={p[x.k]} onCheckedChange={(v) => void set(x.k, v)} />)}
    </div>
  );
}
