// The pages that get their own link preview (title, description, card), shared by scripts/make-share-cards.mjs
// (draws the cards) and scripts/prerender-share.mjs (writes each page's <head> at deploy).
// Bump CARD_VERSION whenever the cards' look changes: the file names change with it, so chat apps that cached an old
// picture fetch the new one.
export const CARD_VERSION = 2;
// (JPEG: small enough for every app's limits — WhatsApp skips pictures much over 300 KB)
export const MAIN_CARD = `og/landvas-v${CARD_VERSION}.jpg`;
const card = (id) => `og/${id}-v${CARD_VERSION}.jpg`;
const rain = (s) => `<span class="rain">${s}</span>`;

export const SECTIONS = [
  { route: 'handbook', image: card('handbook'), emoji: '📖', accent: '#34C3FF', seed: 21, kicker: 'The Handbook',
    headline: `Everything in LANDVAS, ${rain('explained.')}`, sub: 'Every feature, how it works and what it pays, with pictures and live numbers.',
    title: 'The LANDVAS Handbook — every feature, explained', description: 'Every feature in LANDVAS: how it works, what it pays and the best ways to play it, with pictures and live numbers.' },
  { route: 'gallery', image: card('gallery'), emoji: '🖼️', accent: '#FF4D6D', seed: 31, kicker: 'The Gallery',
    headline: `Art on the ${rain('live world map.')}`, sub: 'The newest murals and paintings players have made on real-world plots.',
    title: 'The LANDVAS Gallery — art on the live world map', description: 'The newest murals and paintings LANDVAS players have made on real-world plots. Claim a free plot and paint your own.' },
  { route: 'party', image: card('party'), emoji: '🎉', accent: '#FF4FD8', seed: 41, kicker: 'Parties',
    headline: `Play together, ${rain('anywhere.')}`, sub: 'Team up with anyone online, chat over the map and in arcades, and ride along on trips.',
    title: 'Parties — play LANDVAS together', description: 'Team up with anyone online, chat over the map and in arcades, play party games and ride along on trips.' },
  { route: 'party/join', image: card('party-invite'), emoji: '💌', accent: '#FF4FD8', seed: 43, kicker: 'Party invite',
    headline: `You’re invited to ${rain('a party!')}`, sub: 'Tap to join. New to LANDVAS? Sign up free and land right in the party.',
    title: 'You’re invited to a LANDVAS party 🎉', description: 'Tap to join the party: chat, play and explore together on the live world map. New? Sign up free and land right in it.' },
  { route: 'guide', image: card('guide'), emoji: '📊', accent: '#3DDC97', seed: 51, kicker: 'The Guide',
    headline: `Live rates, ${rain('real numbers.')}`, sub: 'What every rarity earns, Ink for every activity, and what players make.',
    title: 'The LANDVAS guide — live rates and real numbers', description: 'What every rarity earns, Ink for every activity, and what LANDVAS players make. Live from the game.' },
  { route: 'royalty', image: card('royalty'), emoji: '👑', accent: '#FFC93D', seed: 61, kicker: 'Royalty',
    headline: `Every Crown, ${rain('and who holds it.')}`, sub: 'The rarest plots in the world: one for each city, state and country.',
    title: 'Royalty — every Crown in LANDVAS and who holds it', description: 'The rarest plots in LANDVAS: one Crown for each city, state and country, and the players who hold them.' },
  { route: 'clips', image: card('clips'), emoji: '🎬', accent: '#8B6BFF', seed: 71, kicker: 'Clips',
    headline: `Your best moments, ${rain('ready to share.')}`, sub: 'Rare rolls and big wins, saved as clips for TikTok, Reels, Shorts and Discord.',
    title: 'LANDVAS clips — your best moments', description: 'Rare rolls and big wins in LANDVAS, saved as clips ready for TikTok, Reels, Shorts and Discord.' },
  { route: 'players', image: card('players'), emoji: '🧭', accent: '#22E3FF', seed: 81, kicker: 'Players',
    headline: `Meet ${rain('the world.')}`, sub: 'Artists, explorers and collectors from everywhere, playing right now.',
    title: 'LANDVAS players', description: 'Artists, explorers and collectors from all over the world, playing LANDVAS right now.' },
  { route: 'leaderboards', image: card('leaderboards'), emoji: '🏆', accent: '#FFC93D', seed: 91, kicker: 'Leaderboards',
    headline: `Who’s ${rain('on top.')}`, sub: 'The biggest landowners, artists and players in LANDVAS this week.',
    title: 'LANDVAS leaderboards', description: 'The biggest landowners, artists and players in LANDVAS this week.' },
  { route: 'space', image: card('space'), emoji: '🚀', accent: '#8B6BFF', seed: 101, kicker: 'Space',
    headline: `Fly to the Moon, ${rain('and beyond.')}`, sub: 'Build a rocket, land on other worlds and claim plots among the stars.',
    title: 'LANDVAS space — fly to the Moon and beyond', description: 'Build a rocket, land on other worlds and claim plots among the stars in LANDVAS.' },
  { route: 'inkborn', image: card('inkborn'), emoji: '🐾', accent: '#3DDC97', seed: 111, kicker: 'Inkborn',
    headline: `Raise creatures ${rain('all your own.')}`, sub: 'Hatch, raise and breed one-of-a-kind Inkborn in your sanctuary.',
    title: 'Inkborn — raise creatures in LANDVAS', description: 'Hatch, raise and breed one-of-a-kind Inkborn creatures in your LANDVAS sanctuary.' },
];

/** Pages with no card of their own that still need their own title and description: Google shows these under the
 *  main landvas.app result, and without this they repeat the homepage's. They use the site card (MAIN_CARD). */
export const PLAIN_PAGES = [
  { route: 'world', title: 'The LANDVAS live world map',
    description: 'Explore the LANDVAS live world map: every claimed plot and mural on real-world streets, updating as people play. Find the plots near you and claim your first 4 free.' },
  { route: 'welcome', title: 'Play LANDVAS free — create your account',
    description: 'Make a free LANDVAS account and claim 4 free plots on the real-world map. Then play it your way: paint, raise creatures, battle in minigames and explore.' },
  { route: 'social', title: 'LANDVAS social — live feed, chat & friends',
    description: 'What LANDVAS players are claiming, painting and rolling right now: the live feed, global chat and friends from all over the world.' },
];

/** the Handbook's chapters (/handbook/<id>): each gets the Handbook's card with its own title and description */
export const HANDBOOK_CHAPTERS = [
  { id: "enchant", title: "Enchantments", blurb: "Every enchantment, its stars, splicing hybrids, every Trait, Pandora and the Leviathan." },
  { id: "faq", title: "FAQ & glossary", blurb: "Quick answers to the questions players ask most, and every LANDVAS word explained." },
  { id: "ink", title: "Ink & minigames", blurb: "The eight plot minigames, levels and paid wins, exactly what a win pays, PvP, the streak, the wheel and every Ink source." },
  { id: "inkborn", title: "Inkborn", blurb: "Draw a creature and watch it come alive: care, games, jobs, the Ink Spring, playdates, eggs and keeper levels." },
  { id: "luck", title: "Luck, Hot Zones & tickets", blurb: "Charge Luck at the Altar for rerolls and likelier ultras, roll in the daily Hot Zone, and use guaranteed roll tickets." },
  { id: "places", title: "Plot types in depth", blurb: "Art canvases, farms, businesses, arcades, the five realms, the Arena, homes, Landlord, travel, and every Estate and Domain." },
  { id: "progress", title: "Progress, events & your profile", blurb: "Your level, badges, ultra sets, rankings, Royalty, events, weekly challenges, the daily creative games, and the settings worth knowing." },
  { id: "rent", title: "Rent", blurb: "How your land earns every second, the ×20 boost, rent day, turning rent into Ink, and every rent booster." },
  { id: "roll", title: "The roll & every rarity", blurb: "How a roll works, the real odds, Shiny plots, every ultra, the Crowns, Enchanted rolls and clips." },
  { id: "social", title: "Friends, parties & clans", blurb: "The live feed and chat, friends, open play and parties that go everywhere with you, players on the map, watching people play, clans and the Clan Keep, visits, invites and staying safe." },
  { id: "space", title: "Space", blurb: "Build a rocket, fly to the Moon and the planets, claim plots there, dig to the core, catch meteors, build bases and settle a world." },
  { id: "start", title: "Start here", blurb: "What LANDVAS is, your first ten minutes, your currencies and how to find your way around." },
  { id: "strategy", title: "Strategy & the best ways to grind", blurb: "A first-week plan, a daily checklist, the best Ink per hour, where to spend, how to roll smart, rent tactics, the best combos and the mistakes to avoid." },
  { id: "ultra", title: "Ultras, Fusions & Primordials", blurb: "The land-changing ultras, the Fusion Lab’s recipes, and the 19 Primordials (only ever rolled) that change the game for everyone around them." },
  { id: "world", title: "The World & your land", blurb: "The map, your explorer, claiming plots, plot styles and types, merging, and getting around." },
];
