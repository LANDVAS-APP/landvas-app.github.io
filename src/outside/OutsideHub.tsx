// 📱 Outside (the apps): the things only a phone in your hand, out in the real world, can do — Bump a friend, walk a
// Lasso loop, tonight's real sky — and a reminder of everything you can feel and steer with the phone itself.
import { Footprints } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { HeroButton, HubH2, HubHero, HubPage, rise } from '../app/hubs/HubKit';
import { isNative } from '../native/native';
import { BumpCard } from './Bump';
import { fmtArea } from './LassoWalk';
import { useLassoView } from './LassoLayer';
import { moonEmoji, moonName, SkyCard, useSky } from './Sky';
import './outside.css';

const FEELS: [string, string, string][] = [
  ['🫀', 'Feel your roll', 'Every rarity has its own heartbeat as the drum slows'],
  ['🧭', 'Haptic sonar', 'On buried chests, map pieces and the Rod’s spot: turn until it pings fast'],
  ['🐉', 'Flick to throw', 'Flick your phone at the Leviathan to lob ink bombs'],
  ['⚡', 'Swirl to crank', 'Stir circles with your phone to wind the Storm Coil'],
  ['🏺', 'Tip to pry', 'Pry Pandora’s lid notch by notch — or tip a copy into a Star'],
  ['👣', 'Its footsteps', 'Feel the Leviathan coming as it nears your plots'],
];

export default function OutsideHub() {
  const sky = useSky();
  const lasso = useLassoView();
  const mine = lasso.data?.loops.find((l) => l.mine);
  const s = sky.data;
  return (
    <HubPage tone="eyes" id="outside-hub">
      <HubHero kicker="Outside" icon={<Footprints className="h-3.5 w-3.5" />} art="📱" title="Your phone is the controller"
        sub="Bump a friend, walk a loop of land, catch what the real sky drops — things only a phone in your hand can do."
        stats={[
          { label: 'Footprint', value: mine ? fmtArea(mine.area_m2) : '—', hot: !!mine, testid: 'outside-footprint' },
          { label: s ? moonName(s.moon.phase) : 'Moon', value: s ? moonEmoji(s.moon.phase) : '🌙' },
          { label: 'Meteors', value: s?.shower ? s.shower.name : 'quiet', hot: !!s?.shower },
        ]}
        actions={<>
          <HeroButton to="/lasso" testid="outside-lasso">🪢 Lasso walk</HeroButton>
          <HeroButton to="/eyes" ghost>👁️ Look up</HeroButton>
        </>} />
      {!isNative() && <p className="mt-3 rounded-2xl bg-white/[0.05] p-3 text-center text-[12.5px] text-white/70">These are made for the LANDVAS app on your phone — its compass, motion and GPS.</p>}

      <HubH2 note="Friends and party mates, side by side" i={2}>Bump</HubH2>
      <motion.div {...rise(2)}><BumpCard /></motion.div>

      <HubH2 note="Walk it, own what’s inside for a day" i={3}>The Lasso walk</HubH2>
      <motion.div {...rise(3)}>
        <Link to="/lasso" className="lvo-card flex items-center gap-3" data-testid="outside-lasso-card">
          <span className="lvo-emoji" aria-hidden>🪢</span>
          <span className="min-w-0 flex-1"><b className="block text-[15px]">{mine ? `Your Footprint: ${fmtArea(mine.area_m2)}` : 'Walk a loop'}</b>
            <span className="text-[12.5px] text-white/65">{mine ? 'Claim anywhere inside it — your party sees it on the map.' : 'The land inside becomes yours to claim from for 24 hours.'}</span></span>
          <span className="lvo-go">{mine ? 'Open' : 'Start'}</span>
        </Link>
      </motion.div>

      <HubH2 note="Showers, the Moon, the space station" i={4}>The real sky</HubH2>
      <motion.div {...rise(4)}><SkyCard /></motion.div>

      <HubH2 note="Your phone in your hand" i={5}>Feel it</HubH2>
      <motion.div {...rise(5)} className="grid grid-cols-2 gap-2" data-testid="outside-feels">
        {FEELS.map(([e, t, d]) => (
          <div key={t} className="lvo-feel"><span className="text-[22px]">{e}</span><b>{t}</b><i>{d}</i></div>
        ))}
      </motion.div>
    </HubPage>
  );
}
