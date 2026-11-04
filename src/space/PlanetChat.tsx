// Group chat for your live group (up to 10) on a world: a small chat box on screen, and every message
// pops up as a speech bubble over the explorer who said it. Messages arrive instantly over the group's
// live channel, and a light fetch every few seconds catches anything missed.
import { MessageCircle, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PlanetChatMsg } from '../backend/types';
import { cn } from '../lib/utils';
import type { PlanetScene } from './planet3d';

export function usePlanetChat(world: string, myId: string | undefined, enabled: boolean, scene: { current: PlanetScene | null }) {
  const [msgs, setMsgs] = useState<PlanetChatMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const last = useRef(0);
  const seen = useRef(new Set<number>());
  const first = useRef(true);
  const open = useRef(false);
  const sendRef = useRef<((m: unknown) => void) | null>(null);

  const add = useCallback((list: PlanetChatMsg[], bubbles: boolean) => {
    const fresh = list.filter((m) => m && typeof m.id === 'number' && !seen.current.has(m.id) && typeof m.body === 'string' && m.player?.id);
    if (!fresh.length) return;
    for (const m of fresh) {
      seen.current.add(m.id); last.current = Math.max(last.current, m.id);
      if (bubbles) scene.current?.say(m.player.id === myId ? 'me' : m.player.id, m.body);
    }
    setMsgs((cur) => [...cur, ...fresh].sort((a, b) => a.id - b.id).slice(-40));
    if (!open.current) setUnread((u) => u + fresh.filter((m) => m.player.id !== myId).length);
  }, [scene, myId]);

  useEffect(() => { setMsgs([]); setUnread(0); last.current = 0; seen.current = new Set(); first.current = true; }, [world]);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await api.planetChatList(world, last.current);
        if (stop) return;
        // the backlog when you arrive goes in the box, without a cloud of old bubbles
        add(r.items, !first.current); first.current = false;
      } catch { /* next time */ }
    };
    void tick();
    const t = setInterval(tick, 6000);
    return () => { stop = true; clearInterval(t); };
  }, [enabled, world, add]);

  const send = useCallback(async (body: string) => {
    const m = await api.planetChatSend(world, body);
    add([m], true);
    sendRef.current?.({ t: 'chat', id: myId, m });
    return m;
  }, [world, myId, add]);

  return {
    msgs, unread, send, sendRef,
    onChat: (m: unknown) => add([m as PlanetChatMsg], true),
    setOpen: (o: boolean) => { open.current = o; if (o) setUnread(0); },
  };
}

export function PlanetChatBox({ chat, myId, className }: { chat: ReturnType<typeof usePlanetChat>; myId?: string; className?: string }) {
  const [open, setOpenState] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const setOpen = (o: boolean) => { setOpenState(o); chat.setOpen(o); if (o) setTimeout(() => input.current?.focus(), 50); };
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 2000); return () => clearInterval(t); }, []);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [chat.msgs.length, open]);
  const submit = async () => {
    const b = text.trim(); if (!b || busy) return;
    setBusy(true);
    try { await chat.send(b); setText(''); }
    catch (e) { toast.error(toGameError(e).code === 'not_in_group' ? 'Join a group first — walk around for a moment.' : toGameError(e).message); }
    finally { setBusy(false); input.current?.focus(); }
  };
  // closed: the last few lines float on screen for a little while
  const recent = chat.msgs.filter((m) => now - new Date(m.at).getTime() < 15000).slice(-3);
  return (
    <div className={cn('pointer-events-none flex w-[min(68vw,300px)] flex-col items-start gap-1.5', className)} data-testid="planet-chat">
      {open ? (
        <div className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-white/10 bg-black/65 text-white shadow-xl backdrop-blur">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/70">
            <MessageCircle className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Group chat <span className="font-semibold normal-case tracking-normal text-white/45">· your group</span></span>
            <button className="ml-auto rounded-lg p-1 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close chat" data-testid="planet-chat-close"><X className="h-4 w-4" /></button>
          </div>
          <div ref={list} className="grid max-h-44 gap-1 overflow-y-auto px-3 py-2 text-[13px] scroll-thin" data-testid="planet-chat-log">
            {!chat.msgs.length && <div className="py-2 text-center text-xs text-white/55">Say hi to your group 👋</div>}
            {chat.msgs.map((m) => <Line key={m.id} m={m} mine={m.player.id === myId} />)}
          </div>
          <form className="flex items-center gap-1.5 border-t border-white/10 p-1.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value.slice(0, 140))} maxLength={140} placeholder="Message your group…" enterKeyHint="send"
              className="h-9 min-w-0 flex-1 rounded-xl bg-white/10 px-3 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-[#7B5CFF]" data-testid="planet-chat-input"
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} />
            <button type="submit" disabled={!text.trim() || busy} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7B5CFF] disabled:opacity-40" aria-label="Send" data-testid="planet-chat-send"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      ) : (
        <>
          {recent.map((m) => (
            <div key={m.id} className="max-w-full rounded-2xl bg-black/55 px-2.5 py-1 text-[12px] text-white backdrop-blur animate-[lv-fade-in_.25s_ease-out]"><Line m={m} mine={m.player.id === myId} /></div>
          ))}
          <button className="pointer-events-auto relative flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white backdrop-blur hover:bg-black/70" onClick={() => setOpen(true)} data-testid="planet-chat-open">
            <MessageCircle className="h-4 w-4" /> Chat
            {chat.unread > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-hot px-1 text-center text-[10px] leading-[18px] text-white tnum">{chat.unread > 9 ? '9+' : chat.unread}</span>}
          </button>
        </>
      )}
    </div>
  );
}

function Line({ m, mine }: { m: PlanetChatMsg; mine: boolean }) {
  return (
    <div className="break-words">
      <b style={{ color: mine ? '#FFE36B' : m.player.accent_color ?? '#9FD3FF' }}>{mine ? 'You' : `@${m.player.username}`}</b> <span className="text-white/90">{m.body}</span>
    </div>
  );
}
