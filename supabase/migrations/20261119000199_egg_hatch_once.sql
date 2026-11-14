-- Fix: hatch an egg, sacrifice the new Inkborn at the Altar of Luck, and the egg came back unhatched, ready to hatch
-- again. inkborn_eggs.hatched_inkborn referenced the creature "on delete set null", so deleting the creature wiped the
-- only mark that the egg had hatched: hatch -> sacrifice -> hatch -> ... was unlimited Luck (and unlimited Inkborn).
-- Now an egg goes with the creature it hatched into (on delete cascade), and the egg itself remembers it hatched
-- (hatched_at), which the hatch checks too.

alter table public.inkborn_eggs add column if not exists hatched_at timestamptz;
update public.inkborn_eggs set hatched_at = coalesce(laid_at, now()) where hatched_inkborn is not null and hatched_at is null;

do $$
declare n text;
begin
  for n in select conname from pg_constraint
            where conrelid = 'public.inkborn_eggs'::regclass and contype = 'f'
              and conkey = array[(select attnum from pg_attribute where attrelid = 'public.inkborn_eggs'::regclass and attname = 'hatched_inkborn')]::smallint[] loop
    execute format('alter table public.inkborn_eggs drop constraint %I', n);
  end loop;
end $$;
alter table public.inkborn_eggs add constraint inkborn_eggs_hatched_inkborn_fkey
  foreign key (hatched_inkborn) references public.inkborn (id) on delete cascade;

/** Hatch a ready egg into a new Inkborn (it moves into your starter sanctuary, or waits if that's full). Once only. */
create or replace function public.inkborn_egg_hatch(p_egg uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.inkborn_eggs%rowtype; v_name text; v_pers text; v_starter uuid; h public.habitats%rowtype; c public.inkborn%rowtype;
begin
  select * into e from public.inkborn_eggs where id = p_egg for update;
  if not found or e.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if e.hatched_inkborn is not null or e.hatched_at is not null then raise exception 'egg_hatched' using errcode = 'P0001'; end if;
  if now() < e.hatch_at then raise exception 'egg_not_ready' using errcode = 'P0001'; end if;
  if (select count(*) from public.inkborn where owner_id = v_uid) >= coalesce((private.ink_cfg() ->> 'max_creatures')::int, 60) then
    raise exception 'too_many_creatures' using errcode = 'P0001';
  end if;
  v_name := private.chat_clean(p_name);
  if v_name is null or char_length(v_name) not between 1 and 24 or v_name <> btrim(p_name) then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  v_pers := coalesce(e.genome ->> 'mood', 'curious');
  if v_pers not in ('playful', 'sleepy', 'curious', 'shy', 'foodie', 'brave') then v_pers := 'curious'; end if;
  v_starter := private.starter_habitat(v_uid);
  select * into h from public.habitats where id = v_starter;
  insert into public.inkborn (owner_id, client_key, name, source, genome, personality, habitat_id)
  values (v_uid, 'egg-' || e.id::text, v_name, 'bred', e.genome, v_pers,
          case when (select count(*) from public.inkborn where habitat_id = h.id) < private.habitat_capacity(h) then h.id else null end)
  returning * into c;
  update public.inkborn_eggs set hatched_inkborn = c.id, hatched_at = now(), seen = true where id = e.id;
  return jsonb_build_object('inkborn', private.inkborn_json(c, v_uid), 'egg', private.egg_json((select x from public.inkborn_eggs x where x.id = e.id)));
end $$;
