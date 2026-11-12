// A client mirror of the server's Ink Flow (supabase/migrations/…_ink_flow.sql), for the owner's preview: simulates a
// day for a few kinds of player so the daily target can be tuned before saving. The server is authoritative.
export type FlowCfg = Record<string, any>;
export type SimPlayer = { id: string; name: string; note: string; sessions: [startH: number, hours: number, source: string][]; bot?: boolean };

export const SIM_PLAYERS: SimPlayer[] = [
  { id: 'casual', name: 'Casual', note: '40 min in the evening', sessions: [[18, 0.67, 'minigame']] },
  { id: 'daily', name: 'Daily player', note: 'an hour morning and evening', sessions: [[8, 1, 'minigame'], [19, 1, 'farm']] },
  { id: 'dedicated', name: 'Dedicated', note: '3 one-hour sessions', sessions: [[9, 1, 'minigame'], [13, 1, 'realm'], [20, 1, 'minigame']] },
  { id: 'grinder', name: 'Grinder', note: '10 hours straight, mixed games', sessions: [[8, 3, 'minigame'], [11, 3, 'realm'], [14, 4, 'arcade']] },
  { id: 'bot', name: 'Bot', note: '24 hours non-stop, machine timing', sessions: [[0, 24, 'minigame']], bot: true },
];

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const num = (v: unknown, d: number) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

/** one simulated day: an activity worth `raw` Ink every ~`gapS` seconds during each session */
export function simulateDay(cfg: FlowCfg, p: SimPlayer, raw = 10, gapS = 60) {
  const T = Math.max(num(cfg.daily_target, 1500), 50);
  const hh = num(cfg.heat_half_min, 45) * 60, lh = num(cfg.load_half_h, 8) * 3600, mh = num(cfg.momentum_half_min, 20) * 60;
  const r0 = num(cfg.ramp_start, 0.8), peak = num(cfg.ramp_peak, 1.15), jit = num(cfg.jitter, 0.04);
  const Ch = T * num(cfg.heat_share, 0.3), Cl = T * num(cfg.load_share, 0.9), Cs = T * num(cfg.source_share, 0.35), Cd = T * num(cfg.day_share, 1.2), Dm = T * num(cfg.day_max_share, 1.5);
  const floorInk = num(cfg.floor_ink, 1), floorMin = num(cfg.floor_min_raw, 4), botF = num(cfg.bot_factor, 0.6);
  const rand = rng(7 + p.id.length);
  let heat = 0, load = 0, mom = 0, paid = 0, rawSum = 0, t = 0, last: number | null = null;
  const src: Record<string, number> = {}; const hourly = new Array(24).fill(0);
  for (const [startH, hours, source] of p.sessions) {
    t = Math.max(t, startH * 3600); const end = t + hours * 3600;
    while (t < end) {
      const dt = last == null ? 0 : t - last;
      heat *= 2 ** (-dt / hh); load *= 2 ** (-dt / lh); mom *= 2 ** (-dt / mh);
      for (const k of Object.keys(src)) src[k] *= 2 ** (-dt / hh);
      const ramp = r0 + (peak - r0) * Math.min(Math.max(mom, 0), 1);
      const m = Math.min(ramp / (1 + (heat / Ch) ** 2) / (1 + (load / Cl) ** 3) * Math.sqrt(1 / (1 + ((src[source] ?? 0) / Cs) ** 2)) / (1 + (paid / Cd) ** 6) * (p.bot && cfg.enabled !== false ? botF : 1), peak);
      const x = raw * m * (1 + (rand() * 2 - 1) * jit);
      let pay = Math.floor(x) + (rand() < x - Math.floor(x) ? 1 : 0);
      if (pay < 1 && raw >= floorMin) {
        const fp = (paid < Dm ? 1 : Math.max(0.05, 0.5 * (Dm / Math.max(paid, 1)) ** 4)) * (p.bot ? 0.5 : 1);
        pay = rand() < fp ? floorInk : 0;
      }
      pay = Math.min(Math.max(pay, 0), Math.ceil(raw * peak));
      heat += pay; load += pay; paid += pay; src[source] = (src[source] ?? 0) + pay; mom += (1 - Math.min(Math.max(mom, 0), 1)) * 0.15;
      rawSum += raw; hourly[Math.min(23, Math.floor(t / 3600))] += pay; last = t;
      t += p.bot ? gapS : gapS * (0.5 + rand());
    }
  }
  return { paid, raw: rawSum, hourly, ofTarget: paid / T };
}
