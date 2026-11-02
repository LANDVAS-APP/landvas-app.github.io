// How LANDVAS describes itself, in one place: the world is the game board, and every
// playstyle has a home here — creators, keepers, explorers, competitors, builders, collectors.
export const TAGLINE = ['Own a piece.', 'Play it your way.'] as const;
export const TAGLINE_TEXT = TAGLINE.join(' ');
export const PITCH = 'LANDVAS turns the real world into one giant game board. Claim the plots around you, then make them anything — a mural, a creature sanctuary, a rent-earning empire, a minigame arena.';

export type Playstyle = { id: string; emoji: string; title: string; text: string; color: string; to: string };
export const PLAYSTYLES: Playstyle[] = [
  { id: 'creator', emoji: '🎨', title: 'Creator', text: 'Paint murals the whole world sees, sketch the daily word and team up on duets.', color: '#FF4D6D', to: '/canvases' },
  { id: 'keeper', emoji: '🐾', title: 'Keeper', text: 'Draw creatures that come alive and raise them in sanctuaries you design.', color: '#3DDC97', to: '/inkborn' },
  { id: 'explorer', emoji: '🧭', title: 'Explorer', text: 'Walk the real world, uncover mystery plots and hunt for Mythic rarities.', color: '#34C3FF', to: '/world' },
  { id: 'competitor', emoji: '⚔️', title: 'Competitor', text: 'Clear minigames, win PvP duels and climb the weekly leaderboards.', color: '#FFB31F', to: '/play' },
  { id: 'builder', emoji: '🏰', title: 'Builder', text: 'Grow an empire of plots, merge them into giant territories and collect rent.', color: '#A45CFF', to: '/world' },
  { id: 'collector', emoji: '🤝', title: 'Socialite', text: 'Visit rooms, collect stamps, make friends and inspire other players.', color: '#FF4FD8', to: '/social' },
];
