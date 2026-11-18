// 📱 Outside (the apps): what the server answers for Bump, the Lasso walk and the real sky calendar.
export type BumpWho = { id: string; username: string; display_name: string | null; accent_color: string | null; explorer_style: unknown;
  avatar_seed: string; avatar_style?: string; avatar_path?: string | null };
export type BumpResult = { id: number; matched: boolean; pair?: number; with?: BumpWho; crowd: number; golden: boolean; can_gift?: boolean; gone?: boolean };
export type BumpMine = { enabled: boolean; gps: boolean; bumps: number; gifts_today: number; gifts_per_day: number; gift_min: number; gift_max: number; crowd: number;
  recent: (BumpWho & { at: string })[] };
export type LassoLoop = { id: number; mine: boolean; who: BumpWho; ring: [number, number][]; area_m2: number; expires_at: string };
export type LassoView = { enabled: boolean; gps: boolean; today: number;
  cfg: { max_kmh: number; close_m: number; min_len_m: number; min_area_m2: number; max_area_m2: number; min_minutes: number; per_day: number; hours: number };
  loops: LassoLoop[]; board: (BumpWho & { area_m2: number; me: boolean })[] };
export type SkyPass = { rise: string; set: string; max_elev: number };
export type SkyShower = { id: string; name: string; zhr: number; radiant: string; peak?: string };
export type SkyNow = { enabled: boolean; server_now: string; shower: SkyShower | null; showers: SkyShower[];
  moon: { phase: number; full: boolean; next_full: string; wish_mult: number };
  where: boolean; iss_data: boolean; passes: SkyPass[]; capsule: { pass: string; until: string; caught: boolean } | null;
  eyes: { per_window: number | null; cap_mult: number | null } };
