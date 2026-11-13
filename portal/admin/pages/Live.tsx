// Live control: change the iOS / Android apps and the game's pages from here, with no app update.
// game_config 'app' (read by every copy of the game every few minutes): required and latest app version, store
// links, planned maintenance, pages switched off, links. Plus a map of everything else that is already live.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../../src/backend/api';
import { toGameError } from '../../../src/backend/backend';
import type { AppConfig } from '../../../src/backend/types';
import { Button } from '../../../src/ui';
import { cn } from '../../../src/lib/utils';
import { ago } from '../../shared/format';
import { Badge, PageHeader, Panel, Q, Stat } from '../../shared/ui';

/** every page a player can open, as the game groups them (the map, settings, help and sign-in can't be switched off) */
const PAGES: { group: string; pages: [string, string][] }[] = [
  { group: 'World', pages: [['/plots', 'My plots'], ['/rankings', 'Rarity rankings'], ['/legend', 'Map legend']] },
  { group: 'Create', pages: [['/canvases', 'My canvases'], ['/create', 'Painting a plot (the editor)'], ['/challenges', 'Challenges'], ['/sketch', 'Sketch of the Day'], ['/duet', 'Duets'], ['/inventory', 'Studio & shop']] },
  { group: 'Inkborn', pages: [['/inkborn', 'Inkborn (all of it)'], ['/inkborn/create', 'Create an Inkborn'], ['/habitat', 'Sanctuary'], ['/inkborn/visit', 'Visiting']] },
  { group: 'Space', pages: [['/space', 'Space (all of it)'], ['/space/play/asteroids', 'Asteroid Run'], ['/space/play/lander', 'Moon Lander']] },
  { group: 'Play & Earn', pages: [['/play', 'Play & Earn (all minigames)'], ['/pvp', 'PvP'], ['/doodle', 'Draw & Guess'], ['/events', 'Events'], ['/leaderboards', 'Ranks']] },
  { group: 'Community', pages: [['/social', 'Feed & chat'], ['/clans', 'Clans'], ['/clan', 'Clan hall'], ['/gallery', 'Gallery'], ['/art', 'Artwork pages'], ['/players', 'Players'], ['/u', 'Player profiles'], ['/invite', 'Invite friends']] },
  { group: 'Places on plots', pages: [['/farm', 'Farms'], ['/business', 'Businesses'], ['/arcade', 'Arcades'], ['/realm', 'Realms'], ['/landlord', 'Estates'], ['/home', 'Homes & rooms']] },
  { group: 'You', pages: [['/me', 'Me'], ['/achievements', 'Badges'], ['/explorer', 'Explorer'], ['/grimoire', 'Grimoire'], ['/royalty', 'Royalty'], ['/guide', 'Guide']] },
];
const CORE = ['/', '/world', '/hub', '/welcome', '/settings', '/support', '/legal', '/onboarding', '/reset-password'];
const VERSION = /^\d+(\.\d+){0,3}$/;

/** everything else that already changes live, and where */
const ELSEWHERE: { to: string; title: string; what: string }[] = [
  { to: '/config', title: 'Game settings', what: 'Every number the game runs on: prices, rewards, minigames, Inkborn, farms, space, realms, clans, travel, limits, moderation words. 60+ settings.' },
  { to: '/tools/switches', title: 'Switches', what: 'Whole systems on or off: chat, gallery, events, minigames, cash-outs, purchases, ads, globe view.' },
  { to: '/tools/earnings', title: 'Rates & rarities', what: 'What each rarity earns, the odds of each rarity, minigame Ink.' },
  { to: '/tools/shop', title: 'Shop', what: 'Every item, price and outfit in the shop.' },
  { to: '/tools/world', title: 'World & events', what: 'Live events, hot zones and world settings.' },
  { to: '/tools/challenges', title: 'Challenges', what: 'Weekly painting themes.' },
  { to: '/tools/updates', title: 'Updates', what: 'Announcements and pop-ups every player sees.' },
  { to: '/tools/social', title: 'Chat & social', what: 'Mute, remove messages, clans.' },
  { to: '/data', title: 'Data explorer', what: 'Any row in any table (owner).' },
];

export default function Live() {
  const q = useQuery({ queryKey: ['admin', 'config'], queryFn: api.admin.configGet });
  return (
    <>
      <PageHeader title="Live control" sub="Change the iOS and Android apps and the game’s pages from here, with no app update. Players get each change within about five minutes (straight away when they reopen the app). Every save is in the audit log." />
      <Q q={q}>{(d) => (d.config?.app ? <Editor value={d.config.app.value as AppConfig} at={d.config.app.updated_at} /> : <Panel><p className="text-sm text-muted">The live control settings aren’t in the database yet. They arrive with the next deploy.</p></Panel>)}</Q>
      <Section className="mt-3" title="Everything else that changes live" sub="Server-side, for every player, website and apps alike.">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {ELSEWHERE.map((e) => (
            <Link key={e.to} to={e.to} className="group rounded-xl border border-line p-3 hover:border-line-strong hover:bg-surface-2/40">
              <div className="font-semibold group-hover:text-accent-2">{e.title}</div>
              <div className="mt-0.5 text-sm text-muted">{e.what}</div>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">New versions of the game’s own code and screens reach the apps as live versions (below). What still needs a store release: a new native plugin or permission, and the app’s icon and name.</p>
      </Section>
    </>
  );
}

function Editor({ value, at }: { value: AppConfig; at?: string }) {
  const qc = useQueryClient();
  const [v, setV] = useState<AppConfig>(() => structuredClone(value));
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState('');
  const [held, setHeld] = useState(() => (value.ota?.paused_for ?? []).join(', '));
  useEffect(() => setHeld((value.ota?.paused_for ?? []).join(', ')), [value]);
  useEffect(() => setV(structuredClone(value)), [value]);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  const set = (patch: Partial<AppConfig>) => setV((x) => ({ ...x, ...patch }));
  const off = new Set(v.hidden_pages ?? []);
  const offApps = new Set(v.hidden_pages_apps ?? []);
  const known = useMemo(() => new Set(PAGES.flatMap((g) => g.pages.map(([p]) => p))), []);
  const custom = [...new Set([...off, ...offApps])].filter((p) => !known.has(p));
  const badVersion = !VERSION.test(v.min_version ?? '') || !VERSION.test(v.latest_version ?? '');

  const toggle = (key: 'hidden_pages' | 'hidden_pages_apps', page: string, on: boolean) => {
    const s = new Set(v[key] ?? []);
    if (on) s.add(page); else s.delete(page);
    set({ [key]: [...s] } as Partial<AppConfig>);
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.admin.configSet('app', v);
      toast.success('Saved. Players get it within about five minutes');
      void qc.invalidateQueries({ queryKey: ['admin', 'config'] });
    } catch (e) {
      const g = toGameError(e);
      toast.error(g.code === 'invalid_app_config' ? 'Versions look like 1.2.0 (held versions too), and page addresses start with / (the map, settings and help can’t be switched off).' : g.message);
    } finally { setBusy(false); }
  };
  const m = v.maintenance ?? {};
  const ota = v.ota ?? {};
  const heldOk = (ota.paused_for ?? []).every((x) => VERSION.test(x));
  const untilLocal = m.until ? toLocalInput(m.until) : '';

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Apps must be at least" value={value.min_version ?? '—'} sub="older apps must update" />
        <Stat label="Newest app" value={value.latest_version ?? '—'} sub="older apps are offered it once" />
        <Stat label="Maintenance" value={value.maintenance?.on ? 'On' : 'Off'} tone={value.maintenance?.on ? 'bad' : undefined} sub={value.maintenance?.on ? 'players see “back soon”' : 'everyone can play'} />
        <Stat label="Pages switched off" value={String((value.hidden_pages?.length ?? 0) + (value.hidden_pages_apps?.length ?? 0))} sub={at ? `last change ${ago(at)}` : undefined} />
      </div>

      <div className="sticky top-[60px] z-20 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-[var(--bg-2)]/95 px-3 py-2 backdrop-blur">
        <span className="text-sm text-muted">{dirty ? 'You have changes that aren’t live yet.' : 'Everything here is live.'}</span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" disabled={!dirty || busy} onClick={() => setV(structuredClone(value))}>Undo changes</Button>
          <Button size="sm" variant="primary" loading={busy} disabled={!dirty || badVersion || !(v.ota?.paused_for ?? []).every((x) => VERSION.test(x))} onClick={() => void save()} data-testid="live-save">Save and go live</Button>
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Section title="App versions" sub="The version number as it is in App Store Connect and Google Play (for example 1.0.0).">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Apps must be at least" hint="Older apps show a full-screen “update” prompt and can’t play until they update. Raise it only once the new version is live in both stores." bad={!VERSION.test(v.min_version ?? '')}>
              <input className="p-input w-full" value={v.min_version ?? ''} onChange={(e) => set({ min_version: e.target.value.trim() })} inputMode="decimal" placeholder="1.0.0" />
            </Field>
            <Field label="Newest app" hint="Older apps are offered the update once, and can carry on." bad={!VERSION.test(v.latest_version ?? '')}>
              <input className="p-input w-full" value={v.latest_version ?? ''} onChange={(e) => set({ latest_version: e.target.value.trim() })} inputMode="decimal" placeholder="1.0.0" />
            </Field>
            <Field label="App Store link" hint="Add it once the app is in the App Store. Until then the update button opens landvas.app.">
              <input className="p-input w-full" value={v.store?.ios ?? ''} onChange={(e) => set({ store: { ...v.store, ios: e.target.value.trim() } })} placeholder="https://apps.apple.com/app/…" />
            </Field>
            <Field label="Google Play link">
              <input className="p-input w-full" value={v.store?.android ?? ''} onChange={(e) => set({ store: { ...v.store, android: e.target.value.trim() } })} placeholder="https://play.google.com/store/apps/details?id=com.landvas.app" />
            </Field>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">The words players see</summary>
            <div className="mt-3 grid gap-3">
              <Field label="Must update: title"><input className="p-input w-full" value={v.update?.title ?? ''} onChange={(e) => set({ update: { ...v.update, title: e.target.value } })} /></Field>
              <Field label="Must update: message"><textarea className="p-input h-20 w-full py-2" value={v.update?.message ?? ''} onChange={(e) => set({ update: { ...v.update, message: e.target.value } })} /></Field>
              <Field label="Update offered: title"><input className="p-input w-full" value={v.update?.soft_title ?? ''} onChange={(e) => set({ update: { ...v.update, soft_title: e.target.value } })} /></Field>
              <Field label="Update offered: message"><textarea className="p-input h-16 w-full py-2" value={v.update?.soft_message ?? ''} onChange={(e) => set({ update: { ...v.update, soft_message: e.target.value } })} /></Field>
            </div>
          </details>
        </Section>

        <Section title="Maintenance" sub="A “back soon” screen for every player, on the website and in the apps. Staff on the website still get in, with a reminder at the top.">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <span><span className="font-semibold">Maintenance is {m.on ? 'on' : 'off'}</span><span className="block text-sm text-muted">{m.on ? 'Players can’t play until you turn it off and save.' : 'Turn on, then save, to close the game for everyone.'}</span></span>
            <Switch checked={!!m.on} onCheckedChange={(on: boolean) => set({ maintenance: { ...m, on } })} aria-label="Maintenance" />
          </label>
          <div className="mt-3 grid gap-3">
            <Field label="Title"><input className="p-input w-full" value={m.title ?? ''} onChange={(e) => set({ maintenance: { ...m, title: e.target.value } })} /></Field>
            <Field label="Message"><textarea className="p-input h-20 w-full py-2" value={m.message ?? ''} onChange={(e) => set({ maintenance: { ...m, message: e.target.value } })} /></Field>
            <Field label="Back around (optional)" hint="Shown to players in their own time zone.">
              <input className="p-input w-full" type="datetime-local" value={untilLocal} onChange={(e) => set({ maintenance: { ...m, until: e.target.value ? new Date(e.target.value).toISOString() : null } })} />
            </Field>
          </div>
        </Section>
      </div>

      <Section title="Live versions of the game" sub="Every deploy makes a new version of the game for the apps. Apps fetch only the files that changed, check each one, and switch to it after they’ve been away for 5 minutes or on their next launch, never mid-game. A version that doesn’t start rolls back by itself.">
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <span><span className="font-semibold">Send new versions to the apps</span><span className="block text-sm text-muted">{ota.on === false ? 'Off: apps stay on the version they have.' : 'On: every deploy reaches the apps.'}</span></span>
            <Switch tone="ok" checked={ota.on !== false} onCheckedChange={(on: boolean) => set({ ota: { ...ota, on } })} aria-label="Send new versions to the apps" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <span><span className="font-semibold">Send every app back to its store version</span><span className="block text-sm text-muted">Only if a live version breaks something. New versions stop until you turn this off.</span></span>
            <Switch checked={!!ota.back_to_store_build} onCheckedChange={(on: boolean) => set({ ota: { ...ota, back_to_store_build: on } })} aria-label="Send every app back to its store version" />
          </label>
          <Field label="Hold these app versions on their store version" hint="Apple and Google review exactly the build they were sent. Add the version before you submit it (for example 1.0.0) and take it off once it’s approved." bad={!heldOk}>
            <input className="p-input w-full" value={held} onChange={(e) => { setHeld(e.target.value); const list = e.target.value.split(/[\s,]+/).filter(Boolean); set({ ota: { ...ota, paused_for: list } }); }} placeholder="1.0.0, 1.1.0" />
          </Field>
          <Published />
        </div>
      </Section>

      <Section title="Pages" sub="Switch any part of the game off. Every button, card, tab and link to it disappears, and opening its address goes back to the main screen. “In the apps only” leaves the website as it is." pad={false}>
        <div className="p-scroll">
          <table className="p-table">
            <thead><tr><th>Page</th><th className="max-sm:hidden">Address</th><th className="text-center">Off everywhere</th><th className="text-center">Off in the apps only</th></tr></thead>
            <tbody>
              {PAGES.map((g) => (
                <GroupRows key={g.group} group={g.group} pages={g.pages} off={off} offApps={offApps} toggle={toggle} />
              ))}
              {custom.length > 0 && <GroupRows group="Other addresses" pages={custom.map((p) => [p, p])} off={off} offApps={offApps} toggle={toggle} />}
            </tbody>
          </table>
        </div>
        <form className="flex flex-wrap items-center gap-2 border-t border-line p-3" onSubmit={(e) => {
          e.preventDefault();
          const p = extra.trim().toLowerCase();
          if (!/^\/[a-z0-9/_-]+$/.test(p) || CORE.includes(p)) { toast.error('Use an address like /space. The map, settings and help can’t be switched off.'); return; }
          toggle('hidden_pages', p, true); setExtra('');
        }}>
          <input className="p-input w-56" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="/another/address" aria-label="Another address to switch off" />
          <Button size="sm" type="submit">Switch off another address</Button>
          <span className="text-xs text-muted">The map, settings, help and sign-in always stay on.</span>
        </form>
      </Section>

      <Section title="Links" sub="Where the game sends players for the community and for help.">
        <div className="grid gap-3 sm:grid-cols-2">
          {(['discord', 'reddit', 'website', 'support_email'] as const).map((k) => (
            <Field key={k} label={{ discord: 'Discord invite', reddit: 'Reddit', website: 'Website', support_email: 'Support email' }[k]}>
              <input className="p-input w-full" value={v.links?.[k] ?? ''} onChange={(e) => set({ links: { ...v.links, [k]: e.target.value.trim() } })} />
            </Field>
          ))}
        </div>
      </Section>
    </div>
  );
}

function GroupRows({ group, pages, off, offApps, toggle }: { group: string; pages: [string, string][]; off: Set<string>; offApps: Set<string>; toggle(key: 'hidden_pages' | 'hidden_pages_apps', page: string, on: boolean): void }) {
  return (
    <>
      <tr><td colSpan={4} className="bg-surface-2/40 text-xs font-semibold text-muted">{group}</td></tr>
      {pages.map(([p, label]) => (
        <tr key={p} className={cn((off.has(p) || offApps.has(p)) && 'bg-bad/5')}>
          <td className="font-medium">{label} {(off.has(p) || offApps.has(p)) && <Badge tone="bad">off</Badge>}<div className="p-mono text-[11px] font-normal text-faint sm:hidden">{p}</div></td>
          <td className="p-mono text-xs text-muted max-sm:hidden">{p}</td>
          <td className="text-center"><Switch checked={off.has(p)} onCheckedChange={(on: boolean) => toggle('hidden_pages', p, on)} aria-label={`${label}: off everywhere`} /></td>
          <td className="text-center"><Switch checked={offApps.has(p)} disabled={off.has(p)} onCheckedChange={(on: boolean) => toggle('hidden_pages_apps', p, on)} aria-label={`${label}: off in the apps only`} /></td>
        </tr>
      ))}
    </>
  );
}

function Field({ label, hint, bad, children }: { label: string; hint?: string; bad?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid content-start gap-1">
      <span className="p-label">{label}</span>
      {children}
      {bad ? <span className="text-xs text-bad">Use a version like 1.2.0</span> : hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Section({ title, sub, children, className, pad = true }: { title: string; sub?: string; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <Panel title={title} className={className} pad={pad}>
      {sub && <p className={cn('mb-3 text-sm text-muted', !pad && 'px-4 pt-1')}>{sub}</p>}
      {children}
    </Panel>
  );
}

/** a compact on/off switch for table cells */
function Switch({ checked, onCheckedChange, disabled, tone = 'danger', ...rest }: { checked: boolean; onCheckedChange(on: boolean): void; disabled?: boolean; tone?: 'danger' | 'ok'; 'aria-label': string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} aria-label={rest['aria-label']} onClick={() => onCheckedChange(!checked)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-40', checked ? (tone === 'ok' ? 'border-ok/60 bg-ok/70' : 'border-bad/60 bg-bad/70') : 'border-line-strong bg-surface-2')}>
      <span className={cn('inline-block h-4.5 w-4.5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-[3px]')} style={{ width: 18, height: 18 }} />
    </button>
  );
}

/** the version each kind of app is offered right now (published by every deploy) */
function Published() {
  const q = useQuery({ queryKey: ['app-config'], queryFn: api.appConfig, refetchInterval: 60_000 });
  const builds = Object.entries(q.data?.ota_builds ?? {});
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="font-semibold">Version the apps are offered</div>
      {!builds.length ? <p className="mt-1 text-sm text-muted">{q.isLoading ? 'Loading…' : 'None yet. The next deploy publishes one.'}</p> : (
        <ul className="mt-1 grid gap-1 text-sm">
          {builds.map(([key, b]) => (
            <li key={key} className="flex flex-wrap items-baseline gap-x-2">
              <span className="p-mono text-xs">{b.build}</span>
              <span className="text-muted">published {ago(b.published_at)}, {b.files} files, {(b.bytes / 1048576).toFixed(1)} MB</span>
              <span className="p-mono text-[11px] text-faint" title="Which app builds can take it (same native plugins and ads setting)">apps {key.slice(0, 8)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
