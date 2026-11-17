// Read-only referral payout report (Fair play): what the referral tiers paid, and for which invites.
// Prints counts and totals only — never player names, emails, ids or locations (the run log is public).
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
async function query(sql) {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    if (!res.ok) return [{ error: `HTTP ${res.status}: ${text.slice(0, 300)}` }];
    return JSON.parse(text);
  } catch (e) { return [{ error: String(e).slice(0, 200) }]; }
}
const out = (title, rows) => console.log(`::warning title=${title}::${JSON.stringify(rows).replace(/\r?\n/g, ' ').replace(/%/g, '%25').slice(0, 3800)}`);
if (!token || !ref) process.exit(0);

// the tiers went live when the first bonus was paid
const LAUNCH = `(select coalesce(min(bonus_at), now()) from public.referrals where bonus_at is not null)`;

out('ref_launch', await query(`select ${LAUNCH} launch, now() now`));
out('ref_overview', await query(`select status, bonus_status, (real_at is not null) real,
    (qualified_at < ${LAUNCH}) invited_before_tiers, count(*) n, sum(reward_ink) base_ink, sum(coalesce((bonus ->> 'ink')::int, 0)) bonus_ink,
    sum(coalesce(jsonb_array_length(bonus -> 'tickets'), 0)) rolls, sum(coalesce((bonus ->> 'enchanted_luck')::int, 0)) ench_luck
  from public.referrals group by 1, 2, 3, 4 order by 5 desc`));
// friends who became "real" only because of history from before the tiers existed
out('ref_real_when', await query(`select (qualified_at < ${LAUNCH}) invited_before_tiers, date_trunc('hour', real_at) hour, count(*) n
  from public.referrals where real_at is not null group by 1, 2 order by 2 desc limit 24`));
// the biggest inviters, ranked (no ids): what their friends paid them
out('ref_top_inviters', await query(`with r as (
    select referrer_id, count(*) filter (where status = 'rewarded') invited, count(*) filter (where real_at is not null and status = 'rewarded') real,
      count(*) filter (where bonus_status = 'paid') bonuses, count(*) filter (where bonus_status = 'paid' and qualified_at < ${LAUNCH}) bonuses_old_invites,
      sum(coalesce((bonus ->> 'ink')::int, 0)) bonus_ink, sum(coalesce(jsonb_array_length(bonus -> 'tickets'), 0)) rolls,
      max((bonus ->> 'tier')::int) top_tier
    from public.referrals group by 1)
  select row_number() over (order by r.bonus_ink + 2000 * r.rolls desc) rank, r.invited, r.real, r.bonuses, r.bonuses_old_invites, r.bonus_ink, r.rolls, r.top_tier,
    (select count(*) from public.roll_tickets t where t.player_id = r.referrer_id and t.source = 'referral' and t.used_at is not null) rolls_used,
    (select count(*) from public.world_plots w where w.owner_id = r.referrer_id) plots_now,
    (select count(*) from public.world_plots w where w.owner_id = r.referrer_id and w.claimed_at >= ${LAUNCH}) plots_since,
    (select coalesce(sum(delta), 0) from public.resource_ledger l where l.player_id = r.referrer_id and l.resource = 'ink' and l.reason = 'referral_share' and l.created_at >= ${LAUNCH}) share_ink_since,
    (select string_agg(pick, ',' order by tier) from public.referral_picks p where p.player_id = r.referrer_id) picks
  from r where r.bonuses > 0 or r.real >= 3 order by 1 limit 15`));
out('ref_rolls', await query(`select min_rarity, count(*) n, count(*) filter (where used_at is not null) used from public.roll_tickets where source = 'referral' group by 1 order by 2 desc`));
// one person on both sides: A invited B and B invited A
out('ref_mutual', await query(`select count(*) n from public.referrals a join public.referrals b on b.referrer_id = a.referee_id and b.referee_id = a.referrer_id`));
// invited accounts that share an app install with another account the same inviter invited (the same friend twice)
out('ref_same_device_twins', await query(`select count(distinct r1.referee_id) invited_accounts, count(distinct r1.referrer_id) inviters,
    count(distinct r1.referee_id) filter (where r1.bonus_status = 'paid') with_bonus
  from public.referrals r1 join public.referrals r2 on r2.referrer_id = r1.referrer_id and r2.referee_id <> r1.referee_id
  where exists (select 1 from private.sightings s1 join private.sightings s2 on s2.device_id = s1.device_id
                where s1.player_id = r1.referee_id and s2.player_id = r2.referee_id and s1.device_id is not null)`));
// invited accounts on the inviter's own app install
out('ref_inviter_device', await query(`select count(*) invited_accounts, count(*) filter (where r.bonus_status = 'paid') with_bonus from public.referrals r
  where exists (select 1 from private.sightings s1 join private.sightings s2 on s2.device_id = s1.device_id
                where s1.player_id = r.referee_id and s2.player_id = r.referrer_id and s1.device_id is not null)`));
out('ref_config', await query(`select value - 'cards' v from public.game_config where key = 'referrals'`));
