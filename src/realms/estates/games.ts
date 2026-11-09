// Every Estate's signature minigame, by the game id in its realm config.
import type { ReactElement } from 'react';
import type { GameProps } from '../games';
import { CrystalEcho, FireflyLantern, HueHunter, MarketMaker, PinballWizard, SheepdogRoundup } from './gamesA';
import { AirshipDocking, BossRush, CardClash, RocketStages, SushiTrain } from './gamesB';
import { Constellation, DrillDive, LiftRush, PloughRun, RingToss, SpiritAngler } from './gamesC';
import { CircuitConnect, ElementalClash, OrbitSlingshot, PerfectSlice, RuneDuel } from './gamesD';

export const ESTATE_GAMES: Record<string, (p: GameProps) => ReactElement> = {
  hue: HueHunter, fireflies: FireflyLantern, roundup: SheepdogRoundup, trading: MarketMaker, pinball: PinballWizard, echo: CrystalEcho,
  docking: AirshipDocking, rocket: RocketStages, sushi: SushiTrain, bossrush: BossRush, clash: CardClash,
  // Domains (3x3)
  constellation: Constellation, reel: SpiritAngler, plough: PloughRun, lift: LiftRush, ringtoss: RingToss, drill: DrillDive,
  slingshot: OrbitSlingshot, circuit: CircuitConnect, slice: PerfectSlice, runes: RuneDuel, elements: ElementalClash,
};
