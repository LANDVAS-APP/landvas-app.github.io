// The dungeon's shapes (the server's private.rdun_* runs the maps, dice and fights; the app shows and sends moves).
export type Skill = { name: string; emoji: string; kind: 'stun' | 'all' | 'big' | 'heal' | 'execute'; mult: number; cd: number; blurb: string };
export type HeroCfg = { name: string; emoji: string; color: string; hp: number; atk: number; def: number; level: number; cost: number; skill: Skill };
export type DungeonCfg = {
  grid: number; party_size: number; heroes: Record<string, HeroCfg>;
  train: { loot: number; mat_per_lv: number; max_lv: number; hp_per_lv: number; atk_per_lv: number };
  mats: [string, number][]; death_keep: number; potion_heal: number;
};
export type Room = { t: 'start' | 'empty' | 'monster' | 'chest' | 'trap' | 'shrine' | 'stairs' | 'boss' | '?'; done: boolean; seen: boolean };
export type PartyHero = { h: string; hp: number; max: number; atk: number; def: number; cd: number; lv: number };
export type Enemy = { n: string; e: string; hp: number; max: number; atk: number; stun: number; boss?: boolean };
export type Run = { id: string; floor: number; start_floor: number; pos: string; rooms: Record<string, Room>; party: PartyHero[]; bag: Record<string, number>;
  fight: { enemies: Enemy[]; boss: boolean; round: number } | null; kills: number; boss_kills: number };
export type DungeonCore = { heroes: Record<string, { lv: number }>; party: string[]; best_floor: number; bosses: number; runs: number; run: Run | null; cfg: DungeonCfg };
export type LogEntry = { a: 'h' | 'e' | 'item'; i?: number; j?: number; h?: number; dmg?: number; heal?: number; crit?: boolean; stun?: boolean; k: 'hit' | 'skill' | 'heal' | 'potion' | 'bomb' | 'stunned' | 'miss' | 'fell' };
export type RunSummary = { bag: Record<string, number>; ink: number; floor: number; kills: number; kept: number };
export type ActResult = { log: LogEntry[]; won?: boolean; lost?: boolean; drop?: Record<string, number>; enemies?: Enemy[]; summary?: RunSummary };
export type MoveEvent = { fight?: boolean; chest?: Record<string, number>; trap?: boolean; shrine?: boolean };

export const parse = (k: string) => k.split(',').map(Number) as [number, number];
export const nb = (k: string) => { const [x, y] = parse(k); return [`${x},${y - 1}`, `${x + 1},${y}`, `${x},${y + 1}`, `${x - 1},${y}`]; };
/** what training a hero to the next level costs (the server's sum) */
export function trainCost(cfg: DungeonCfg, lv: number) {
  const mat = cfg.mats[Math.min(cfg.mats.length - 1, Math.floor((lv - 1) / 5))][0];
  return { loot: cfg.train.loot * lv * lv, [mat]: cfg.train.mat_per_lv * lv } as Record<string, number>;
}
export const heroStats = (cfg: DungeonCfg, h: string, lv: number) => { const c = cfg.heroes[h]; return { hp: Math.ceil(c.hp * (1 + cfg.train.hp_per_lv * (lv - 1))), atk: Math.round(c.atk * (1 + cfg.train.atk_per_lv * (lv - 1)) * 10) / 10 }; };
