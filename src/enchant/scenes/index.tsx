// One scene per enchantment (a Mirror Shard reflecting something shows that thing's scene, through glass).
import type { SceneProps } from '../core';
import { ClockworkScene } from './ClockworkScene';
import { CuckooScene } from './CuckooScene';
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

const SCENES: Record<string, (p: SceneProps) => React.ReactElement> = {
  goose: GooseScene, genie: GenieScene, map: MapScene, parasite: ParasiteScene, cuckoo: CuckooScene, pandora: PandoraScene,
  splice: SpliceScene, clockwork: ClockworkScene, sizeray: SizeRayScene, shard: ShardScene, wormhole: WormholeScene, oracle: OracleScene,
};

export function SceneFor({ kind, ...p }: SceneProps & { kind: string }) {
  const S = SCENES[kind];
  return S ? <S {...p} /> : null;
}
