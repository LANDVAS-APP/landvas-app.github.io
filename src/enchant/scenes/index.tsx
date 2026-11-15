// One scene per enchantment (a Mirror Shard reflecting something shows that thing's scene, through glass).
import { useEffect, useRef, useState } from 'react';
import type { SceneProps } from '../core';
import { ClockworkScene } from './ClockworkScene';
import { EggScene } from './EggScene';
import { SpyglassScene } from './SpyglassScene';
import { OrigamiScene } from './OrigamiScene';
import { CrucibleScene } from './CrucibleScene';
import { PuppeteerScene } from './PuppeteerScene';
import { DeckScene } from './DeckScene';
import { GlyphScene } from './GlyphScene';
import { GenieScene } from './GenieScene';
import { GooseScene } from './GooseScene';
import { MapScene } from './MapScene';
import { PandoraScene } from './PandoraScene';
import { ParasiteScene } from './ParasiteScene';
import { ShardScene } from './ShardScene';
import { SizeRayScene } from './SizeRayScene';
import { SpliceScene } from './SpliceScene';
import { WormholeScene } from './WormholeScene';
import { OracleScene } from './OracleScene';
import { OuroborosScene } from './OuroborosScene';
import { HomunculusScene } from './HomunculusScene';
import { StormCoilScene } from './StormCoilScene';

const SCENES: Record<string, (p: SceneProps) => React.ReactElement> = {
  goose: GooseScene, genie: GenieScene, map: MapScene, parasite: ParasiteScene, cuckoo: EggScene, pandora: PandoraScene,
  splice: SpliceScene, clockwork: ClockworkScene, sizeray: SizeRayScene, shard: ShardScene, wormhole: WormholeScene, oracle: OracleScene,
  ouroboros: OuroborosScene, homunculus: HomunculusScene, stormcoil: StormCoilScene,
  spyglass: SpyglassScene, origami: OrigamiScene, crucible: CrucibleScene, puppeteer: PuppeteerScene, deck: DeckScene, glyph: GlyphScene,
};

export function SceneFor({ kind, ...p }: SceneProps & { kind: string }) {
  // an egg that just hatched stays on screen a moment, so you see what came out of it before its own scene takes over
  const prev = useRef(kind);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    const was = prev.current; prev.current = kind;
    if (was !== 'cuckoo' || kind === 'cuckoo') return;
    setHold(true);
    const t = setTimeout(() => setHold(false), 4800);
    return () => clearTimeout(t);
  }, [kind]);
  const S = hold || (prev.current === 'cuckoo' && kind !== 'cuckoo') ? EggScene : SCENES[kind];
  return S ? <S {...p} /> : null;
}
