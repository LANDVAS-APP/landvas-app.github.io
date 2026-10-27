-- LANDVAS core schema
-- ---------------------------------------------------------------------------
-- Grid: plots are Web Mercator XYZ tiles at zoom 16 (65,536 x 65,536 cells).
--   gx = floor((lng + 180) / 360 * 2^16)
--   gy = floor((1 - ln(tan(lat) + sec(lat)) / pi) / 2 * 2^16)
-- A plot is identified by (gx, gy). Only plots that have ever been claimed are
-- stored; the type of an unclaimed plot is a deterministic hash of (gx, gy).
-- x wraps at the antimeridian (gx 0 and 65535 are neighbours), y does not.
-- See docs/GRID.md.
-- ---------------------------------------------------------------------------

create schema if not exists private;

-- ===== Configuration ========================================================

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_.]{2,64}$'),
  enabled boolean not null default false,
  is_public boolean not null default true,
  description text not null default '',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.game_config (
  key text primary key check (key ~ '^[a-z0-9_]{2,64}$'),
  value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ===== Players ==============================================================

create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  suspended_until timestamptz,
  suspension_reason text,
  strikes int not null default 0 check (strikes >= 0),
  terms_version text,
  terms_accepted_at timestamptz,
  starter_plot_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references public.players(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  avatar_seed text not null default md5(random()::text),
  avatar_style text not null default 'prism' check (avatar_style in ('prism', 'orbit', 'mosaic', 'bloom')),
  accent_color text not null default '#7B5CFF' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  bio text check (char_length(bio) <= 280),
  featured_publication_id uuid,
  favorite_publication_ids uuid[] not null default '{}' check (cardinality(favorite_publication_ids) <= 6),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- ===== Plot types ===========================================================

create table public.plot_types (
  id text primary key check (id in ('graphite', 'pigment', 'mosaic', 'lumina')),
  name text not null,
  minigame text not null unique check (minigame in ('tracecraft', 'colorburst', 'patternshift', 'lightlines')),
  minigame_name text not null,
  tagline text not null,
  color_primary text not null,
  color_secondary text not null,
  weight int not null check (weight >= 0),
  acquire_multiplier numeric(6, 3) not null default 1 check (acquire_multiplier > 0),
  sort int not null default 0
);

-- ===== Plot rarities ========================================================
-- Every plot has one of five rarities, fixed by a deterministic hash of its
-- cell (see private.plot_rarity_for / src/shared/rarity.ts), so rarity is
-- visible on the map before anyone claims the plot. Rarity sets the plot's
-- USD rent rate and multiplies the Ink its minigame pays out.
-- Changing weights re-rolls UNCLAIMED plots only (claimed plots store theirs).

create table public.plot_rarities (
  id text primary key check (id in ('common', 'rare', 'epic', 'legendary', 'mythic')),
  name text not null,
  weight int not null check (weight >= 0),
  usd_per_second numeric(20, 15) not null check (usd_per_second >= 0),
  ink_reward_multiplier numeric(6, 3) not null default 1 check (ink_reward_multiplier > 0),
  price_multiplier numeric(6, 3) not null default 1 check (price_multiplier > 0),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  glow text not null check (glow ~ '^#[0-9A-Fa-f]{6}$'),
  sort int not null default 0
);

-- ===== Canvas groups (Canvas Fusion) ========================================

create table public.canvas_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players(id) on delete cascade,
  name text not null default 'Untitled canvas' check (char_length(name) between 1 and 60),
  status text not null default 'active' check (status in ('active', 'merged', 'dissolved')),
  merged_into uuid references public.canvas_groups(id),
  plot_count int not null default 0 check (plot_count >= 0),
  -- bounding box in *unwrapped* grid coordinates (min_gx may be < 0 when a
  -- canvas crosses the antimeridian)
  min_gx int, min_gy int, max_gx int, max_gy int,
  project_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index canvas_groups_owner_idx on public.canvas_groups (owner_id) where status = 'active';

-- ===== World plots ==========================================================

create table public.world_plots (
  gx int not null check (gx between 0 and 65535),
  gy int not null check (gy between 0 and 65535),
  bx int generated always as (gx >> 6) stored,
  by int generated always as (gy >> 6) stored,
  plot_type text not null references public.plot_types(id),
  rarity text not null references public.plot_rarities(id),
  owner_id uuid references public.players(id) on delete set null,
  level int not null default 1 check (level between 1 and 10),
  claimed_at timestamptz,
  art_publication_id uuid,
  art_rev bigint,
  locked boolean not null default false,
  lock_reason text,
  updated_at timestamptz not null default now(),
  primary key (gx, gy),
  check ((owner_id is null) = (claimed_at is null))
);
create index world_plots_block_idx on public.world_plots (by, bx);
create index world_plots_owner_idx on public.world_plots (owner_id) where owner_id is not null;

create table public.canvas_group_members (
  group_id uuid not null references public.canvas_groups(id) on delete cascade,
  gx int not null,
  gy int not null,
  added_at timestamptz not null default now(),
  primary key (gx, gy),
  foreign key (gx, gy) references public.world_plots(gx, gy) on delete cascade
);
create index canvas_group_members_group_idx on public.canvas_group_members (group_id);

-- Ownership history (immutable log; one open row per plot).
create table public.plot_ownership (
  id bigint generated always as identity primary key,
  gx int not null,
  gy int not null,
  player_id uuid not null references public.players(id) on delete cascade,
  method text not null check (method in ('starter', 'acquire', 'admin_grant', 'purchase')),
  cost jsonb not null default '{}'::jsonb,
  acquired_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text
);
create unique index plot_ownership_open_idx on public.plot_ownership (gx, gy) where released_at is null;
create index plot_ownership_player_idx on public.plot_ownership (player_id);

-- Aggregated ownership density for low-zoom map rendering (maintained by trigger).
create table public.world_density (
  z smallint not null,
  x int not null,
  y int not null,
  owned int not null default 0 check (owned >= 0),
  primary key (z, x, y)
);

-- ===== Artwork ==============================================================

create table public.artwork_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players(id) on delete cascade,
  group_id uuid not null references public.canvas_groups(id) on delete cascade,
  title text not null default 'Untitled' check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 500),
  status text not null default 'active' check (status in ('active', 'archived')),
  current_version_id uuid,
  version_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index artwork_projects_owner_idx on public.artwork_projects (owner_id);
create index artwork_projects_group_idx on public.artwork_projects (group_id);

alter table public.canvas_groups
  add constraint canvas_groups_project_fk foreign key (project_id) references public.artwork_projects(id) on delete set null;

-- Immutable snapshots. manifest = {"layers":[{"id","name","opacity","visible",
-- "tiles":{"<gx>_<gy>":"<sha256 of PNG>"}}]}. Tile images are content-addressed
-- in storage at drafts/<owner_id>/<sha256>.png, so versions never overwrite art.
create table public.artwork_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.artwork_projects(id) on delete cascade,
  owner_id uuid not null references public.players(id) on delete cascade,
  version_no int not null,
  parent_version_id uuid references public.artwork_versions(id) on delete set null,
  kind text not null check (kind in ('initial', 'save', 'merge', 'split', 'restore')),
  manifest jsonb not null,
  cells jsonb not null,
  layer_count int not null,
  tile_count int not null,
  note text,
  created_at timestamptz not null default now(),
  unique (project_id, version_no)
);

alter table public.artwork_projects
  add constraint artwork_projects_version_fk foreign key (current_version_id) references public.artwork_versions(id) on delete set null;

create table public.artwork_layers (
  project_id uuid not null references public.artwork_projects(id) on delete cascade,
  layer_id text not null check (layer_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  position int not null,
  name text not null check (char_length(name) between 1 and 40),
  opacity real not null default 1 check (opacity between 0 and 1),
  visible boolean not null default true,
  tile_count int not null default 0,
  primary key (project_id, layer_id)
);

create table public.artwork_publications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players(id) on delete cascade,
  project_id uuid not null references public.artwork_projects(id) on delete cascade,
  version_id uuid not null references public.artwork_versions(id) on delete cascade,
  group_id uuid not null references public.canvas_groups(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 500),
  cells jsonb not null,
  plot_count int not null check (plot_count > 0),
  min_gx int not null, min_gy int not null, max_gx int not null, max_gy int not null,
  center_lng double precision not null,
  center_lat double precision not null,
  status text not null default 'uploading' check (status in (
    'uploading', 'processing', 'pending_review', 'approved', 'published',
    'rejected', 'superseded', 'removed', 'cancelled', 'failed')),
  rights_affirmed_at timestamptz not null,
  terms_version text not null,
  submitted_at timestamptz,
  processed_at timestamptz,
  reviewed_by uuid references public.players(id) on delete set null,
  reviewed_at timestamptz,
  decision_reason text,
  published_at timestamptz,
  removed_at timestamptz,
  preview_path text,
  thumb_path text,
  preview_width int,
  preview_height int,
  color_count int,
  screening jsonb,
  appreciation_count int not null default 0 check (appreciation_count >= 0),
  report_count int not null default 0 check (report_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index artwork_publications_status_idx on public.artwork_publications (status, published_at desc);
create index artwork_publications_owner_idx on public.artwork_publications (owner_id, created_at desc);
create index artwork_publications_group_idx on public.artwork_publications (group_id);
create index artwork_publications_appreciated_idx on public.artwork_publications (appreciation_count desc) where status = 'published';
create index artwork_publications_largest_idx on public.artwork_publications (plot_count desc) where status = 'published';

alter table public.profiles
  add constraint profiles_featured_fk foreign key (featured_publication_id) references public.artwork_publications(id) on delete set null;

-- Which publication each plot displayed, and when (enables restoration).
create table public.plot_art_history (
  id bigint generated always as identity primary key,
  gx int not null,
  gy int not null,
  publication_id uuid references public.artwork_publications(id) on delete cascade,
  rev bigint,
  set_at timestamptz not null default now()
);
create index plot_art_history_cell_idx on public.plot_art_history (gx, gy, id desc);

-- Server-generated assets (pipeline outputs). Draft tiles are tracked by manifests.
create table public.asset_metadata (
  id bigint generated always as identity primary key,
  owner_id uuid references public.players(id) on delete set null,
  publication_id uuid references public.artwork_publications(id) on delete set null,
  kind text not null check (kind in ('plot_art', 'art_tile', 'preview', 'thumb', 'processed_tile')),
  bucket text not null,
  path text not null,
  bytes int,
  width int,
  height int,
  sha256 text,
  content_type text,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);

-- Map art tile pyramid index (z8..z16). Images live at public-art/tiles/z/x/y/<rev>.png
create table public.art_tiles (
  z smallint not null check (z between 0 and 16),
  x int not null,
  y int not null,
  rev bigint not null,
  bx int generated always as (x >> 4) stored,
  by int generated always as (y >> 4) stored,
  bytes int,
  updated_at timestamptz not null default now(),
  primary key (z, x, y)
);
create index art_tiles_block_idx on public.art_tiles (z, by, bx);
create sequence private.art_tile_rev_seq;

-- Realtime fan-out: one small row per change; clients invalidate regions.
create table public.map_updates (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('art', 'ownership')),
  min_gx int not null, min_gy int not null, max_gx int not null, max_gy int not null,
  publication_id uuid,
  created_at timestamptz not null default now()
);
create index map_updates_created_idx on public.map_updates (created_at);

-- ===== Economy ==============================================================

create table public.resource_balances (
  player_id uuid not null references public.players(id) on delete cascade,
  resource text not null check (resource in ('ink', 'pigments', 'brush_points', 'gallery_tokens')),
  amount bigint not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, resource)
);

create table public.resource_ledger (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  resource text not null check (resource in ('ink', 'pigments', 'brush_points', 'gallery_tokens')),
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text not null,
  ref_type text,
  ref_id text,
  idempotency_key text,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create unique index resource_ledger_idem_idx on public.resource_ledger (player_id, resource, idempotency_key) where idempotency_key is not null;
create index resource_ledger_player_idx on public.resource_ledger (player_id, created_at desc);

-- ===== USD rent ============================================================
-- Owned plots accrue rent in USD per second at their rarity's rate (plus 1%
-- per plot level). Accrual is computed from server time and settled into
-- balance_usd whenever the rate or boost changes (private.rent_settle), so it
-- is exact without background jobs. A boost multiplies the rate for the boost
-- window [settled_at, boost_until]. Amounts use numeric(24,15) — exact to
-- 1e-15 USD. Whether balances are redeemable is governed by the cash-out
-- module (disabled until the operator enables payouts; see docs/COMPLIANCE.md).

create table public.rent_accounts (
  player_id uuid primary key references public.players(id) on delete cascade,
  balance_usd numeric(24, 15) not null default 0 check (balance_usd >= 0),
  held_usd numeric(24, 15) not null default 0 check (held_usd >= 0),
  lifetime_usd numeric(24, 15) not null default 0 check (lifetime_usd >= 0),
  paid_usd numeric(24, 15) not null default 0 check (paid_usd >= 0),
  settled_at timestamptz not null default now(),
  boost_until timestamptz,
  boost_day date,
  boosts_used int not null default 0 check (boosts_used >= 0),
  updated_at timestamptz not null default now()
);

create table public.rent_ledger (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in ('rent', 'cashout_hold', 'cashout_release', 'cashout_paid', 'adjustment')),
  amount_usd numeric(24, 15) not null,
  balance_after numeric(24, 15) not null check (balance_after >= 0),
  seconds numeric(14, 3),
  boosted_seconds numeric(14, 3),
  rate_usd_per_second numeric(24, 18),
  ref text,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index rent_ledger_player_idx on public.rent_ledger (player_id, id desc);

create table public.boost_activations (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  source text not null check (source in ('free', 'ad', 'admin', 'event')),
  minutes int not null check (minutes > 0),
  boost_until timestamptz not null,
  created_at timestamptz not null default now()
);
create index boost_activations_player_idx on public.boost_activations (player_id, created_at desc);

-- ===== Explorer (player position) ==========================================
-- Plots can only be claimed near the player's explorer. Its position comes
-- from GPS reports (speed-checked) or, where GPS is unavailable, from manual
-- travel at a fixed speed (interpolated from fixed_at) or a rare instant jump.
-- PRIVATE: readable only by the player; never exposed to other players.

create table public.explorers (
  player_id uuid primary key references public.players(id) on delete cascade,
  mode text not null check (mode in ('gps', 'manual')),
  lng double precision not null check (lng between -180 and 180),
  lat double precision not null check (lat between -85.06 and 85.06),
  fixed_at timestamptz not null default now(),
  accuracy_m real,
  dest_lng double precision check (dest_lng between -180 and 180),
  dest_lat double precision check (dest_lat between -85.06 and 85.06),
  speed_mps real check (speed_mps > 0),
  last_jump_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((dest_lng is null) = (dest_lat is null))
);

create table public.player_unlocks (
  player_id uuid not null references public.players(id) on delete cascade,
  unlock_key text not null check (unlock_key ~ '^[a-z0-9_.]{2,48}$'),
  unlocked_at timestamptz not null default now(),
  primary key (player_id, unlock_key)
);

create table public.player_palettes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  colors text[] not null check (cardinality(colors) between 1 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index player_palettes_player_idx on public.player_palettes (player_id);

-- ===== Minigames ============================================================

create table public.minigame_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  game text not null check (game in ('tracecraft', 'colorburst', 'patternshift', 'lightlines')),
  level int not null check (level between 1 and 500),
  seed bigint not null,
  gx int,
  gy int,
  status text not null default 'active' check (status in ('active', 'validated', 'rejected', 'expired', 'abandoned')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  score int,
  passed boolean,
  stars int check (stars between 0 and 3),
  summary jsonb,
  flags text[] not null default '{}',
  review_status text not null default 'none' check (review_status in ('none', 'flagged', 'cleared', 'voided'))
);
create index minigame_sessions_player_idx on public.minigame_sessions (player_id, started_at desc);
create index minigame_sessions_leader_idx on public.minigame_sessions (game, score desc) where status = 'validated';
create index minigame_sessions_review_idx on public.minigame_sessions (review_status) where review_status = 'flagged';

create table public.minigame_rewards (
  id bigint generated always as identity primary key,
  session_id uuid not null unique references public.minigame_sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  ink int not null default 0,
  pigments int not null default 0,
  brush_points int not null default 0,
  gallery_tokens int not null default 0,
  multiplier numeric(6, 3) not null default 1,
  held boolean not null default false,
  created_at timestamptz not null default now()
);
create index minigame_rewards_player_idx on public.minigame_rewards (player_id, created_at desc);

create table public.minigame_records (
  player_id uuid not null references public.players(id) on delete cascade,
  game text not null,
  highest_level int not null default 0,
  best_score int not null default 0,
  total_score bigint not null default 0,
  plays int not null default 0,
  wins int not null default 0,
  last_played_at timestamptz,
  primary key (player_id, game)
);

-- ===== Achievements =========================================================

create table public.achievements (
  key text primary key check (key ~ '^[a-z0-9_]{2,48}$'),
  name text not null,
  description text not null,
  icon text not null,
  category text not null check (category in ('creation', 'collection', 'exploration', 'mastery', 'community')),
  metric text not null,
  threshold int not null default 1,
  reward jsonb not null default '{}'::jsonb,
  sort int not null default 0,
  is_active boolean not null default true
);

create table public.player_achievements (
  player_id uuid not null references public.players(id) on delete cascade,
  achievement_key text not null references public.achievements(key) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (player_id, achievement_key)
);

-- ===== Gallery ==============================================================

create table public.gallery_reactions (
  publication_id uuid not null references public.artwork_publications(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null default 'appreciate' check (kind = 'appreciate'),
  created_at timestamptz not null default now(),
  primary key (publication_id, player_id)
);
create index gallery_reactions_created_idx on public.gallery_reactions (created_at);
create index gallery_reactions_player_idx on public.gallery_reactions (player_id, created_at desc);

create table public.featured_artwork (
  id bigint generated always as identity primary key,
  publication_id uuid not null references public.artwork_publications(id) on delete cascade,
  section text not null check (section in ('featured', 'staff_pick', 'spotlight')),
  note text check (char_length(note) <= 280),
  criteria text check (char_length(criteria) <= 280),
  featured_by uuid references public.players(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (publication_id, section)
);

-- ===== Events ===============================================================

create table public.event_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9-]{3,48}$'),
  name text not null check (char_length(name) between 3 and 80),
  kind text not null check (kind in ('color_the_world', 'city_canvas', 'great_mural', 'palette_festival', 'artist_spotlight', 'custom')),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'ended', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  region jsonb,
  config jsonb not null default '{}'::jsonb,
  finalized_at timestamptz,
  created_by uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.event_progress (
  event_id uuid not null references public.event_definitions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  score int not null default 0,
  rewarded boolean not null default false,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

-- ===== Moderation ===========================================================

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('review', 'report', 'copyright', 'appeal', 'auto_flag', 'score_review')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  priority int not null default 2 check (priority between 1 and 3),
  publication_id uuid references public.artwork_publications(id) on delete set null,
  session_id uuid references public.minigame_sessions(id) on delete set null,
  subject_player_id uuid references public.players(id) on delete set null,
  reporter_id uuid references public.players(id) on delete set null,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  resolution text,
  resolved_by uuid references public.players(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index moderation_cases_open_idx on public.moderation_cases (status, priority, created_at);
create unique index moderation_cases_one_report_idx on public.moderation_cases (publication_id, reporter_id)
  where kind = 'report' and status = 'open';

create table public.player_blocks (
  blocker_id uuid not null references public.players(id) on delete cascade,
  blocked_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ===== Administration =======================================================

create table public.admin_roles (
  player_id uuid not null references public.players(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'moderator', 'economy', 'support', 'payouts')),
  granted_by uuid references public.players(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (player_id, role)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);

-- ===== Private operational tables (never exposed through the API) ==========

create table private.render_jobs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('process_publication', 'publish_publication', 'unpublish_publication', 'clear_cells')),
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index render_jobs_queue_idx on private.render_jobs (status, run_after, id);

create table private.rate_limits (
  player_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (player_id, action, window_start)
);

create table private.idempotent_ops (
  player_id uuid not null,
  key text not null check (char_length(key) between 8 and 80),
  op text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (player_id, key)
);

create table private.security_events (
  id bigint generated always as identity primary key,
  player_id uuid,
  kind text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index security_events_created_idx on private.security_events (created_at desc);

create table private.client_errors (
  id bigint generated always as identity primary key,
  player_id uuid,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index client_errors_created_idx on private.client_errors (created_at desc);

-- ===== Immutability & bookkeeping triggers ==================================

create or replace function private.forbid_update() returns trigger
language plpgsql as $$
begin
  raise exception 'immutable_record' using errcode = 'P0001', detail = tg_table_name;
end $$;

create trigger artwork_versions_immutable before update on public.artwork_versions
  for each row execute function private.forbid_update();
create trigger plot_ownership_immutable before update of gx, gy, player_id, method, cost, acquired_at on public.plot_ownership
  for each row execute function private.forbid_update();
create trigger resource_ledger_immutable before update on public.resource_ledger
  for each row execute function private.forbid_update();
create trigger rent_ledger_immutable before update on public.rent_ledger
  for each row execute function private.forbid_update();
create trigger audit_logs_immutable before update on public.audit_logs
  for each row execute function private.forbid_update();

-- Density pyramid used for low-zoom rendering.
create or replace function private.density_bump(p_gx int, p_gy int, p_delta int) returns void
language plpgsql as $$
declare v_z int;
begin
  foreach v_z in array array[3, 5, 7, 9, 11] loop
    insert into public.world_density (z, x, y, owned)
    values (v_z, p_gx >> (16 - v_z), p_gy >> (16 - v_z), greatest(p_delta, 0))
    on conflict (z, x, y) do update set owned = greatest(public.world_density.owned + p_delta, 0);
  end loop;
end $$;

create or replace function private.world_plots_density_trg() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id is not null then perform private.density_bump(new.gx, new.gy, 1); end if;
  elsif tg_op = 'UPDATE' then
    if old.owner_id is null and new.owner_id is not null then
      perform private.density_bump(new.gx, new.gy, 1);
    elsif old.owner_id is not null and new.owner_id is null then
      perform private.density_bump(new.gx, new.gy, -1);
    end if;
  elsif tg_op = 'DELETE' then
    if old.owner_id is not null then perform private.density_bump(old.gx, old.gy, -1); end if;
  end if;
  return null;
end $$;

create trigger world_plots_density after insert or update of owner_id or delete on public.world_plots
  for each row execute function private.world_plots_density_trg();
