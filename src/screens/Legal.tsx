// Draft policies. They are written in plain language for players and MUST be
// reviewed by a qualified lawyer before LANDVAS pays out any money.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page, PageHeader } from '../app/Shell';
import { useWorld } from '../lib/queries';
import { formatRate } from '../shared/rent';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { Button, Field, inputCls } from '../ui';

const DOCS: Record<string, string> = { terms: 'Terms of Service', privacy: 'Privacy Policy', content: 'Content Policy', copyright: 'Copyright & takedowns', rent: 'USD rent rules' };

function Draft() {
  return <p className="mb-6 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-sm">Draft — this document has not yet been reviewed by a lawyer and may change.</p>;
}
function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 font-display text-lg font-semibold">{children}</h2>;
}

export default function Legal() {
  const { doc = 'terms' } = useParams();
  const world = useWorld();
  const legal = world.data?.legal;
  return (
    <Page>
      <PageHeader eyebrow="LANDVAS" title={DOCS[doc] ?? 'Legal'} />
      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {Object.entries(DOCS).map(([k, v]) => <Link key={k} to={`/legal/${k}`} className={k === doc ? 'font-bold text-fg' : 'text-accent-2 hover:underline'}>{v}</Link>)}
      </nav>
      <article className="glass max-w-3xl rounded-3xl p-6 text-[15px] leading-relaxed text-muted [&_b]:text-fg [&_li]:mb-1 [&_ul]:list-disc [&_ul]:pl-5">
        <Draft />
        {doc === 'terms' && (
          <>
            <p>Welcome to LANDVAS, a game where you claim squares of a world map, win minigames and paint murals others can see. By creating an account you agree to these terms.</p>
            <H>Plots are game items, not land</H>
            <p>A plot is a square on our game map. <b>It is not ownership of, or any right to, real geographic land.</b> We may change, lock or remove plots to keep the game fair and safe.</p>
            <H>Currencies</H>
            <ul>
              <li><b>Ink</b> is earned only by winning plot minigames and is the only way to get more plots. Ink can't be bought, sold, transferred or cashed out.</li>
              <li>Pigments, XP (Brush Points) and Gallery Tokens unlock tools and cosmetics and have no cash value.</li>
              <li><b>USD rent</b> accrues to your account for the plots you own, under the separate <Link to="/legal/rent" className="text-accent-2">USD rent rules</Link>.</li>
            </ul>
            <H>Fair play</H>
            <ul>
              <li>One account per person. No bots, scripts, emulators, GPS spoofing or exploits. Minigame results are checked on our servers.</li>
              <li>We may suspend accounts, void rewards and reverse rent earned through cheating or abuse.</li>
            </ul>
            <H>Your artwork</H>
            <p>You keep the copyright in what you create. You give LANDVAS a worldwide, non-exclusive, royalty-free licence to display, store, resize and distribute it as part of the game and to promote the game. Only publish work you made or have the right to use. See the <Link to="/legal/content" className="text-accent-2">Content Policy</Link>.</p>
            <H>No warranty</H>
            <p>LANDVAS is provided as is. We may change or end features, including rent rates. To the extent the law allows, our liability is limited to the amount you paid us in the previous 12 months.</p>
            <H>Contact</H>
            <p>Message the team from <Link to="/support" className="text-accent-2">Support</Link> in the app. We don’t publish email addresses.</p>
          </>
        )}
        {doc === 'privacy' && (
          <>
            <H>What we collect</H>
            <ul>
              <li>Your email address and password (stored by our authentication provider) and the profile you choose.</li>
              <li><b>Location:</b> if you turn on GPS, your device's position is sent to place your explorer. We keep only your latest position, use it to decide which plots you can claim, and to detect impossible jumps. <b>It is never shown to other players.</b> LANDVAS needs GPS to place and move your explorer; there is no teleporting.</li>
              <li>Game activity: plots, minigame results, artwork, rent ledger, reports and support requests.</li>
            </ul>
            <H>What others can see</H>
            <p>Your username, avatar, the plots you own, your published artwork and leaderboard positions. Your plots are visible on the shared map, but your profile, artwork pages, visit room, the gallery and the feed never show where they are.</p>
            <H>How long we keep it</H>
            <p>While your account exists, plus the time needed for legal, tax or fraud-prevention reasons. Ask us to delete your account with a <Link to="/support?new=1&category=privacy" className="text-accent-2">privacy support ticket</Link>.</p>
            <H>Artwork metadata</H>
            <p>We re-encode every uploaded image and strip metadata such as camera location before it is published.</p>
          </>
        )}
        {doc === 'content' && (
          <>
            <p>LANDVAS is a shared world map seen by people of all ages. Published art is screened and may be reviewed by moderators.</p>
            <H>Not allowed</H>
            <ul>
              <li>Sexual content, graphic violence, gore, or content that sexualises minors (reported to authorities).</li>
              <li>Hate, harassment, threats, or targeting real people.</li>
              <li>Personal information (addresses, phone numbers, faces of private people without consent).</li>
              <li>Work you don't own or have permission to use, including logos and characters.</li>
              <li>Spam, scams, advertising or links.</li>
            </ul>
            <H>Enforcement</H>
            <p>We can remove art, restore a plot's previous artwork, issue strikes, suspend or ban accounts. Repeat infringers lose their accounts. You can appeal a decision from your canvas page.</p>
          </>
        )}
        {doc === 'copyright' && <CopyrightPage />}
        {doc === 'rent' && (
          <>
            <p>Every plot you own earns <b>USD rent</b> for every second you own it, at its rarity's current rate:</p>
            <ul>
              {RARITY_ORDER.map((r) => <li key={r}><b>{rarityInfo(r).name}</b> — {formatRate(rarityInfo(r).usd_per_second)} ({(rarityInfo(r).weight / 10).toFixed(0)}% of plots)</li>)}
            </ul>
            <ul>
              <li>Each plot level adds 1% to that plot's rent.</li>
              <li>The <b>{world.data?.rent?.boost?.multiplier ?? 20}× boost</b> multiplies all your rent while active. Each press adds {world.data?.rent?.boost?.minutes_per_boost ?? 30} minutes (up to {world.data?.rent?.boost?.max_stack_hours ?? 8} hours stacked); you get {world.data?.rent?.boost?.free_per_day ?? 6} free presses per day.</li>
              <li>Rent keeps accruing while you open LANDVAS at least once every {world.data?.rent?.max_offline_days ?? 30} days.</li>
              <li><b>Plots can never be bought with money.</b> They cost Ink, which you earn by winning minigames. No purchase is necessary to play or to earn rent.</li>
              <li>Rates are set by LANDVAS and may change at any time. They are not a promise of future earnings, and owning plots is not an investment.</li>
              <li><b>Cash-out</b> is not available yet. When it opens, payouts will require a minimum balance (currently ${world.data?.rent?.cashout?.minimum_usd ?? 5}), identity and fraud checks, and may be limited by country. Balances earned by cheating, multiple accounts or GPS spoofing will be removed.</li>
            </ul>
          </>
        )}
      </article>
    </Page>
  );
}

function CopyrightPage() {
  const [f, setF] = useState({ publicationId: '', name: '', email: '', work: '', signature: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <p>If a LANDVAS artwork copies work you own, send us a notice below and we will review it promptly. Signed in? You can also open a <Link to="/support?new=1&category=copyright" className="text-accent-2">copyright support ticket</Link>.</p>
      <form className="mt-4 grid gap-3" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const id = f.publicationId.trim().split('/').pop() ?? '';
          await api.submitCopyrightClaim({ publicationId: id, name: f.name, email: f.email, work: f.work, signature: f.signature });
          toast.success('Notice received — we will review it and reply by email');
          setF({ publicationId: '', name: '', email: '', work: '', signature: '' });
        } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(false); }
      }}>
        <Field label="Link to the LANDVAS artwork" htmlFor="cp-id"><input id="cp-id" className={inputCls} required value={f.publicationId} onChange={set('publicationId')} placeholder="https://…/art/…" /></Field>
        <Field label="Your full name" htmlFor="cp-name"><input id="cp-name" className={inputCls} required value={f.name} onChange={set('name')} /></Field>
        <Field label="Your email" htmlFor="cp-email"><input id="cp-email" type="email" className={inputCls} required value={f.email} onChange={set('email')} /></Field>
        <Field label="Describe your original work" htmlFor="cp-work"><textarea id="cp-work" className={`${inputCls} h-24 py-2`} required value={f.work} onChange={set('work')} /></Field>
        <Field label="Signature (type your full name)" hint="By signing you state in good faith that the use is not authorised and that this notice is accurate." htmlFor="cp-sig"><input id="cp-sig" className={inputCls} required value={f.signature} onChange={set('signature')} /></Field>
        <Button type="submit" variant="primary" loading={busy} className="justify-self-start">Send notice</Button>
      </form>
    </>
  );
}
