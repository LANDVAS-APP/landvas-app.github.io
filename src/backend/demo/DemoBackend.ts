// 🎨 The Paintbrawl instant demo's backend: no database at all. The offline preview used to boot the whole game's
// Postgres (PGlite, ~16MB of wasm and 100+ migrations) just to play cards, and older iPhones ran out of memory doing it
// ("A problem repeatedly occurred"). This keeps one guest player's cards, decks and matches in plain objects (saved to
// localStorage when it can) and runs every move through the very same rules engine, bot and server code as the real
// game, so a demo match plays exactly like a real one.
import type { Backend, Session } from '../backend';
import { GameError, toGameError } from '../backend';
import { CARD, CARDS, RARITY_INFO, STARTERS, TERRAINS, checkDeck, type Rarity } from '../../shared/brawl/cards';
import type { State } from '../../shared/brawl/engine';

const UID = '00000000-0000-4000-8000-00000000d3e0';
const KEY = 'landvas.brawl-demo.v1';
const ARENA = 'demo-arena';
const PROFILE = { id: UID, username: 'Guest', display_name: 'Guest', avatar_seed: 'guest-demo', avatar_style: 'prism' as const, accent_color: '#7B5CFF', avatar_path: null };

const RANKS: [string, number, string][] = [['Bronze', 0, '🥉'], ['Silver', 200, '🥈'], ['Gold', 500, '🥇'], ['Platinum', 900, '💎'], ['Diamond', 1400, '🔷'], ['Legend', 2000, '👑']];
const CFG = {
  pack_cost: 120, pack_size: 5, foil_chance: 0.05,
  weights: { common: 70, rare: 22, epic: 7, legendary: 1 } as Record<Rarity, number>,
  dust: { common: 5, rare: 20, epic: 100, legendary: 400 } as Record<Rarity, number>,
  craft: { common: 40, rare: 100, epic: 400, legendary: 1600 } as Record<Rarity, number>,
  max_copies: Object.fromEntries(Object.entries(RARITY_INFO).map(([r, i]) => [r, i.max])) as Record<Rarity, number>,
  deck_size: 20, turn_seconds: 75,
  reward: { win: 50, loss: 15, draw: 25, bot_win: 25, bot_loss: 5, bot_full_per_day: 6, bot_after: 6, first_win_pack: true },
  ranks: RANKS, terrains: [...TERRAINS] as string[],
  cards: Object.fromEntries(CARDS.map((c) => [c.id, c.rarity])) as Record<string, Rarity>,
};

type Deck = { name: string; cards: string[]; terrains: string[] } | null;
type Match = { id: string; at: string; bot_name: string; bot_skill: number; state: State | null; v: number; status: 'live' | 'over'; winner: number | null; reason: string | null; rewards: unknown };
type Save = {
  cards: Record<string, number>; foils: Record<string, number>; dust: number; shards: number; decks: Deck[]; deck_slot: number;
  bot_wins: number; bot_wins_today: number; wins_today: number; packs: number; day: string; first_win_day: string | null; free_pack_day: string | null;
  matches: Match[];
};

const today = () => new Date().toISOString().slice(0, 10);
const rank = (t: number) => { const r = [...RANKS].reverse().find(([, min]) => min <= t)!; return { name: r[0], min: r[1], emoji: r[2] }; };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const allCards = () => Object.fromEntries(CARDS.map((c) => [c.id, RARITY_INFO[c.rarity].max]));

function fresh(): Save {
  return {
    cards: allCards(), foils: {}, dust: 2000, shards: 5000, decks: clone(STARTERS), deck_slot: 0,
    bot_wins: 0, bot_wins_today: 0, wins_today: 0, packs: 0, day: today(), first_win_day: null, free_pack_day: null, matches: [],
  };
}

export class DemoBackend implements Backend {
  readonly mode = 'local' as const;
  readonly demo = true;
  ephemeral = false;
  private s: Save = fresh();
  private me: Session = { userId: UID, email: null };

  async init() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.s = { ...fresh(), ...JSON.parse(raw) };
    } catch { this.ephemeral = true; }
    // the demo has every card, and plenty to spend
    for (const [id, n] of Object.entries(allCards())) this.s.cards[id] = Math.max(this.s.cards[id] ?? 0, n);
    this.s.shards = Math.max(this.s.shards, 5000);
    if (this.s.day !== today()) Object.assign(this.s, { day: today(), wins_today: 0, bot_wins_today: 0 });
    this.save();
  }

  private save() {
    // keep the full state of the live (or just-finished) match only; older ones just need their summary for the history
    const live = this.s.matches.find((m) => m.status === 'live');
    this.s.matches = this.s.matches.slice(0, 15).map((m, i) => (m === live || i === 0 ? m : { ...m, state: null }));
    if (this.ephemeral) return;
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* storage full or blocked: carry on in memory */ }
  }

  session() { return this.me; }
  onAuthChange() { return () => {}; }
  async signUp() { return { needsConfirmation: false }; }
  async signIn() {}
  async signOut() {}

  private bme() {
    const s = this.s, live = s.matches.find((m) => m.status === 'live');
    return {
      cards: s.cards, foils: s.foils, dust: s.dust, decks: s.decks, deck_slot: s.deck_slot, trophies: 0, best: 0, rank: rank(0),
      wins: 0, losses: 0, draws: 0, streak: 0, bot_wins: s.bot_wins, packs: s.packs, wins_today: s.wins_today, bot_wins_today: s.bot_wins_today,
      first_win_ready: s.first_win_day !== today(), free_pack_ready: s.free_pack_day !== today(), shards: s.shards,
      live: live?.id ?? null, queued: false, queued_since: null, cfg: CFG, server_time: new Date().toISOString(),
    };
  }
  private profile() { return { ...PROFILE, trophies: 0, rank: rank(0) }; }
  private realm() {
    return {
      id: ARENA, kind: 'brawl', group_id: null, seed: 1, name: 'Demo Arena', plots: 1, owner: PROFILE, mine: true,
      level: { level: 1, xp: 0, into: 0, need: 100, max: false }, plays: 0, producers: {}, upgrades: {}, rates: {}, pending: null,
      collected_at: new Date().toISOString(), away_hours: 0, effects: { game_mult: 1, rare_mult: 1, prod_mult: 1 }, costs: { producers: {}, upgrades: {} },
      cfg: {}, boards: {}, me: {}, server_time: new Date().toISOString(),
    };
  }
  private myState() {
    const now = new Date().toISOString();
    return {
      onboarded: true, user_id: UID, terms_current: 'demo', server_time: now,
      player: { status: 'active', suspended_until: null, suspension_reason: null, strikes: 0, terms_version: 'demo', terms_accepted_at: now, starter_plot_claimed: true, created_at: now },
      profile: PROFILE, balances: { ink: 1000 }, rent: {}, explorer: null, plot_count: 1, group_count: 1, unlocks: [], roles: [], artist_level: 1, achievement_count: 0,
    };
  }
  private match(id: unknown) {
    const m = this.s.matches.find((x) => x.id === id);
    if (!m) throw new GameError('not_found');
    return m;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async rpc<T = any>(fn: string, a: Record<string, any> = {}): Promise<T> {
    const s = this.s;
    const out = (x: unknown) => { this.save(); return clone(x) as T; };
    switch (fn) {
      case 'my_state': return out(this.myState());
      case 'my_groups': return out([{ id: 'demo-group', kind: 'brawl', realm_id: ARENA, name: 'Demo Arena' }]);
      case 'realm_get': return out(this.realm());
      case 'brawl_get': return out({ ...this.realm(), brawl: this.bme() });
      case 'brawl_deck_save': {
        const slot = Number(a.p_slot);
        if (!Number.isInteger(slot) || slot < 0 || slot > 2) throw new GameError('invalid_input');
        const why = checkDeck(a.p_cards ?? [], a.p_terrains ?? [], s.cards);
        if (why) throw new GameError('deck_invalid', why);
        while (s.decks.length <= slot) s.decks.push(null);
        s.decks[slot] = { name: String(a.p_name || `Deck ${slot + 1}`).trim().slice(0, 24) || `Deck ${slot + 1}`, cards: [...a.p_cards], terrains: [...a.p_terrains] };
        s.deck_slot = slot;
        return out(this.bme());
      }
      case 'brawl_deck_use': {
        const slot = Number(a.p_slot);
        if (!s.decks[slot]) throw new GameError('invalid_input');
        s.deck_slot = slot;
        return out(this.bme());
      }
      case 'brawl_pack_open': {
        if (a.p_free) {
          if (s.free_pack_day === today()) throw new GameError('already_claimed');
          s.free_pack_day = today();
        } else {
          if (s.shards < CFG.pack_cost) throw new GameError('not_enough');
          s.shards -= CFG.pack_cost;
        }
        const order = (Object.entries(CFG.weights) as [Rarity, number][]).sort((x, y) => y[1] - x[1]);
        const tot = order.reduce((n, [, w]) => n + w, 0);
        const better = (r: Rarity, best: Rarity) => ['common', 'rare', 'epic', 'legendary'].indexOf(r) > ['common', 'rare', 'epic', 'legendary'].indexOf(best);
        let best: Rarity = 'common';
        const cards = [];
        for (let i = 1; i <= CFG.pack_size; i++) {
          let roll = Math.random() * tot, r: Rarity = 'common';
          for (const [k, w] of order) { if (roll < w) { r = k; break; } roll -= w; }
          if (i === CFG.pack_size && best === 'common' && r === 'common') r = 'rare';
          if (better(r, best)) best = r;
          const pool = CARDS.filter((c) => c.rarity === r);
          const id = pool[Math.floor(Math.random() * pool.length)].id;
          const foil = Math.random() < CFG.foil_chance;
          cards.push({ id, rarity: r, foil, new: (s.cards[id] ?? 0) === 0 });
          s.cards[id] = (s.cards[id] ?? 0) + 1;
          if (foil) s.foils[id] = (s.foils[id] ?? 0) + 1;
        }
        s.packs++;
        return out({ cards, me: this.bme() });
      }
      case 'brawl_craft': {
        const c = CARD[a.p_card];
        if (!c) throw new GameError('not_found');
        const have = s.cards[c.id] ?? 0;
        if (a.p_dust) {
          const need = Math.max(0, ...s.decks.map((d) => d?.cards.filter((x) => x === c.id).length ?? 0));
          if (have <= need) throw new GameError('brawl_card_in_deck');
          s.cards[c.id] = have - 1; s.dust += CFG.dust[c.rarity];
        } else {
          if (have >= CFG.max_copies[c.rarity]) throw new GameError('maxed');
          if (s.dust < CFG.craft[c.rarity]) throw new GameError('not_enough');
          s.cards[c.id] = have + 1; s.dust -= CFG.craft[c.rarity];
        }
        return out(this.bme());
      }
      case 'brawl_queue_leave': return out(this.bme());
      case 'brawl_view': {
        const m = this.match(a.p_match);
        if (!m.state) throw new GameError('not_found');
        const { viewFor } = await import('../../shared/brawl/engine');
        return out({
          id: m.id, side: 0, view: viewFor(m.state, 0), v: m.v, status: m.status, winner: m.winner, reason: m.reason, deadline: null,
          server_time: new Date().toISOString(), bot: true, rewards: m.rewards,
          players: [this.profile(), { id: null, username: m.bot_name, bot: true, trophies: 0, rank: rank(0) }],
        });
      }
      // the demo's bank (set your own shards and dust) and "unlock every card"
      case 'demo_bank':
        s.shards = Math.max(0, Math.min(9_999_999, Math.floor(Number(a.shards) || 0)));
        s.dust = Math.max(0, Math.min(9_999_999, Math.floor(Number(a.dust) || 0)));
        return out(this.bme());
      case 'demo_unlock_all':
        for (const [id, n] of Object.entries(allCards())) s.cards[id] = Math.max(s.cards[id] ?? 0, n);
        return out(this.bme());
      case 'brawl_leaderboard': return out({ top: [], me: this.profile(), place: 1 });
      case 'brawl_history':
        return out(s.matches.filter((m) => m.status === 'over').map((m) => ({
          id: m.id, at: m.at, bot: true, status: m.status, reason: m.reason, won: m.winner === 0, draw: m.winner === -1, opponent: { username: m.bot_name, bot: true }, trophies: 0,
        })));
      // the game's background calls (notifications, presence, …) have nothing to say in the demo
      default: return null as T;
    }
  }

  /** The service-side calls the shared server code makes (the real game runs these in Postgres). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async svc(fn: string, a: Record<string, any>): Promise<any> {
    const s = this.s;
    const live = s.matches.find((m) => m.status === 'live');
    switch (fn) {
      case 'svc_brawl_bot': case 'svc_brawl_enqueue': {
        if (live) return { match: live.id };
        const d = s.decks[s.deck_slot];
        const why = d ? checkDeck(d.cards, d.terrains, s.cards) : 'deck_size';
        if (why) throw new GameError('deck_invalid', why);
        return { a: { id: UID, name: PROFILE.username, deck: d!.cards, terrains: d!.terrains }, trophies: 0, bot_wins: s.bot_wins };
      }
      case 'svc_brawl_create': {
        const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        s.matches.unshift({ id, at: new Date().toISOString(), bot_name: a.p_bot_name ?? 'Practice bot', bot_skill: Number(a.p_bot_skill ?? 0.8), state: a.p_state, v: Number(a.p_state?.v ?? 0), status: 'live', winner: null, reason: null, rewards: null });
        this.save();
        return id;
      }
      case 'svc_brawl_load': {
        const m = s.matches.find((x) => x.id === a.p_match);
        if (!m || !m.state) return null;
        return { state: clone(m.state), v: m.v, side: 0, bot: true, bot_skill: m.bot_skill, status: m.status, deadline: null, expired: false };
      }
      case 'svc_brawl_save': {
        const m = s.matches.find((x) => x.id === a.p_match);
        if (!m || m.status !== 'live' || m.v !== a.p_v) return { ok: false };
        const st = a.p_state as State & { lab?: boolean };
        m.state = st; m.v = Number(st.v);
        if (!st.over) { this.save(); return { ok: true }; }
        m.status = 'over'; m.winner = st.winner as number; m.reason = st.reason ?? null;
        m.rewards = this.finish(m, !!st.lab);
        this.save();
        return { ok: true, rewards: { a: m.rewards } };
      }
    }
    throw new Error(`demo: ${fn}`);
  }

  private finish(m: Match, lab: boolean) {
    const s = this.s, rw = CFG.reward;
    const result = m.winner === -1 ? 'draw' : m.winner === 0 ? 'win' : 'loss';
    if (lab) return { result, shards: 0, trophies: 0, ink: 0, pack: false, level_up: null, lab: true, total: 0 };
    const shards = result === 'win' ? (s.bot_wins_today < rw.bot_full_per_day ? rw.bot_win : rw.bot_after) : rw.bot_loss;
    const pack = result === 'win' && s.first_win_day !== today();
    if (result === 'win') { s.bot_wins++; s.bot_wins_today++; s.wins_today++; }
    if (pack) { s.first_win_day = today(); s.free_pack_day = null; }
    s.shards += shards;
    return { result, shards, trophies: 0, ink: result === 'win' ? 1 : 0, pack, level_up: null, total: 0 };
  }

  async brawl(body: import('../../shared/brawl/server').BrawlBody) {
    const { brawlOp, BrawlError } = await import('../../shared/brawl/server');
    try {
      return await brawlOp((fn, args) => this.svc(fn, args), UID, body);
    } catch (e) {
      if (e instanceof BrawlError) throw new GameError(e.message);
      throw toGameError(e);
    }
  }

  /** For the browser tests only: the two queries they use to read and rig the live match. */
  testDb() {
    return {
      query: async (q: string, args: unknown[] = []) => {
        const live = this.s.matches.find((m) => m.status === 'live');
        if (/^\s*update brawl_matches set state/i.test(q)) {
          const m = this.s.matches.find((x) => x.id === args[1]);
          if (m) { m.state = (typeof args[0] === 'string' ? JSON.parse(args[0]) : args[0]) as State; this.save(); }
          return { rows: [] };
        }
        return { rows: live ? [{ id: live.id, state: clone(live.state) }] : [] };
      },
    };
  }

  async resetLocalData() { this.s = fresh(); try { localStorage.removeItem(KEY); } catch { /* */ } }

  // the rest of the game isn't part of the demo
  async uploadDraftTile() {}
  async downloadDraftTile() { return null; }
  async uploadSubmission() {}
  async publicAssetUrl() { return null; }
  async privateAssetUrl() { return null; }
  async uploadAvatar() {}
  async avatarUrl() { return null; }
  async artTile() { return null; }
  async finishMinigame(): Promise<never> { throw new GameError('not_available'); }
  async finishPvp(): Promise<never> { throw new GameError('not_available'); }
  async kickPipeline() {}
  subscribeMapUpdates() { return () => {}; }
}
