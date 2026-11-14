// The website's welcome page, under the sign-up: what you can do, recent art, how it works, the FAQ and a last call to
// join. Loaded on its own so the iOS / Android apps (which open on a title screen) never contain it.
import { motion } from 'motion/react';
import { ArrowRight, Brush, ChevronDown, CircleDollarSign, Gamepad2, Lightbulb, MapPinned, PawPrint, Swords, Trophy, Users, Wand2 } from 'lucide-react';
import { ArtMarquee, Earnings, HowItWorks, Minigames, Social, Footer } from '../home/HomePage';
import { FAQ } from '../home/faq';

const FEATURES = [
  { icon: MapPinned, color: '#34C3FF', title: 'Claim real places', text: 'Your first 4 plots are free. Every plot is a square of the real world map — house-sized, rare or legendary.' },
  { icon: Brush, color: '#FF4D6D', title: 'Paint with helpers', text: 'Brushes, layers and mirror mode, plus idea prompts, ready-made palettes, shade ramps and trace guides.' },
  { icon: Gamepad2, color: '#3DDC97', title: 'Eight minigames', text: 'Each plot hides a game. Clear rounds to earn Ink — the currency that buys the plots next door.' },
  { icon: Swords, color: '#FF9F1C', title: 'PvP minigames', text: 'Free head-to-head rounds against anonymous rivals for bonus Ink.' },
  { icon: PawPrint, color: '#3DDC97', title: 'Raise Inkborn', text: 'Draw a creature and it comes alive. Raise it in a woodland sanctuary, send it on jobs, and play games as it.' },
  { icon: Wand2, color: '#7B5CFF', title: 'Grow your territory', text: 'Merge neighbouring plots into one giant mural or sanctuary — up to thousands of plots wide.' },
  { icon: CircleDollarSign, color: '#22C7B5', title: 'Rent every second', text: 'Your land earns USD rent around the clock. Boost it 20× once a day.' },
  { icon: Trophy, color: '#FFE14D', title: 'Daily wheel & challenges', text: 'Spin daily, enter weekly themed challenges, get featured, and earn for original craft.' },
  { icon: Users, color: '#FF4FD8', title: 'Friends pay off', text: 'Invite friends for an Ink bonus — and a share of what they earn while they play.' },
];

export default function WelcomeMore({ art, artLoading, toForm }: { art: Parameters<typeof ArtMarquee>[0]['cards']; artLoading: boolean; toForm(): void }) {
  return (
    <>
      <section id="what" className="gutter mx-auto max-w-7xl py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">What you can do</div>
          <h2 className="mt-2 font-display text-3xl font-bold md:text-5xl">One map. Endless ways to play.</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">Painter, creature keeper, explorer, competitor, builder or collector — every playstyle has a home on the same living map.</p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.article key={f.title} className="glass rounded-3xl p-5" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: (i % 4) * 0.08 }}>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: `${f.color}22`, color: f.color, boxShadow: `0 0 30px -8px ${f.color}` }}><f.icon className="h-5 w-5" /></div>
              <h3 className="font-display text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </motion.article>
          ))}
        </div>
      </section>
      <ArtMarquee cards={art} loading={artLoading} />
      <HowItWorks />
      <Earnings />
      <Minigames />
      <Social />
      <section className="gutter mx-auto max-w-4xl py-16">
        <h2 className="text-center font-display text-3xl font-bold md:text-4xl">Questions, answered</h2>
        <div className="mt-8 grid gap-3">
          {FAQ.slice(0, 8).map((f) => (
            <details key={f.q} className="lv-faq group glass rounded-2xl px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{f.q}<ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" /></summary>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="gutter py-10">
        <div className="lv-final relative mx-auto max-w-6xl overflow-hidden rounded-[40px] px-6 py-14 text-center">
          <Lightbulb className="relative mx-auto h-10 w-10 text-white/90" />
          <h2 className="relative mt-3 font-display text-[clamp(1.8rem,5vw,3.2rem)] font-bold leading-tight text-white">Your first 4 plots are waiting.</h2>
          <p className="relative mx-auto mt-3 max-w-lg text-white/80">It takes a few seconds to join — then the tutorial shows you around.</p>
          <button onClick={toForm} className="relative mt-7 inline-flex h-14 items-center gap-2 rounded-2xl bg-white px-8 text-base font-extrabold text-[#1d1550] transition hover:scale-[1.03]">Create my free account <ArrowRight className="h-5 w-5" /></button>
        </div>
      </section>
      <Footer />
    </>
  );
}
