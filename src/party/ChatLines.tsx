// A chat line, in every chat box: a small face, the name in the colour of their rarest plot (or the one they show off),
// what they said — and, in the global chat, the little quote of what it answers. Tap a face or a name for a peek at the
// player; tap a stranger's line for Reply, Report and Block. Lines that answer you stand out.
import { CornerUpLeft, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ChatReply, PlanetChatMsg, Profile } from '../backend/types';
import { cn } from '../lib/utils';
import { nameStyle, nameTitle } from '../social/nameColor';
import { openPeek } from '../social/peek';
import { PlayerAvatar } from '../ui';

type LineActs = {
  /** the line can be answered (the global chat) */ onReply?(): void;
  /** they were blocked from their peek */ onBlocked?(id: string): void;
  /** tap the quote: show the line it answers */ onQuote?(id: number): void;
};

/** a chat line (yours or anyone's) */
export function ChatLine({ m, mine, dark = true, myId, onReply, onBlocked, onQuote }: { m: PlanetChatMsg; mine: boolean; dark?: boolean; myId?: string } & LineActs) {
  const who = mine ? 'You' : `@${m.player.username}`;
  if (m.kind === 'join' || m.kind === 'leave') {
    return <div className={cn('text-[12px] italic', dark ? 'text-white/55' : 'text-muted')} data-testid="chat-line-system">{m.kind === 'join' ? '👋' : '🚪'} {who} {m.body}</div>;
  }
  const bg = dark ? 'dark' : 'page';
  const toMe = !mine && !!myId && m.reply?.player?.id === myId;
  const peek = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    openPeek(m.player, e.currentTarget, { message: mine ? undefined : { id: m.id, body: m.body }, onReply: mine ? undefined : onReply, onBlocked });
  };
  const nameCss = mine && !m.player.name_rarity ? { color: dark ? '#FFE36B' : 'var(--gold)' } : nameStyle(m.player, bg);
  return (
    <div className={cn('flex min-w-0 items-start gap-1.5 break-words', toMe && 'lv-chat-to-me -mx-1 rounded-lg px-1')}
      style={toMe ? { background: 'rgba(255, 210, 63, 0.10)', boxShadow: 'inset 2px 0 0 rgba(255, 210, 63, 0.75)' } : undefined}
      data-testid="chat-line" data-msg={m.id} data-reply-to={m.reply?.id} data-to-me={toMe || undefined}>
      <button type="button" className="mt-[1px] shrink-0 rounded-full" onClick={peek} aria-label={`A peek at @${m.player.username}`} data-testid="chat-avatar">
        <PlayerAvatar p={m.player} size={18} />
      </button>
      <div className="min-w-0 flex-1 leading-snug">
        {m.reply && <ReplyQuote r={m.reply} dark={dark} myId={myId} onTap={onQuote} />}
        <button type="button" className="font-bold hover:underline" style={nameCss} title={nameTitle(m.player)} onClick={peek} data-testid="chat-name" data-name-rarity={m.player.name_rarity ?? undefined}>{who}</button>{' '}
        <span className={dark ? 'text-white/90' : 'text-fg'}>{m.body}</span>
      </div>
    </div>
  );
}

/** a line from someone else in a chat with strangers (the global chat): tap it for Reply, Report or Block */
export function StrangerLine({ m, open, onTap, onDone, onBlocked, testid, dark = true, myId, onReply, onQuote }: {
  m: PlanetChatMsg; open: boolean; onTap(): void; onDone(): void; onLeave?(): void; onBlocked(id: string): void; testid: string; dark?: boolean; myId?: string;
  onReply?(): void; onQuote?(id: number): void;
}) {
  const chip = dark ? 'bg-white/10 hover:bg-white/20' : 'bg-surface-2 hover:bg-surface-3';
  return (
    <div>
      <div role="button" tabIndex={0} className={cn('w-full cursor-pointer rounded-md text-left', dark ? 'hover:bg-white/5' : 'hover:bg-surface-2/60')} onClick={onTap}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onTap(); } }} data-testid={`${testid}-line`}>
        <ChatLine m={m} mine={false} dark={dark} myId={myId} onReply={onReply} onBlocked={onBlocked} onQuote={onQuote} />
      </div>
      {open && (
        <div className="mt-0.5 flex gap-1 pb-1 pl-6 text-[11px] font-bold" data-testid={`${testid}-line-menu`}>
          {onReply && <button className={cn('flex items-center gap-1 rounded-lg px-2 py-0.5', chip)} data-testid={`${testid}-reply`} onClick={() => { onDone(); onReply(); }}><CornerUpLeft className="h-3 w-3" /> Reply</button>}
          <button className={cn('rounded-lg px-2 py-0.5', chip)} data-testid={`${testid}-report`} onClick={async () => {
            onDone();
            try { await api.reportChat(m.id, 'inappropriate'); toast.success('Thanks — a moderator will take a look'); } catch (e) { toast.error(toGameError(e).message); }
          }}>Report</button>
          <button className="rounded-lg bg-[#FF3D6E]/25 px-2 py-0.5 text-[#FF3D6E] hover:bg-[#FF3D6E]/40" data-testid={`${testid}-block`} onClick={async () => {
            onDone();
            try { await api.blockPlayer(m.player.id, true); onBlocked(m.player.id); toast.success(`@${m.player.username} is blocked — you won’t see them any more`); } catch (e) { toast.error(toGameError(e).message); }
          }}>Block</button>
        </div>
      )}
    </div>
  );
}

/** the little quote of what a reply answers (tap it to find that line) */
export function ReplyQuote({ r, dark = true, myId, onTap }: { r: ChatReply; dark?: boolean; myId?: string; onTap?(id: number): void }) {
  const text = r.gone ? 'a message that was removed' : r.hidden ? 'someone you blocked' : r.body;
  const you = !!myId && r.player?.id === myId;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onTap?.(r.id); }} data-testid="chat-reply-quote" data-reply-to={r.id}
      className={cn('mb-0.5 flex w-fit max-w-full items-center gap-1 rounded-md border-l-2 py-px pl-1.5 pr-1.5 text-left text-[11px] leading-tight',
        dark ? 'border-white/35 bg-white/[0.06] text-white/65' : 'border-line-strong bg-surface-2/70 text-muted', (r.gone || r.hidden) && 'italic')}>
      <CornerUpLeft className="h-3 w-3 shrink-0 opacity-70" />
      {r.player && !r.gone && !r.hidden && <b className="shrink-0" style={nameStyle(r.player, dark ? 'dark' : 'page')}>{you ? 'you' : `@${r.player.username}`}</b>}
      <span className="min-w-0 truncate">{text}</span>
    </button>
  );
}

/** over the box you type in: who you're answering (× to stop) */
export function ReplyBar({ m, dark = true, onCancel, testid }: { m: { player: Profile; body: string }; dark?: boolean; onCancel(): void; testid: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 border-t px-2.5 py-1 text-[11.5px]', dark ? 'border-white/10 bg-white/[0.04] text-white/70' : 'border-line bg-surface-2/60 text-muted')} data-testid={`${testid}-replying`}>
      <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-[#9F8BFF]" />
      <span className="shrink-0">Replying to</span>
      <b className="shrink-0" style={nameStyle(m.player, dark ? 'dark' : 'page')}>@{m.player.username}</b>
      <span className="min-w-0 flex-1 truncate opacity-80">{m.body}</span>
      <button type="button" className={cn('shrink-0 rounded-md p-0.5', dark ? 'hover:bg-white/10' : 'hover:bg-surface-3')} onClick={onCancel} aria-label="Stop replying" data-testid={`${testid}-reply-cancel`}><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

/** find a line in a chat list and make it glow for a moment (tapping a reply's quote) */
export function flashLine(list: HTMLElement | null, id: number) {
  const el = list?.querySelector<HTMLElement>(`[data-msg="${id}"]`);
  if (!el) { toast('That message is further back than this chat shows', { duration: 1800 }); return; }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('lv-chat-flash'); void el.offsetWidth; el.classList.add('lv-chat-flash');
  setTimeout(() => el.classList.remove('lv-chat-flash'), 1300);
}
