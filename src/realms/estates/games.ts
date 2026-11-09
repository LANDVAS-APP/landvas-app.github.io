// Every Estate's signature minigame, by the game id in its realm config.
import type { ReactElement } from 'react';
import type { GameProps } from '../games';
import { CrystalEcho, FireflyLantern, HueHunter, MarketMaker, PinballWizard, SheepdogRoundup } from './gamesA';
import { AirshipDocking, BossRush, CardClash, RocketStages, SushiTrain } from './gamesB';

export const ESTATE_GAMES: Record<string, (p: GameProps) => ReactElement> = {
  hue: HueHunter, fireflies: FireflyLantern, roundup: SheepdogRoundup, trading: MarketMaker, pinball: PinballWizard, echo: CrystalEcho,
  docking: AirshipDocking, rocket: RocketStages, sushi: SushiTrain, bossrush: BossRush, clash: CardClash,
};
