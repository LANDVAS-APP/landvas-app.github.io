// The app's HUD: your avatar and level, live USD rent, Ink and the bell. It sits over the map (with the boost next
// to your Ink) and at the top of the Play hub; other screens are full screen without it.
import { ChevronLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { LiveUsd, WalletDialog, useRent } from '../rent/RentHud';
import { CurrencyIcon, PlayerAvatar } from '../ui';
import { NotificationBell } from '../updates/Notifications';
import { goBack, isRootPage } from './Shell';

export default function GameHud({ children, overlay, after }: { children?: ReactNode; overlay?: boolean; after?: ReactNode }) {
  const me = useOnboardedMe();
  const { rent, offset } = useRent();
  const [wallet, setWallet] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const deep = !isRootPage(loc.pathname);
  return (
    <div className={cn(overlay ? 'lv-hudbar-clear pointer-events-none' : 'relative')} data-testid="game-hud">
      <div className={cn('flex items-center gap-2 pb-2 pt-[max(10px,env(safe-area-inset-top,0px))] [&>*]:pointer-events-auto', overlay ? 'pl-[max(12px,env(safe-area-inset-left,0px))] pr-[max(12px,env(safe-area-inset-right,0px))]' : 'px-0.5')}>
        {deep && (
          <button className="lv-gbtn round !h-10 !w-10 shrink-0" onClick={() => goBack(nav as (to: string | number) => void, loc.pathname)} aria-label="Back" data-testid="hud-back">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {me ? (
          <Link to="/me" className="relative shrink-0" aria-label="Your profile">
            <span className="lv-hud-avatar block"><PlayerAvatar p={me.profile} size={40} className="!rounded-[15px]" /></span>
            <span className="lv-hud-level" aria-label={`Level ${me.artist_level}`}>{me.artist_level}</span>
          </Link>
        ) : (
          <Link to="/welcome" className="lv-gbtn on h-10 px-4 text-sm">Play</Link>
        )}
        {me && rent && (
          <button className="lv-hud min-w-0 shrink" onClick={() => setWallet(true)} data-testid="hud-rent" aria-label="USD rent">
            <CurrencyIcon kind="usd" />
            <LiveUsd rent={rent} offset={offset} decimals={typeof innerWidth === 'number' && innerWidth < 370 ? 4 : overlay ? 5 : 6} className="truncate tnum" />
          </button>
        )}
        {me && (
          <Link to="/play" className="lv-hud shrink-0" aria-label="Ink — win minigames to earn more" data-testid="hud-ink">
            <CurrencyIcon kind="ink" />
            <span className="tnum">{fmt(Math.floor(Number(me.balances.ink ?? 0)))}</span>
          </Link>
        )}
        {after}
        <div className="flex-1 !pointer-events-none" />
        <NotificationBell size="sm" className="lv-gbtn round !h-10 !w-10" />
      </div>
      {children}
      <WalletDialog open={wallet} onOpenChange={setWallet} />
    </div>
  );
}

