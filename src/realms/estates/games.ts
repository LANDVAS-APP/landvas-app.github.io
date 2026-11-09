// Every Estate's and Domain's minigames, by the game id in its realm config: the signature games, and the Estates'
// stand games (four more per Estate, each on its own stand in the world).
import type { ReactElement } from 'react';
import type { GameProps } from '../games';
import { CrystalEcho, FireflyLantern, HueHunter, MarketMaker, PinballWizard, SheepdogRoundup } from './gamesA';
import { AirshipDocking, BossRush, CardClash, RocketStages, SushiTrain } from './gamesB';
import { Constellation, DrillDive, LiftRush, PloughRun, RingToss, SpiritAngler } from './gamesC';
import { CircuitConnect, ElementalClash, OrbitSlingshot, PerfectSlice, RuneDuel } from './gamesD';
import { BarrelRace, CorralCount, FeedingTime, FillFrenzy, HaystackHunt, LassoToss, LevelIt, PhotoSafari, RiverCrossing, SplatCatch, SpotForgery, TrackReader } from './gamesE';
import { BalloonDarts, BriefcaseShuffle, CoinCounter, ContractRush, GemSwap, GeodeCrack, GoingGoing, HighStriker, LampDark, RailSwitch, WaterGunRace, WhackACrab } from './gamesF';
import { Bellows, BubbleTea, CargoDrop, CloudHop, DumplingPleat, GearTrain, HotPour, NoodlePull, Postbird, RivetRush, SpicePairs, WindSwipe } from './gamesG';
import { ArrowVolley, ChariotRace, CrowdWave, Parry, PotionMix, ShieldWall, TorchMaze, TrapRun } from './gamesH';

export const ESTATE_GAMES: Record<string, (p: GameProps) => ReactElement> = {
  hue: HueHunter, fireflies: FireflyLantern, roundup: SheepdogRoundup, trading: MarketMaker, pinball: PinballWizard, echo: CrystalEcho,
  docking: AirshipDocking, rocket: RocketStages, sushi: SushiTrain, bossrush: BossRush, clash: CardClash,
  // the Estates' stand games
  fill: FillFrenzy, levelit: LevelIt, forgery: SpotForgery, splat: SplatCatch,
  safari: PhotoSafari, tracks: TrackReader, rivercross: RiverCrossing, feeding: FeedingTime,
  barrel: BarrelRace, lasso: LassoToss, haystack: HaystackHunt, corral: CorralCount,
  change: CoinCounter, auction: GoingGoing, briefcase: BriefcaseShuffle, contracts: ContractRush,
  whack: WhackACrab, striker: HighStriker, watergun: WaterGunRace, darts: BalloonDarts,
  gemswap: GemSwap, rails: RailSwitch, geode: GeodeCrack, lamp: LampDark,
  cloudhop: CloudHop, cargo: CargoDrop, windswipe: WindSwipe, postbird: Postbird,
  pour: HotPour, gears: GearTrain, rivets: RivetRush, bellows: Bellows,
  noodles: NoodlePull, dumpling: DumplingPleat, bubbletea: BubbleTea, spices: SpicePairs,
  traprun: TrapRun, torchmaze: TorchMaze, potions: PotionMix, volley: ArrowVolley,
  parry: Parry, chariot: ChariotRace, crowdwave: CrowdWave, shieldwall: ShieldWall,
  // Domains (3x3)
  constellation: Constellation, reel: SpiritAngler, plough: PloughRun, lift: LiftRush, ringtoss: RingToss, drill: DrillDive,
  slingshot: OrbitSlingshot, circuit: CircuitConnect, slice: PerfectSlice, runes: RuneDuel, elements: ElementalClash,
};
