// A chat box that sits on a screen (the map, an arcade): closed, the last few lines float up for a moment and a pill
// shows what's unread; open, one tab per room (Party, Arcade…) and a box to type in. Enter opens it on a keyboard.
import { MessageCircle, Send, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { toGameError } from '../backend/backend';
import type { PlanetChatMsg } from '../backend/types';
import { cn } from '../lib/utils';
import type { RoomChat } from './chat';

export type DockChannel = { id: string; label: string; chat: RoomChat; placeholder: string; empty: string; notHere: string };

export function ChatDock({ channels, myId, className, onInvite, hotkey = true, testid = 'chat-dock' }: {
  channels: DockChannel[]; myId?: string; className?: string; onInvite?(): void; hotkey?: boolean; testid?: string;
}) {
  const [open, setOpenState] = useState(false);
  const [tab, setTab] = useState(channels[0]?.id ?? '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const ch = channels.find((c) => c.id === tab) ?? channels[0];
  // a channel that went away (you left the party): fall back to the first one
  useEffect(() => { if (channels.length && !channels.some((c) => c.id === tab)) setTab(channels[0].id); }, [channels, tab]);
  const setOpen = (o: boolean) => {
    setOpenState(o);
    for (const c of channels) c.chat.setOpen(o && c.id === (ch?.id ?? ''));
    if (o) setTimeout(() => input.current?.focus(), 50);
  };
  // switching tabs while open marks the new one read
  useEffect(() => { if (open) for (const c of channels) c.chat.setOpen(c.id === ch?.id); }, [open, ch?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 2000); return () => clearInterval(t); }, []);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [ch?.chat.msgs.length, open, tab]);
  useEffect(() => {
    if (open || !hotkey) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.isContentEditable)) return;
      if (document.querySelector('[role=dialog]')) return;
      e.preventDefault(); setOpen(true);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  if (!ch) return null;
  const submit = async () => {
    const b = text.trim(); if (!b || busy) return;
    setBusy(true);
    try { await ch.chat.send(b); setText(''); }
    catch (e) { const err = toGameError(e); toast.error(err.code === 'not_in_group' || err.code === 'not_in_arcade' ? ch.notHere : err.message); }
    finally { setBusy(false); input.current?.focus(); }
  };
  const unread = channels.reduce((n, c) => n + c.chat.unread, 0);
  // closed: the last few lines (from any room) float on screen for a little while
  const recent = channels.flatMap((c) => c.chat.msgs.filter((m) => (m.kind ?? 'chat') === 'chat' && now - new Date(m.at).getTime() < 15000).map((m) => ({ m, c })))
    .sort((a, b) => new Date(a.m.at).getTime() - new Date(b.m.at).getTime()).slice(-3);
  return (
    <div className={cn('pointer-events-none flex w-[min(72vw,310px)] flex-col items-start gap-1.5', className)} data-testid={testid}>
      {open ? (
        <div className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0B0E24]/90 text-white shadow-xl">
          <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
            <MessageCircle className="mx-1 h-3.5 w-3.5 shrink-0 text-white/60" />
            {channels.map((c) => (
              <button key={c.id} onClick={() => setTab(c.id)} data-testid={`${testid}-tab-${c.id}`}
                className={cn('relative rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider', c.id === ch.id ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white')}>
                {c.label}
                {c.id !== ch.id && c.chat.unread > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-hot" />}
              </button>
            ))}
            <span className="flex-1" />
            {onInvite && <button className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white" onClick={onInvite} aria-label="Invite to your party" data-testid={`${testid}-invite`}><UserPlus className="h-4 w-4" /></button>}
            <button className="rounded-lg p-1 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close chat" data-testid={`${testid}-close`}><X className="h-4 w-4" /></button>
          </div>
          <div ref={list} className="grid max-h-44 gap-1 overflow-y-auto px-3 py-2 text-[13px] scroll-thin" data-testid={`${testid}-log`}>
            {!ch.chat.msgs.length && <div className="py-2 text-center text-xs text-white/55">{ch.empty}</div>}
            {ch.chat.msgs.map((m) => <ChatLine key={m.id} m={m} mine={m.player.id === myId} />)}
          </div>
          <form className="flex items-center gap-1.5 border-t border-white/10 p-1.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} maxLength={200} placeholder={ch.placeholder} enterKeyHint="send"
              className="h-9 min-w-0 flex-1 rounded-xl bg-white/10 px-3 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-[#7B5CFF]" data-testid={`${testid}-input`}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') setOpen(false);
                // Enter on an empty box closes the chat (and hands the keys back)
                if (e.key === 'Enter' && !text.trim()) { e.preventDefault(); setOpen(false); input.current?.blur(); }
              }} onKeyUp={(e) => e.stopPropagation()} />
            <button type="submit" disabled={!text.trim() || busy} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7B5CFF] disabled:opacity-40" aria-label="Send" data-testid={`${testid}-send`}><Send className="h-4 w-4" /></button>
          </form>
        </div>
      ) : (
        <>
          {recent.map(({ m, c }) => (
            <div key={`${c.id}:${m.id}`} className="max-w-full rounded-2xl bg-[#0B0E24]/80 px-2.5 py-1 text-[12px] text-white animate-[lv-fade-in_.25s_ease-out]">
              {channels.length > 1 && <span className="mr-1 rounded bg-white/15 px-1 text-[9px] font-black uppercase">{c.label}</span>}<ChatLine m={m} mine={m.player.id === myId} />
            </div>
          ))}
          <button className="pointer-events-auto relative flex items-center gap-1.5 rounded-full bg-[#0B0E24]/85 px-3 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-[#0B0E24]" onClick={() => setOpen(true)} data-testid={`${testid}-open`}>
            <MessageCircle className="h-4 w-4" /> {channels.map((c) => c.label).join(' · ')}
            {hotkey && <span className="hidden rounded bg-white/15 px-1 text-[9px] font-semibold text-white/70 sm:inline">Enter</span>}
            {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-hot px-1 text-center text-[10px] leading-[18px] text-white tnum" data-testid={`${testid}-unread`}>{unread > 9 ? '9+' : unread}</span>}
          </button>
        </>
      )}
    </div>
  );
}

export function ChatLine({ m, mine, dark = true }: { m: PlanetChatMsg; mine: boolean; dark?: boolean }) {
  const who = mine ? 'You' : `@${m.player.username}`;
  if (m.kind === 'join' || m.kind === 'leave') {
    return <div className={cn('text-[12px] italic', dark ? 'text-white/55' : 'text-muted')} data-testid="chat-line-system">{m.kind === 'join' ? '👋' : '🚪'} {who} {m.body}</div>;
  }
  return (
    <div className="break-words" data-testid="chat-line">
      <b style={{ color: mine ? (dark ? '#FFE36B' : 'var(--gold)') : m.player.accent_color ?? '#9FD3FF' }}>{who}</b>{' '}
      <span className={dark ? 'text-white/90' : 'text-fg'}>{m.body}</span>
    </div>
  );
}
