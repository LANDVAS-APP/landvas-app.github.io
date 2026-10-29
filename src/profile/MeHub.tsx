import { useQueryClient } from '@tanstack/react-query';
import { Award, Brush, Camera, ChevronRight, DoorOpen, Gamepad2, Gift, LayoutGrid, LogOut, MessagesSquare, Package, Settings as SettingsIcon, Shield, Shirt, Trash2, Trophy, Users, Wallet } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { Page, PageHeader } from '../app/Shell';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, fmt, sha256Hex } from '../lib/utils';
import { LiveUsd, WalletDialog, useRent } from '../rent/RentHud';
import { Avatar, Button, Dialog, Field, Spinner, inputCls, PlayerAvatar } from '../ui';
import { ExplorerFigure } from '../explorer/ExplorerFigure';


const ACCENTS = ['#7B5CFF', '#FF3D9A', '#3DDC97', '#2FB8FF', '#FFB31F', '#FF5A3D', '#22E3FF', '#B8F04A'];
const STYLES = ['prism', 'orbit', 'mosaic', 'bloom'] as const;

import { NavCustomizer } from '../app/NavCustomizer';
import { preparePicture } from '../lib/picture';

export default function MeHub() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { rent, offset } = useRent();
  const [wallet, setWallet] = useState(false);
  const [edit, setEdit] = useState(false);
  const [tabs, setTabs] = useState(false);
  if (!me) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const p = me.profile;
  const links = [
    { to: '/canvases', label: 'My canvases', icon: LayoutGrid, hint: `${me.group_count} canvas${me.group_count === 1 ? '' : 'es'}` },
    { to: '/play', label: 'Play & earn Ink', icon: Gamepad2, hint: `${fmt(me.balances.ink)} Ink` },
    { to: '/invite', label: 'Invite friends', icon: Gift, hint: 'Earn Ink for every friend' },
    { to: '/inventory', label: 'Studio & shop', icon: Package, hint: 'Brushes, colours, tools' },
    { to: '/explorer', label: 'My explorer', icon: Shirt, hint: 'Hats, outfits, trails' },
    { to: `/u/${p.username}/room`, label: 'My room', icon: DoorOpen, hint: 'What visitors see' },
    { to: '/social', label: 'Social', icon: MessagesSquare, hint: 'Feed, chat, friends' },
    { to: '/achievements', label: 'Badges', icon: Award, hint: `${me.achievement_count} unlocked` },
    { to: '/leaderboards', label: 'Rankings', icon: Trophy, hint: 'Top landholders & artists' },
    { to: `/u/${p.username}`, label: 'Public profile', icon: Brush, hint: 'What others see' },
    { to: '/settings', label: 'Settings', icon: SettingsIcon, hint: 'Theme, GPS, tabs, account' },
    { to: '/pvp', label: 'PvP minigames', icon: Gamepad2, hint: 'Free head-to-head games' },
    { to: '/challenges', label: 'Challenges', icon: Trophy, hint: 'Weekly painting themes' },
    { to: '/players', label: 'Players', icon: Users, hint: 'Everyone’s land and art' },
    ...(me.roles.includes('owner') ? [{ to: '/admin', label: 'Admin hub', icon: Shield, hint: 'Owner' }] : []),
  ];
  return (
    <Page>
      <PageHeader eyebrow="Your corner of the world" title="Me" actions={<Button size="sm" variant="secondary" className="md:hidden" onClick={() => setTabs(true)} data-testid="customize-tabs">Customize tabs</Button>} />
      <Dialog open={tabs} onOpenChange={setTabs} title="Your tab bar" description="Choose the four tabs at the bottom of the screen and their order."><NavCustomizer /></Dialog>
      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <section className="glass rounded-3xl p-5">
          <div className="flex items-center gap-4">
            <PlayerAvatar p={p} size={72} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-xl font-semibold">{p.display_name || p.username}</h2>
              <p className="text-sm text-muted">@{p.username} · Artist level {me.artist_level}</p>
              {p.bio && <p className="mt-1 text-sm">{p.bio}</p>}
            </div>
            <Link to="/explorer" className="hidden shrink-0 rounded-2xl p-1 hover:bg-surface-2 sm:block" aria-label="Customise your explorer" title="Customise your explorer">
              <ExplorerFigure style={p.explorer_style} accent={p.accent_color} size={44} />
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <Stat label="Plots" value={fmt(me.plot_count)} />
            <Stat label="Canvases" value={fmt(me.group_count)} />
            <Stat label="Badges" value={fmt(me.achievement_count)} />
          </div>
          {!edit ? (
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => setEdit(true)}>Edit profile</Button>
          ) : (
            <EditProfile onDone={() => { setEdit(false); invalidateGame(qc); }} />
          )}
        </section>
        <section className="glass rounded-3xl p-5">
          <button className="w-full text-left" onClick={() => setWallet(true)}>
            <div className="flex items-center justify-between">
              <span className="eyebrow">USD rent</span>
              <Wallet className="h-4 w-4 text-muted" />
            </div>
            {rent && <LiveUsd rent={rent} offset={offset} decimals={11} className="mt-1 block font-display text-2xl font-semibold text-[#3DDC97]" />}
            <span className="text-xs text-muted">Tap for rates, boost and history</span>
          </button>
          <div className="mt-4 grid gap-1">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-surface-2">
                <l.icon className="h-5 w-5 text-accent-2" />
                <span className="flex-1 font-semibold">{l.label}</span>
                <span className="text-xs text-muted">{l.hint}</span>
                <ChevronRight className="h-4 w-4 text-faint" />
              </Link>
            ))}
            <button className="flex items-center gap-3 rounded-2xl px-2 py-2.5 text-left text-bad hover:bg-surface-2" onClick={async () => { await getBackend().signOut(); qc.clear(); nav('/welcome'); }}>
              <LogOut className="h-5 w-5" /><span className="font-semibold">Sign out</span>
            </button>
          </div>
        </section>
      </div>
      <WalletDialog open={wallet} onOpenChange={setWallet} />
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/50 p-3">
      <div className="font-display text-lg font-semibold tnum">{value}</div>
      <div className="eyebrow !text-[10px]">{label}</div>
    </div>
  );
}

function EditProfile({ onDone }: { onDone(): void }) {
  const me = useOnboardedMe()!;
  const [name, setName] = useState(me.profile.display_name ?? '');
  const [bio, setBio] = useState(me.profile.bio ?? '');
  const [accent, setAccent] = useState(me.profile.accent_color);
  const [style, setStyle] = useState(me.profile.avatar_style);
  const [busy, setBusy] = useState(false);
  return (
    <form className="mt-4 grid gap-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        await api.updateProfile({ displayName: name, bio, accentColor: accent, avatarStyle: style });
        toast.success('Profile saved');
        onDone();
      } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(false); }
    }}>
      <ProfilePicture />
      <Field label="Display name" htmlFor="dn"><input id="dn" className={inputCls} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Bio" htmlFor="bio"><textarea id="bio" className={cn(inputCls, 'h-20 py-2')} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
      <div>
        <div className="eyebrow mb-2">Colour (your plots on the map)</div>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((c) => <button type="button" key={c} onClick={() => setAccent(c)} aria-label={c} className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-bg', accent === c && 'ring-2 ring-fg')} style={{ background: c }} />)}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Avatar (shown when you have no picture)</div>
        <div className="flex gap-2">
          {STYLES.map((s) => (
            <button type="button" key={s} onClick={() => setStyle(s)} className={cn('rounded-2xl border p-1', style === s ? 'border-accent-2' : 'border-line')}>
              <Avatar seed={me.profile.avatar_seed} style={s} accent={accent} size={40} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={busy}>Save</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

/** Crop to a centred square, scale to 256 px and re-encode — which also drops hidden data such as where a photo was taken. */

function ProfilePicture() {
  const me = useOnboardedMe()!;
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'up' | 'rm' | null>(null);
  const p = me.profile;
  const refresh = () => { invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['profile'] }); };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/40 p-3">
      <PlayerAvatar p={p} size={56} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">Profile picture</div>
        <div className="text-xs text-muted">Cropped to a square. Hidden photo data like location is removed. Keep it friendly — everyone can see it.</div>
      </div>
      <div className="flex gap-2">
        <input ref={input} type="file" accept="image/*" className="hidden" data-testid="avatar-file" onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy('up');
          try {
            const blob = await preparePicture(file);
            const hash = await sha256Hex(await blob.arrayBuffer());
            const name = `${hash}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
            await getBackend().uploadAvatar(me.user_id, name, blob);
            await api.setAvatarImage(`${me.user_id}/${name}`);
            toast.success('Profile picture updated');
            refresh();
          } catch (err) {
            toast.error(err instanceof Error && !(err as any).code ? err.message : toGameError(err).message);
          } finally { setBusy(null); }
        }} />
        <Button type="button" size="sm" variant="secondary" loading={busy === 'up'} onClick={() => input.current?.click()} data-testid="avatar-upload"><Camera className="h-4 w-4" /> {p.avatar_path ? 'Change' : 'Upload'}</Button>
        {p.avatar_path && (
          <Button type="button" size="sm" variant="ghost" loading={busy === 'rm'} aria-label="Remove profile picture" onClick={async () => {
            setBusy('rm');
            try { await api.setAvatarImage(null); toast.success('Picture removed'); refresh(); } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(null); }
          }}><Trash2 className="h-4 w-4" /></Button>
        )}
      </div>
    </div>
  );
}
