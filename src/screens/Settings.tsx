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

        <Section title="Location">
          <Switch id="gps" label="Move my explorer with GPS" hint={gps === 'denied' ? 'Location permission is blocked in your browser settings.' : 'Your position is only used to place your explorer and is never shown to other players.'}
            checked={gps === 'on' || gps === 'asking' || (safeStorage('landvas.gps', false) && gps !== 'denied')}
            onCheckedChange={(v) => { saveStorage('landvas.gps', v); if (v) startGps(); else stopGps(); }} />
          <p className="flex items-center gap-2 text-xs text-muted"><Satellite className="h-4 w-4" /> LANDVAS needs GPS: your explorer always stands where you really are. Your location is never shown to other players.</p>
        </Section>

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
