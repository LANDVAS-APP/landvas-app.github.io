// LANDVAS's legal documents, in plain language for players: Terms of Service, Privacy Policy, Content Policy,
// copyright notices, the USD rent rules and how to delete an account. Operator: LANDVAS LLC (Utah).
// When the Terms or the Privacy Policy change materially, bump terms_version / privacy_version in the `legal`
// game config (a migration) and update UPDATED below: every player is asked to accept the new version.
// Get a lawyer's review of the rent rules (and these terms) before cash-out is switched on.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page, PageHeader } from '../app/Shell';
import { useWorld } from '../lib/queries';
import { formatRate } from '../shared/rent';
import { RARITY_ORDER, rarityInfo, rarityOdds } from '../shared/rarity';
import { Button, Field, inputCls } from '../ui';
import { SUPPORT_EMAIL } from '../brand';

const DOCS: Record<string, string> = { terms: 'Terms of Service', privacy: 'Privacy Policy', content: 'Content Policy', copyright: 'Copyright & takedowns', rent: 'USD rent rules', 'delete-account': 'Delete your account' };
const UPDATED = 'November 12, 2026';
const COMPANY = 'LANDVAS LLC';

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 font-display text-lg font-semibold">{children}</h2>;
}
const Mail = ({ subject }: { subject?: string }) => <a href={`mailto:${SUPPORT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`} className="text-accent-2">{SUPPORT_EMAIL}</a>;

export default function Legal() {
  const { doc = 'terms' } = useParams();
  const world = useWorld();
  return (
    <Page>
      <PageHeader eyebrow="LANDVAS" title={DOCS[doc] ?? 'Legal'} />
      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {Object.entries(DOCS).map(([k, v]) => <Link key={k} to={`/legal/${k}`} className={k === doc ? 'font-bold text-fg' : 'text-accent-2 hover:underline'}>{v}</Link>)}
      </nav>
      <article className="selectable glass max-w-3xl rounded-3xl p-6 text-[15px] leading-relaxed text-muted [&_b]:text-fg [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" data-testid="legal-doc">
        {doc !== 'delete-account' && <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-faint" data-testid="legal-updated">Last updated {UPDATED}</p>}
        {doc === 'terms' && (
          <>
            <p>These Terms of Service ("Terms") are an agreement between you and <b>{COMPANY}</b>, a Utah limited liability company ("LANDVAS", "we", "us"), and cover the LANDVAS game on the web at landvas.app and in the LANDVAS apps for iOS and Android (together, the "Game"). By creating an account or playing, you agree to these Terms, our <Link to="/legal/privacy" className="text-accent-2">Privacy Policy</Link> and our <Link to="/legal/content" className="text-accent-2">Content Policy</Link>. If you don't agree, please don't use the Game.</p>

            <H>1. Who can play</H>
            <ul>
              <li>You must be at least <b>13 years old</b>. If you are under 18 (or the age of majority where you live), you need a parent or guardian's permission, and they agree to these Terms for you.</li>
              <li>One account per person. Your account is personal: don't share, sell or transfer it, and keep your password safe. You're responsible for what happens on your account.</li>
              <li>You can't use the Game if you are barred by law, including if you are in a country under US embargo or on a US government list of restricted parties.</li>
            </ul>

            <H>2. Plots are game items, not land</H>
            <p>A plot is a square on our game map. <b>It is not ownership of, or any right to, real geographic land or property</b>, and it gives you no rights over the real place it sits on. We may change, move, lock or remove plots and the map to keep the Game fair, safe and working.</p>

            <H>3. Virtual items and currencies</H>
            <ul>
              <li><b>Ink</b>, Pigments, Brush Points (XP), Gallery Tokens, plots, creatures, outfits and every other in-game item are earned by playing. We give you a limited, personal, revocable licence to use them in the Game. You don't own them.</li>
              <li>They have <b>no cash value</b>, can't be exchanged for money or anything outside the Game, and can't be sold, traded or transferred outside the features we provide. Buying, selling or trading accounts or items for real money is not allowed.</li>
              <li>There are no in-app purchases: nothing in LANDVAS is sold for money. Chance-based features (such as plot rarity rolls and the daily wheel) are free game rewards, and plot rarity odds are published in the Game.</li>
              <li>We may change, rebalance or remove items, rates and features, and we may correct balances that are wrong because of a bug or an abuse.</li>
            </ul>

            <H>4. USD rent</H>
            <p>Plots you own build up a <b>USD rent</b> balance under the separate <Link to="/legal/rent" className="text-accent-2">USD rent rules</Link>, which are part of these Terms. Rent is a game reward, not wages, interest, an investment or a promise of future earnings. <b>A rent balance has no cash value and is not your property unless and until it is actually paid out</b> through a cash-out feature, if and when we offer one, under the rules in force at that time. Cash-out is not available yet. We may change rates or end the rent feature, and balances earned by breaking these Terms will be removed.</p>

            <H>5. Optional rewarded ads</H>
            <p>Some versions of the apps may offer an optional ad you can choose to watch for an in-game bonus. Watching is never required to play. Bonuses are given only when the ad network confirms the ad was watched.</p>

            <H>6. Your content</H>
            <ul>
              <li>Your artwork, creatures, names, profile, chat messages and everything else you create or post ("Your Content") stay yours. You give {COMPANY} a worldwide, non-exclusive, royalty-free licence to host, store, copy, display, resize, adapt (for example into map tiles, thumbnails and share images) and distribute Your Content as part of the Game and to promote the Game. This licence ends when you delete the content or your account, except for copies other players already shared, backups kept for a limited time, and content we must keep by law.</li>
              <li>Only post content you made or have the right to use, and that follows the <Link to="/legal/content" className="text-accent-2">Content Policy</Link>. <b>We have no tolerance for objectionable content or abusive users.</b> Content is filtered and can be reported, and we may review, hide or remove any content and act against accounts that break the rules.</li>
              <li>If you send us ideas or feedback, we may use them without owing you anything.</li>
            </ul>

            <H>7. Fair play</H>
            <p>Don't cheat or harm the Game or other players. In particular, don't:</p>
            <ul>
              <li>use more than one account, bots, scripts, macros, emulators, modified apps, or automation;</li>
              <li>fake your location (GPS spoofing) or exploit bugs — report them to us instead;</li>
              <li>collude, farm, self-refer or trade accounts or items for money;</li>
              <li>harass, threaten, scam or impersonate anyone, or share someone's personal information;</li>
              <li>reverse engineer, scrape, overload or interfere with the Game or its servers, except where the law allows it.</li>
            </ul>

            <H>8. Play safely</H>
            <p>LANDVAS can use your real location. <b>Stay aware of your surroundings.</b> Don't play while driving or cycling, don't enter private property or places you're not allowed to be, and don't put yourself or others at risk to claim a plot. You can play without sharing your location in Simple mode.</p>

            <H>9. Suspension and termination</H>
            <p>You can stop playing and <Link to="/legal/delete-account" className="text-accent-2">delete your account</Link> at any time. We may warn, restrict, suspend or close accounts, and remove items, plots and balances, if you break these Terms, if the law requires it, or to protect players and the Game. Where we can, we'll tell you why, and you can appeal through <Link to="/support" className="text-accent-2">Support</Link>. We may change, pause or end the Game or any part of it; if we shut the Game down entirely, we'll give notice in the Game first.</p>

            <H>10. Disclaimers</H>
            <p>The Game is provided <b>"as is" and "as available"</b>. To the fullest extent the law allows, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement, and we don't promise the Game will be uninterrupted, error-free or that data won't be lost. Map data comes from third parties and may be inaccurate.</p>

            <H>11. Limitation of liability</H>
            <p>To the fullest extent the law allows, {COMPANY} and its members, managers and contractors won't be liable for any indirect, incidental, special, consequential or punitive damages, or for lost profits, data, goodwill or virtual items, arising from the Game. Our total liability for any claim relating to the Game is limited to the greater of the amount you paid us in the 12 months before the claim or US $50. Some places don't allow these limits, so they apply only as far as your local law permits.</p>

            <H>12. Indemnity</H>
            <p>If you break these Terms or the law, or Your Content infringes someone's rights, you agree to cover the reasonable costs of claims brought against {COMPANY} because of it, as far as the law allows.</p>

            <H>13. Governing law and disputes</H>
            <p>These Terms are governed by the laws of the <b>State of Utah</b> and applicable US federal law, without regard to conflict-of-law rules. Before filing a claim, please contact us at <Mail subject="LANDVAS dispute" /> so we can try to resolve it informally within 30 days. Any dispute that can't be resolved will be heard only in the state or federal courts located in Utah, and you and we consent to their jurisdiction. Nothing here takes away rights you have under the mandatory consumer laws of the country where you live.</p>

            <H>14. App stores</H>
            <p>If you got LANDVAS from the Apple App Store:</p>
            <ol>
              <li>These Terms are between you and {COMPANY} only, not Apple. {COMPANY}, not Apple, is solely responsible for the app and its content.</li>
              <li>Your licence to the app is non-transferable and lets you use it on Apple-branded devices you own or control, as allowed by the App Store Usage Rules (including through Family Sharing).</li>
              <li>Apple has no obligation to provide maintenance or support for the app.</li>
              <li>If the app fails to conform to any applicable warranty, you may notify Apple and Apple will refund the purchase price (if any); to the maximum extent permitted by law, Apple has no other warranty obligation for the app.</li>
              <li>{COMPANY}, not Apple, is responsible for addressing any claims about the app, including product liability claims, claims that it fails to meet legal or regulatory requirements, consumer-protection or privacy claims, and claims that it infringes someone's intellectual property.</li>
              <li>You must comply with any third-party terms that apply when you use the app (for example, your mobile carrier's).</li>
              <li>Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.</li>
            </ol>
            <p>If you got LANDVAS from Google Play, Google Play's terms also apply to the download, and Google is not responsible for the Game.</p>

            <H>15. Changes to these Terms</H>
            <p>We may update these Terms. If a change is material, we'll tell you in the Game and ask you to accept the new version before you keep playing. The date at the top shows the latest version.</p>

            <H>16. Other terms</H>
            <p>If any part of these Terms can't be enforced, the rest still applies. If we don't enforce a term right away, we don't give up the right to later. You may not transfer these Terms; we may transfer them to a company that takes over the Game. These Terms, together with the policies they mention, are the whole agreement between you and us about the Game.</p>

            <H>17. Contact</H>
            <p>{COMPANY} · <Mail /> · or message the team from <Link to="/support" className="text-accent-2">Support</Link> in the Game.</p>
          </>
        )}
        {doc === 'privacy' && (
          <>
            <p>This Privacy Policy explains what personal information <b>{COMPANY}</b> ("LANDVAS", "we", "us") collects when you play LANDVAS on the web or in our iOS and Android apps, how we use it, who we share it with, and the choices and rights you have. Questions: <Mail subject="LANDVAS privacy" />.</p>

            <H>What we collect</H>
            <ul>
              <li><b>Account:</b> your email address and password (the password is stored hashed by our authentication provider), your username, display name, avatar or profile photo, and the date you accepted our terms.</li>
              <li><b>Location:</b> if you choose to use GPS, your device's precise position is sent while the Game is open (never in the background). We keep only your latest position, and use it to place your explorer, decide which plots you can claim, and spot impossible jumps (GPS spoofing). <b>It is never shown to other players.</b> Simple mode needs no location.</li>
              <li><b>Game activity:</b> your plots, minigame results, balances and their history (including the USD rent ledger), creatures, items, achievements, clans, friends and blocks.</li>
              <li><b>Your content:</b> artwork, drawings, names, profile text, photos you upload, chat messages, reports and support tickets. We re-encode uploaded images and strip metadata such as camera location before they're published.</li>
              <li><b>Device and anti-cheat signals:</b> to stop multiple accounts, bots, self-referrals and farming, the Game sends a random id for your install, your platform, timezone and language, error reports, and checks for emulators and automation. On the website and in the Android app it also sends a one-way fingerprint of your browser or device; the iPhone app sends only the random install id. Our servers see your IP address but store only a one-way hash of it (and of its network), plus its country, provider and whether it's a VPN, proxy, Tor or data-centre connection.</li>
              <li><b>Ads (only in app versions that include them, and only if you choose to watch one):</b> the ad network may collect your device's advertising identifier, if your phone allows it, and information about the ad shown. On iPhone you'll be asked first through Apple's tracking prompt.</li>
            </ul>
            <p>We don't collect your contacts, and we don't sell your personal information.</p>

            <H>How we use it</H>
            <ul>
              <li>To run the Game and your account: placing your explorer, plots, rewards, the live map, chat, friends, clans and support (necessary to provide the service you asked for).</li>
              <li>To keep the Game fair and safe: detecting cheating, abuse and fraud, moderating content and enforcing our Terms (our legitimate interest in a fair game, and our legal obligations).</li>
              <li>To fix problems and improve the Game, using error reports and gameplay statistics.</li>
              <li>To contact you about your account, support requests and important changes. We don't send marketing email.</li>
              <li>To show optional rewarded ads in app versions that include them (with your consent where the law requires it).</li>
            </ul>

            <H>What other players can see</H>
            <p>Your username, display name, avatar, level and badges, the plots you own on the shared map, your published art and creatures, your public chat and feed posts, and leaderboard positions. Your profile, artwork pages, visit room, gallery and feed never show where your plots are. You can hide feed activity and parts of your profile in Settings → Privacy.</p>

            <H>Who we share it with</H>
            <p>We share personal information only with service providers that help us run the Game, under contracts that limit how they can use it, and when the law requires it:</p>
            <ul>
              <li><b>Supabase</b> — database, accounts, file storage and server functions (hosted in the United States).</li>
              <li><b>Cloudflare</b> — website hosting and network delivery.</li>
              <li><b>OpenFreeMap</b> — street map tiles your device downloads directly (they see your IP address and the map area requested).</li>
              <li><b>ipapi.is</b> — IP-address reputation checks used for anti-cheat (it receives the IP address only).</li>
              <li><b>Google AdMob</b> — only in app versions with rewarded ads.</li>
              <li><b>Apple and Google</b> — the app stores and, if you turn on reminders, your phone's own notification system (reminders are scheduled on your phone; nothing about them is sent to us).</li>
              <li>A payout provider, only if cash-out is offered in future and you request one.</li>
              <li>Authorities or others when required by law, to protect someone's safety, or to enforce our Terms; and a successor company if LANDVAS is ever transferred.</li>
            </ul>

            <H>How long we keep it</H>
            <p>We keep your information while your account exists. When you delete your account, your sign-in, profile, plots, art, creatures, progress and balances are deleted straight away; game ledger entries are kept without your personal details for fraud and tax records, and backups roll off within 30 days. Anti-cheat records are kept only as long as needed to protect the Game. See <Link to="/legal/delete-account" className="text-accent-2">how to delete your account</Link>.</p>

            <H>Your choices and rights</H>
            <ul>
              <li>Location, notifications and tracking permissions can be changed any time in your phone's settings; GPS can be switched off in Settings.</li>
              <li>You can edit your profile, hide activity, block players and delete your account yourself in the Game.</li>
              <li>Depending on where you live (for example the EU, UK or California), you may have the right to access, correct, delete or get a copy of your personal information, to object to or restrict some uses, and to withdraw consent. Email <Mail subject="LANDVAS privacy request" /> or open a <Link to="/support?new=1&category=privacy" className="text-accent-2">privacy support ticket</Link>; we'll verify it's you and reply within the time the law allows (usually 30 days). You won't be treated differently for using these rights. You can also complain to your local data protection authority.</li>
              <li>California: we don't sell personal information or use it for purposes the CCPA restricts, other than ad identifiers in app versions with ads, which you can limit in your phone's settings.</li>
            </ul>

            <H>Children</H>
            <p>LANDVAS is not for children under 13, and we don't knowingly collect personal information from them. If you believe a child under 13 has an account, contact us and we'll delete it.</p>

            <H>Where your data is stored</H>
            <p>LANDVAS is run from the United States and its data is stored there. If you play from elsewhere, your information is transferred to the US, with safeguards such as our providers' standard contractual clauses.</p>

            <H>Security</H>
            <p>Data is encrypted in transit (HTTPS), access to it is limited and logged, and passwords are never stored in plain text. No system is perfectly secure, so please use a strong password you don't use elsewhere.</p>

            <H>Changes</H>
            <p>If we change this policy materially, we'll tell you in the Game and ask you to accept the new version. The date at the top shows the latest version.</p>

            <H>Contact</H>
            <p>{COMPANY} · <Mail subject="LANDVAS privacy" /> · or a <Link to="/support?new=1&category=privacy" className="text-accent-2">privacy support ticket</Link>.</p>
          </>
        )}
        {doc === 'content' && (
          <>
            <p>LANDVAS is a shared world map, chat and gallery seen by players of all ages (13+). These rules apply to everything you create or post: art, creatures, names, profiles, photos, chat, clan pages and reports. They're part of our <Link to="/legal/terms" className="text-accent-2">Terms</Link>.</p>
            <H>Not allowed</H>
            <ul>
              <li>Sexual or sexually suggestive content, nudity, or anything that sexualises minors (reported to the authorities).</li>
              <li>Graphic violence, gore, self-harm, or content that promotes dangerous or illegal acts, drugs or weapons.</li>
              <li>Hate speech, slurs, harassment, bullying, threats, or targeting real people or groups.</li>
              <li>Personal information — yours or anyone else's: addresses, phone numbers, emails, social accounts, or photos of private people without consent. Never share where you live.</li>
              <li>Work you don't own or have permission to use, including logos, brands and characters.</li>
              <li>Spam, scams, advertising, links, begging for items, or offers to buy or sell accounts or items.</li>
              <li>Impersonating other players, LANDVAS staff or real people.</li>
            </ul>
            <H>How we keep it clean</H>
            <ul>
              <li>Chat filters links and masks rude words; published art is screened and may be reviewed by moderators.</li>
              <li>Report a message, a player or an artwork from the Game, or email <Mail subject="LANDVAS report" />. We review reports promptly.</li>
              <li>Block a player from their profile to hide their art and messages from you.</li>
            </ul>
            <H>Enforcement</H>
            <p>We can remove content, restore a plot's previous artwork, issue strikes, and restrict, suspend or ban accounts — and we report illegal content to the authorities. There is no tolerance for objectionable content or abusive users; repeat or serious violations lose the account. You can appeal a decision through <Link to="/support" className="text-accent-2">Support</Link>.</p>
          </>
        )}
        {doc === 'copyright' && <CopyrightPage />}
        {doc === 'delete-account' && (
          <div data-testid="delete-account-doc">
            <p>You can delete your LANDVAS account and its data at any time — in the game, or by asking us, even if you no longer have the app installed.</p>
            <H>In the game (app or website)</H>
            <ul>
              <li>Open <b>Settings</b> (Me → Settings) and choose <b>Account → Delete my account…</b>, then type DELETE to confirm.</li>
              <li>On a computer or a phone without the app, sign in at <Link to="/settings" className="text-accent-2">landvas.app/settings</Link> and do the same.</li>
            </ul>
            <H>By request</H>
            <p>Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20LANDVAS%20account`} className="text-accent-2">{SUPPORT_EMAIL}</a> from the address you signed up with (or open a <Link to="/support?new=1&category=privacy" className="text-accent-2">privacy support ticket</Link>) and ask us to delete your account. We confirm by email and delete it within 30 days.</p>
            <H>What is deleted</H>
            <ul>
              <li>Straight away: your sign-in, profile, plots (they go back to the world), published art, creatures, game progress and balances.</li>
              <li>Kept without your personal details, for fraud and tax records only: game ledger entries and a note that the account was deleted.</li>
              <li>Accounts with cash-out or payment records are deleted by the team once those are settled — ask us as above.</li>
            </ul>
          </div>
        )}
        {doc === 'rent' && (
          <>
            <p>Every plot you own earns <b>USD rent</b> for every second you own it, at its rarity's current rate:</p>
            <ul>
              {RARITY_ORDER.map((r) => <li key={r}><b>{rarityInfo(r).name}</b> — {formatRate(rarityInfo(r).usd_per_second)} ({rarityOdds(r)} of plots)</li>)}
            </ul>
            <ul>
              <li>The percentages above are the odds for a normal roll. Events, contests and promotions may award a specific rarity to the winners on one of their rolls; this never changes anyone else's odds.</li>
              <li>Each plot level adds 1% to that plot's rent.</li>
              <li>The <b>{world.data?.rent?.boost?.multiplier ?? 20}× boost</b> multiplies all your rent while active. Each press adds {world.data?.rent?.boost?.minutes_per_boost ?? 30} minutes (up to {world.data?.rent?.boost?.max_stack_hours ?? 8} hours stacked); you get {world.data?.rent?.boost?.free_per_day ?? 6} free presses per day.</li>
              <li>Rent keeps accruing while you open LANDVAS at least once every {world.data?.rent?.max_offline_days ?? 30} days.</li>
              <li><b>Plots can never be bought with money.</b> They cost Ink, which you earn by winning minigames. No purchase is necessary to play or to earn rent.</li>
              <li>Rates are set by LANDVAS and may change at any time. They are not a promise of future earnings, and owning plots is not an investment.</li>
              <li>A rent balance is a game reward with <b>no cash value and no property right</b> until it is actually paid out through a cash-out, if and when one is offered. We may change or end the rent feature.</li>
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
      <p>If something on LANDVAS copies work you own, send us a notice below (or email <Mail subject="LANDVAS copyright notice" />) and we'll review it promptly and remove infringing content. Signed in? You can also open a <Link to="/support?new=1&category=copyright" className="text-accent-2">copyright support ticket</Link>.</p>
      <p className="mt-2">A notice needs: the LANDVAS link, a description of your original work, your name and contact details, a statement that you believe in good faith the use isn't authorised, and a statement that your notice is accurate, signed by you. If your content was removed and you believe that was a mistake, email us a counter-notice with the same details. We close the accounts of repeat infringers.</p>
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
