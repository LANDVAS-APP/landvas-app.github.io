// What each of an enchantment's numbers means, for the Enchantment editor (admin portal → Enchantments).
// The numbers themselves are found in the live server code (private.ench_tunables()); a number missing here still shows,
// with its key and the line of code it sits on.
//
// unit: 'x' a multiplier · 'p' a chance from 0 to 1 · 'h' hours · 'min' minutes · 's' seconds · 'ms' milliseconds ·
// 'm' metres · 'km' kilometres · 'ink' Ink · 'n' a count · 'star' a star level (6 = never) · 'heat' heat (0–100)
export type Unit = 'x' | 'p' | 'h' | 'min' | 's' | 'ms' | 'm' | 'km' | 'ink' | 'n' | 'star' | 'heat' | 'd';
export type Label = { label: string; hint?: string; unit?: Unit; group?: string };

/** the dials every enchantment has */
export const DIALS: Record<string, Label> = {
  pay_x: { label: 'All the Ink it pays ×', hint: 'Multiplies every Ink payout this enchantment makes (before the level and star bonuses). 0.5 halves it, 0 stops it.', unit: 'x' },
  star_pay: { label: 'Ink bonus per star', hint: 'Each star adds this much to its payouts: 0.1 = +10% per star (★3 = +30%).', unit: 'p' },
  level_pay_x: { label: 'Level bonus ×', hint: 'Scales the shared “+6% per level” bonus for this enchantment only. 0 = levels add no Ink.', unit: 'x' },
  xp_x: { label: 'How fast it levels (XP ×)', hint: 'Multiplies the XP it earns. 2 = levels twice as fast, 0 = stuck at its level.', unit: 'x' },
  luck_x: { label: 'Luck its actions give ×', hint: 'Multiplies the Luck a player gets from using it (wishes, eggs, catches…).', unit: 'x' },
};

/** the shared settings (every enchantment) */
export const GLOBAL: Record<string, Label> = {
  base_pct: { label: 'Chance a plot roll turns Enchanted', hint: 'Percent, per roll.', unit: 'n' },
  luck_pct: { label: 'Each Enchanted Luck adds', hint: 'Percent added to the chance, per Enchanted Luck.', unit: 'n' },
  luck_ink: { label: 'Enchanted Luck price', unit: 'ink' },
  luck_max: { label: 'Most Enchanted Luck at once', unit: 'n' },
  level_bonus: { label: 'Ink bonus per level', hint: '0.06 = +6% per level above 1 (each enchantment can scale this with its own “Level bonus ×”).', unit: 'p' },
  max_level: { label: 'Highest level', unit: 'n' },
};

export const LABELS: Record<string, Record<string, Label>> = {
  dejavu: {
    cap: { label: 'Moments the jar holds', hint: '★1 Wide Neck holds one more.', unit: 'n', group: 'The jar' },
    fade_d: { label: 'A moment fades over', hint: 'From full strength to half, then it’s gone. ★2 Good Cork: twice as long; ★5: never.', unit: 'd', group: 'The jar' },
    range_m: { label: 'Storms and star showers it can catch, and zones it uncorks, within', hint: 'Storms and showers: of your explorer. Zones: of your explorer or any of your plots. Farsight stretches it.', unit: 'm', group: 'The jar' },
    vintage_x: { label: '★4 Vintage: moments come out ×', unit: 'x', group: 'Star powers' },
    zone_x: { label: 'An uncorked Hot Zone: ultras ×', hint: 'At full strength; a faded moment gives less.', unit: 'x', group: 'Uncorked zones' },
    zone_m: { label: 'An uncorked zone’s radius at level 1', hint: '+10 m a level.', unit: 'm', group: 'Uncorked zones' },
    zone_min: { label: 'An uncorked Hot Zone burns for', unit: 'min', group: 'Uncorked zones' },
    flare_s: { label: 'An uncorked Solar Flare lasts', unit: 's', group: 'Uncorked zones' },
    max_zones: { label: 'Zones burning at once', unit: 'n', group: 'Uncorked zones' },
    lev_part: { label: 'An uncorked weak moment lasts (share of the original)', hint: '0.5: a 10 s Weak Spot comes back for 5 s.', unit: 'x', group: 'The Leviathan' },
    lev_window_s: { label: 'Its move replays the hits of the last', unit: 's', group: 'The Leviathan' },
    lev_cap_x: { label: 'Its move’s replay is capped at (× its own move)', unit: 'x', group: 'The Leviathan' },
    stars: { label: 'Stars that fall from an uncorked falling star', unit: 'n', group: 'Falling stars' },
    star_ink: { label: 'A star that pays Ink pays', unit: 'ink', group: 'Falling stars' },
    star_luck: { label: 'A star that pays Luck pays', unit: 'n', group: 'Falling stars' },
    preserve_k: { label: 'Preserved: longer / sooner per strength', hint: '0.5: good things last 1.5× longer (2× for a Perfect Match), bad things pass 1.5× sooner.', unit: 'x', group: 'Its Trait' },
  },
  sun: {
    range_m: { label: 'How far away it can be lit', unit: 'm', group: 'Lighting a sun' },
    per_day: { label: 'Suns per day', unit: 'n', group: 'Lighting a sun' },
    max_suns: { label: 'Suns burning at once', unit: 'n', group: 'Lighting a sun' },
    r_min: { label: 'Size at level 1 (radius)', unit: 'm', group: 'Lighting a sun' },
    r_max: { label: 'Size at level 10 (radius)', unit: 'm', group: 'Lighting a sun' },
    fuel_h: { label: 'How long a sun burns', unit: 'h', group: 'Lighting a sun' },
    start_heat: { label: 'Heat when it’s lit', hint: 'It cools back to 30 at rest.', unit: 'heat', group: 'Lighting a sun' },
    sunspots: { label: 'Sunspots per sun', hint: 'Spots inside that roll a tier higher.', unit: 'n', group: 'Lighting a sun' },
    warm_x: { label: 'Warm: ultras & roll power ×', hint: 'The roll boost inside a warm sun.', unit: 'x', group: 'Power by heat' },
    hot_x: { label: 'Hot: ultras & roll power ×', unit: 'x', group: 'Power by heat' },
    white_x: { label: 'White-hot: ultras & roll power ×', unit: 'x', group: 'Power by heat' },
    nova_x: { label: 'Supernova: ultras & roll power ×', unit: 'x', group: 'Power by heat' },
    shiny_x: { label: 'Shiny chance × inside', unit: 'x', group: 'Power by heat' },
    conjunction_cap: { label: 'Most it can reach in a Conjunction', hint: 'A sun overlapping the daily Hot Zone multiplies by the Hot Zone’s ultra × — up to this.', unit: 'x', group: 'Power by heat' },
    hot_heat: { label: 'Heat where Hot begins', unit: 'heat', group: 'Heat' },
    white_heat: { label: 'Heat where White-hot begins', unit: 'heat', group: 'Heat' },
    stoke_heat: { label: 'Heat per rub', unit: 'heat', group: 'Heat' },
    snuff_pct: { label: 'Chance a rub past 95 heat snuffs it', unit: 'p', group: 'Heat' },
    cool_per_h: { label: 'Cools by (heat per hour)', unit: 'heat', group: 'Heat' },
    hot_r_x: { label: 'Hot: size ×', hint: '0.75 = a quarter smaller.', unit: 'x', group: 'Heat' },
    white_r_x: { label: 'White-hot: size ×', unit: 'x', group: 'Heat' },
    white_burn: { label: 'White-hot burns fuel ×', hint: '2 = twice as fast.', unit: 'x', group: 'Heat' },
    nova_s: { label: 'Supernova lasts', unit: 's', group: 'Heat' },
    nova_r_x: { label: 'Supernova size ×', unit: 'x', group: 'Heat' },
    flare_perfect_s: { label: 'Solar Flare: PERFECT lasts', unit: 's', group: 'Solar Flare' },
    flare_great_s: { label: 'Solar Flare: GREAT lasts', unit: 's', group: 'Solar Flare' },
    flare_good_s: { label: 'Solar Flare: GOOD lasts', unit: 's', group: 'Solar Flare' },
    flare_wide_s: { label: 'Solar Flare: WIDE lasts', unit: 's', group: 'Solar Flare' },
    orbit_x: { label: 'In orbit, warm: minigames pay ×', unit: 'x', group: 'In orbit' },
    orbit_hot: { label: 'In orbit, hot: minigames pay ×', unit: 'x', group: 'In orbit' },
    orbit_white: { label: 'In orbit, white-hot: minigames pay ×', unit: 'x', group: 'In orbit' },
    orbit_nova: { label: 'In orbit, supernova: minigames pay ×', unit: 'x', group: 'In orbit' },
    orbit_tick: { label: 'In orbit: enchantments under it tick faster by', hint: '0.1 = 10% faster.', unit: 'p', group: 'In orbit' },
    party_share: { label: 'A party mate gets this share of the boost', hint: 'Without ★4. 0.5 = half the extra.', unit: 'p', group: 'Party & Radiant' },
    party_tip: { label: 'Ink to the owner per party claim', unit: 'ink', group: 'Party & Radiant' },
    party_tips_day: { label: 'Party tips per day', unit: 'n', group: 'Party & Radiant' },
    radiant_m: { label: 'Radiant trait: reach per strength', unit: 'm', group: 'Party & Radiant' },
    radiant_x: { label: 'Radiant trait: boost per strength', hint: '0.5 = ×1.5 at strength 1.', unit: 'p', group: 'Party & Radiant' },
    star1_r_x: { label: '★1 Corona: size ×', unit: 'x', group: 'Star powers' },
    star2_fuel_x: { label: '★2 Long Day: burns ×', unit: 'x', group: 'Star powers' },
    star3_suns: { label: '★3 Binary Star: extra suns at once', unit: 'n', group: 'Star powers' },
    star3_per_day: { label: '★3 Binary Star: extra suns a day', unit: 'n', group: 'Star powers' },
    steady_star: { label: 'Solar Wind (white-hot never burns faster) at', hint: 'The star it comes at. 6 = never.', unit: 'star', group: 'Star powers' },
    full_party_star: { label: 'Party gets the full boost at', hint: 'The star it comes at. 6 = never.', unit: 'star', group: 'Star powers' },
    nova_star: { label: 'Supernova at', hint: 'The star it comes at. 6 = never.', unit: 'star', group: 'Star powers' },
  },
  genie: {
    wishes: { label: 'Wishes it holds', unit: 'n', group: 'Wishes' },
    recharge_h: { label: 'A wish comes back every', unit: 'h', group: 'Wishes' },
    wish_ink_min: { label: 'Ink wish: least', unit: 'ink', group: 'Wishes' },
    wish_ink_max: { label: 'Ink wish: most', unit: 'ink', group: 'Wishes' },
    wish_luck: { label: 'Luck wish gives', unit: 'n', group: 'Wishes' },
    wish_enchant: { label: 'Enchanted Luck wish gives', unit: 'n', group: 'Wishes' },
    golden_x: { label: 'Golden Hour: minigames pay ×', unit: 'x', group: 'Wishes' },
    golden_uses: { label: 'Golden Hour: games it covers', unit: 'n', group: 'Wishes' },
    golden_h: { label: 'Golden Hour lasts', unit: 'h', group: 'Wishes' },
    forbid_grant: { label: 'Forbidden Wish: chance it’s granted', hint: 'Granted below this roll…', unit: 'p', group: 'The Forbidden Wish' },
    forbid_twist: { label: 'Forbidden Wish: twisted below', hint: '…twisted between the two, freed above.', unit: 'p', group: 'The Forbidden Wish' },
    twist_ink: { label: 'A twist pays', unit: 'ink', group: 'The Forbidden Wish' },
    twist_cold_h: { label: 'A twist leaves the lamp cold for', unit: 'h', group: 'The Forbidden Wish' },
    freed_days: { label: 'Freed: the genie is gone for', unit: 'd', group: 'The Forbidden Wish' },
    star1_wishes: { label: '★1 Fourth Wish: extra wishes', unit: 'n', group: 'Star powers' },
    gift_ink: { label: '★2 Gift: Ink to the friend', unit: 'ink', group: 'Star powers' },
    gift_self: { label: '★2 Gift: Ink to you', unit: 'ink', group: 'Star powers' },
    boon_days: { label: '★3 Master’s Boon: every', unit: 'd', group: 'Star powers' },
    star4_wishes: { label: '★4 Fifth Wish: extra wishes', unit: 'n', group: 'Star powers' },
    star4_recharge_x: { label: '★4: wishes come back ×', hint: '0.75 = in three quarters of the time.', unit: 'x', group: 'Star powers' },
  },
  goose: {
    max: { label: 'Biggest an egg grows', unit: 'ink' },
    tau_h: { label: 'Egg growth time', hint: 'Hours to most of its size.', unit: 'h' },
    platinum: { label: 'Platinum egg chance', unit: 'p' },
    bite: { label: 'A fox bite takes', hint: '0.35 = a third of the egg.', unit: 'p' },
  },
  map: {
    cooldown_h: { label: 'A new map every', unit: 'h' },
    reach_m: { label: 'Picks up pieces from', unit: 'm' },
    dig_m: { label: 'Digs from', unit: 'm' },
    radius: { label: 'Pieces are hidden within', unit: 'm' },
    epic_ticket: { label: 'Chest: Epic+ ticket chance', unit: 'p' },
    legendary_ticket: { label: 'Chest: Legendary+ ticket chance', unit: 'p' },
  },
  parasite: { feed_h: { label: 'Feeds every', unit: 'h' } },
  pandora: { chaos_good: { label: 'Chaos turns out good', unit: 'p' }, blessing: { label: '★5: chance of a blessing', unit: 'p' } },
  clockwork: {
    turns: { label: 'Winding turns a day', unit: 'n' }, turn_min: { label: 'Minutes of charge per turn', unit: 'min' }, cap_min: { label: 'Most charge it holds', unit: 'min' },
    tick_min_h: { label: 'Charge it gains by itself per hour', unit: 'min' }, chime_ink: { label: 'Toll of Hours pays (at least)', unit: 'ink' },
    freeze_min_h: { label: 'Freezing costs (minutes per hour)', unit: 'min' }, rewind_h: { label: 'Rewind goes back', unit: 'h' }, rewind_deep_h: { label: '★4 Rewind goes back', unit: 'h' },
  },
  crucible: {
    melt_min_h: { label: 'Melting takes at least', unit: 'h' }, cap: { label: 'Most a strike can land', unit: 'p' }, cap_ultra: { label: 'Most a strike to an ultra can land', unit: 'p' },
    cap_crown: { label: 'Most a strike to a crown can land', unit: 'p' }, need_uncommon: { label: 'Heat to forge Uncommon', unit: 'n' }, need_rare: { label: 'Heat to forge Rare', unit: 'n' },
    need_epic: { label: 'Heat to forge Epic', unit: 'n' }, need_legendary: { label: 'Heat to forge Legendary', unit: 'n' }, need_mythic: { label: 'Heat to forge Mythic', unit: 'n' },
    need_ultra: { label: 'Heat to forge an ultra', unit: 'n' }, need_crown: { label: 'Heat to forge a crown', unit: 'n' },
  },
  deck: { foil: { label: 'Foil card chance', unit: 'p' }, reversed: { label: 'Reversed card chance', unit: 'p' } },
  glyph: { recharge_h: { label: 'Mana comes back every', unit: 'h' }, find: { label: 'Chance to find a page', unit: 'p' }, study: { label: 'Chance studying teaches', unit: 'p' } },
  oracle: { recharge_h: { label: 'A gaze comes back every', unit: 'h' }, fulfilled_ink: { label: 'A fulfilled prophecy pays', unit: 'ink' } },
  origami: { recharge_h: { label: 'Folds come back over', unit: 'h' }, far_m: { label: '★2 Paper Crane: unfolds up to', unit: 'm' } },
  puppeteer: { recharge_m: { label: 'A string comes back every', unit: 'min' }, range_m: { label: 'Strings reach', unit: 'm' } },
  rod: {
    h: { label: 'While tuned, the target’s natural chance ×', unit: 'x' }, h_specific: { label: '…for one ultra or one kind ×', unit: 'x' },
    m: { label: 'Full depth (× the target’s natural wait)', unit: 'x' }, m_specific: { label: '…for one ultra or one kind', unit: 'x' },
    slip_depth: { label: 'A lucky natural hit loses this much depth', unit: 'p' }, walk_m: { label: 'Divining Walk reaches', unit: 'm' },
  },
  shard: { cooldown_h: { label: 'Gaze again after', unit: 'h' }, hours: { label: 'A reflection lasts', unit: 'h' }, echo_s: { label: 'An echo repeats within', unit: 's' } },
  sizeray: { recharge_h: { label: 'A shot comes back every', unit: 'h' }, period_ms: { label: 'The aiming beam’s sweep', unit: 'ms' }, prank_cooldown_h: { label: 'Prank the same plot again after', unit: 'h' } },
  splice: {
    recharge_h: { label: 'A charge comes back every', unit: 'h' }, hours: { label: 'A splice lasts', unit: 'h' }, unstable: { label: 'A Chimera goes unstable', unit: 'p' },
    aberration: { label: 'Aberration chance', unit: 'p' }, bonus_max: { label: 'Most splice bonuses', unit: 'n' }, buy_ink: { label: 'Buying a charge costs', unit: 'ink' },
    buy_per_day: { label: 'Charges you can buy a day', unit: 'n' }, eggs_per_day: { label: 'Splice eggs a day', unit: 'n' }, goose_spark: { label: 'Goose splice: spark chance', unit: 'p' },
  },
  spyglass: { recharge_h: { label: 'A look comes back every', unit: 'h' }, range_m: { label: 'Looks reach', unit: 'm' }, keep_h: { label: 'A sighting is kept for', unit: 'h' }, crown_ppm: { label: 'Chance to sight a crown (per million)', unit: 'n' } },
  stormcoil: {
    per_day: { label: 'Storms a day', unit: 'n' }, bolts: { label: 'Bolts per storm', unit: 'n' }, secs: { label: 'A storm lasts', unit: 's' }, per_turn: { label: 'Charge per crank', unit: 'n' },
    scorch: { label: 'A missed Ink bolt scorches', unit: 'p' }, aberration: { label: 'Aberration chance', unit: 'p' }, charged_x: { label: 'Splices with it: Aberrations ×', unit: 'x' },
  },
  wormhole: { recharge_h: { label: 'Opens again after', unit: 'h' }, reach_km: { label: 'Its far end reaches', unit: 'km' } },
};

export const UNIT_SUFFIX: Record<Unit, string> = { x: '×', p: '', h: 'h', min: 'min', s: 's', ms: 'ms', m: 'm', km: 'km', ink: 'Ink', n: '', star: '★', heat: '°', d: 'days' };

/** a readable name for a number nobody has labelled yet */
export function prettyKey(k: string) {
  return k.replace(/_/g, ' ').replace(/\bx\b/, '×').replace(/\bh\b/, '(hours)').replace(/\bm\b/, '(m)').replace(/\bs\b/, '(seconds)').replace(/^./, (c) => c.toUpperCase());
}
/** how a value reads next to its input: 0.12 as a chance is "12%" */
export function readable(v: number, unit?: Unit) {
  if (!Number.isFinite(v)) return '';
  if (unit === 'p') return `${Math.round(v * 1000) / 10}%`;
  if (unit === 'h' && v < 1) return `${Math.round(v * 60)} min`;
  if (unit === 's' && v >= 120) return `${Math.round((v / 60) * 10) / 10} min`;
  if (unit === 'm' && v >= 1000) return `${Math.round(v / 100) / 10} km`;
  if (unit === 'star') return v >= 6 ? 'never' : `at ★${v}`;
  return '';
}
