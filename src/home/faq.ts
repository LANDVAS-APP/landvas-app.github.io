// Homepage FAQ. Also emitted as FAQPage structured data in index.html, so keep the
// two in sync (scripts/check-seo is not needed: the text below is the source).
export const FAQ: { q: string; a: string }[] = [
  { q: 'What is LANDVAS?', a: 'LANDVAS is a free map-based art game. The real world is divided into 4.3 billion house-sized plots. You claim plots near you, paint pixel art and murals on them that every player sees on the live world map, play minigames to earn Ink, and your land earns USD rent every second.' },
  { q: 'Is LANDVAS free to play?', a: 'Yes. Your first plot is free, and everything else is earned by playing: win minigames for Ink, invite friends, and convert your rent into Ink. Ink can’t be bought with money.' },
  { q: 'How do plots earn money?', a: 'Every plot you own earns USD rent each second at a rate set by its rarity — Common, Rare, Epic, Legendary or Mythic. A free daily boost multiplies all your rent by 20× for a while, and plot upgrades add +1% per level. Rates can change and rent is a game reward, not an investment.' },
  { q: 'Can I cash out my rent?', a: 'Cash-out isn’t available yet. Until it is, you can convert rent into Ink at $1 = 100 Ink, starting from just $0.01, and spend it on more plots, art tools and explorer outfits.' },
  { q: 'How do I get more plots?', a: 'Your explorer stands where you are (with GPS) or where you choose on the map. You can claim plots within a few plots of your explorer. The first one is free; more cost Ink, which you win in minigames.' },
  { q: 'What are plot rarities?', a: 'Every plot is a mystery until it’s claimed. Its type (which minigame it hosts) and rarity (how much rent it earns) are revealed the moment you claim it — any plot could be Mythic.' },
  { q: 'What are the minigames?', a: 'There are four: TraceCraft (trace glowing shapes), ColorBurst (mix exact colours), PatternShift (slide tiles back into place) and LightLines (rotate mirrors to guide light). Harder levels and rarer plots pay more Ink, and every result is checked on the server.' },
  { q: 'Can other players see where I live?', a: 'Your GPS position is never shown to anyone. Player profiles, visit rooms, the gallery and the live feed never show where anyone’s land is. Plots are visible on the map itself, like any shared map game.' },
  { q: 'How do invites work?', a: 'Every player has an invite code, and you can create one custom code for your account. When a friend joins with it and wins their first minigame, you get 500 Ink.' },
  { q: 'Do I need to download anything?', a: 'No. LANDVAS runs in your browser on any phone, tablet or computer, and can be added to your home screen like an app.' },
];
