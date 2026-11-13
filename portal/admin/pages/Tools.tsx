// The game's own admin tools, moved here from inside the game. Same screens, same server checks.
import type { ReactNode } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Cashouts, Earnings, Flags, Plots, ReviewTab, ShopAdmin, SocialAdmin, System, World } from '../../../src/admin/AdminScreen';
import { IntegrityAdmin } from '../../../src/admin/IntegrityAdmin';
import { SupportAdmin, UpdatesAdmin } from '../../../src/admin/UpdatesSupportAdmin';
import { ChallengesAdmin } from '../../../src/admin/EarnAdmin';
import { AllRollGrants } from '../../../src/admin/RollGrants';
import { PageHeader, Panel } from '../../shared/ui';

const TOOLS: Record<string, { title: string; sub: string; el: () => ReactNode }> = {
  review: { title: 'Art review', sub: 'Approve or reject artwork before it goes on the map, and handle reports.', el: () => <ReviewTab /> },
  integrity: { title: 'Fair play', sub: 'Risk scores, linked accounts and actions against cheating and multi-accounting.', el: () => <IntegrityAdmin /> },
  support: { title: 'Support', sub: 'Players’ tickets and your replies.', el: () => <SupportAdmin /> },
  social: { title: 'Chat & social', sub: 'Chat moderation, bans shown to players, invites and friendships.', el: () => <SocialAdmin /> },
  earnings: { title: 'Rates & rarities', sub: 'Every way to earn, rarity odds and USD rates, plot prices, boosts and enchantments.', el: () => <Earnings /> },
  shop: { title: 'Shop', sub: 'What the shop sells and for how much.', el: () => <ShopAdmin /> },
  cashouts: { title: 'Cash-outs', sub: 'Requests to withdraw USD rent: approve, decline or mark paid.', el: () => <Cashouts /> },
  plots: { title: 'Plot tools', sub: 'Look up any plot, change rarity, take or give plots, and grant guaranteed rolls.', el: () => <><Plots /><Panel className="mt-3" title="Every guaranteed roll"><AllRollGrants /></Panel></> },
  world: { title: 'World & events', sub: 'World settings, events and the map.', el: () => <World /> },
  challenges: { title: 'Challenges', sub: 'Weekly art challenges: themes, dates and prizes.', el: () => <ChallengesAdmin /> },
  updates: { title: 'Updates', sub: 'What’s-new posts and announcements players see in the game.', el: () => <UpdatesAdmin /> },
  switches: { title: 'Switches', sub: 'Turn whole features on or off for everyone.', el: () => <Flags /> },
  system: { title: 'System health', sub: 'Render jobs, client errors and the minigame review queue.', el: () => <System /> },
};

export default function Tool() {
  const { tool = '' } = useParams();
  const t = TOOLS[tool];
  if (!t) return <Navigate to="/" replace />;
  return (
    <>
      <PageHeader title={t.title} sub={t.sub} />
      <div className="max-w-[1400px]">{t.el()}</div>
    </>
  );
}
