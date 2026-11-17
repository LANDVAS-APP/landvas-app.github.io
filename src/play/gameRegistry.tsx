// The plot minigames, by id — the game screen plays them, and the 🎭 Puppeteer's stage puts them on strings.
import type { GameId } from '../shared/minigames';
import type { GameProps } from './common';
import { ColorBurstGame } from './games/ColorBurst';
import { LightLinesGame } from './games/LightLines';
import { PaintPopGame } from './games/PaintPop';
import { TraceCraftGame } from './games/TraceCraft';
import { boardsGame } from './games/Boards';
import { RollerMuralBoard } from './games/RollerMural';
import { MemoryMuralBoard } from './games/MemoryMural';
import { MirrorlineBoard } from './games/Mirrorline';
import { BlockSplashBoard } from './games/BlockSplash';

export const GAMES: Record<GameId, (p: GameProps) => React.ReactElement | null> = {
  lightlines: boardsGame('lightlines', LightLinesGame),
  paintpop: boardsGame('paintpop', PaintPopGame),
  colorburst: ColorBurstGame,
  tracecraft: TraceCraftGame,
  memorymural: boardsGame('memorymural', MemoryMuralBoard),
  blocksplash: boardsGame('blocksplash', BlockSplashBoard),
  rollermural: boardsGame('rollermural', RollerMuralBoard),
  mirrorline: boardsGame('mirrorline', MirrorlineBoard),
};
