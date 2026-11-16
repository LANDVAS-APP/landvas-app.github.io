// The paint colours players see in the minigames. Players asked for colours that are easier to tell apart (pink vs
// red, orange vs yellow): the bold set is the default; the classic set is a switch in Settings → Minigames. Only the
// look changes — every game checks colours by their number, never by their shade.
import { useUi } from '../lib/store';
import { MURAL_COLORS } from '../shared/minigames/memorymural';

/** white, red, orange, yellow, green, blue, purple, pink, black — the same order as MURAL_COLORS */
export const BOLD_COLORS = ['#F7F5EE', '#E3212B', '#FF7A00', '#FFE135', '#1FB65A', '#1673FF', '#7A35E0', '#FF6FCF', '#1B1B22'];
/** a symbol for each colour (Settings → Colour symbols) */
export const COLOR_SYMBOLS = ['', '●', '▲', '■', '◆', '✚', '★', '♥', '✖'];

export function useMuralColors(): string[] {
  const bold = useUi((s) => s.settings.boldColors !== false);
  return bold ? BOLD_COLORS : MURAL_COLORS;
}
export const useColorSymbols = () => useUi((s) => !!s.settings.colorSymbols);

/** a palette given as hex values (Paint Pop's): each one shown in the player's chosen look */
export function useDisplayPalette(hexes: string[], game?: 'paintpop'): string[] {
  const bold = useUi((s) => s.settings.boldColors !== false);
  return hexes.map((h) => {
    const i = MURAL_COLORS.indexOf(h);
    if (i < 0) return h;
    // Paint Pop: orange is brown, so it never looks like yellow
    if (game === 'paintpop' && i === 2) return bold ? '#8A4B1F' : '#9A5B2E';
    return bold ? BOLD_COLORS[i] : h;
  });
}
/** the symbol for a colour given as hex (Paint Pop) */
export const symbolOfHex = (h: string) => COLOR_SYMBOLS[MURAL_COLORS.indexOf(h)] ?? '';
/** a readable ink for a symbol on this colour */
export const symbolInk = (i: number) => (i === 3 || i === 0 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)');
