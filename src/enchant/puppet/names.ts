// (small shared bits of the 🎭 Puppeteer's show, kept apart so the little stage loads light)
import { GAME_INFO } from '../../shared/minigames';

export const gameName = (g: string) => (GAME_INFO as Record<string, { name: string }>)[g]?.name ?? g;
/** fired when a show starts, so the little stage looks in */
export const PUPPET_EVENT = 'landvas:puppet-show';
