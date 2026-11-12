-- Explorer studio: looks matched to your explorer's sex (male hair, bodies and facial hair; female hair and bodies),
-- a face slot (glasses, freckles, beards…), and many more skin tones and hair colours. All free.

-- tag what exists
update public.game_config set value = jsonb_set(value, '{items}', (
  select jsonb_agg(case
    when i ->> 'key' in ('explorer.hair.short', 'explorer.hair.spiky') then i || '{"sex": "m"}'
    when i ->> 'key' in ('explorer.hair.long', 'explorer.hair.ponytail', 'explorer.hair.pigtails', 'explorer.hair.bob', 'explorer.hair.bun', 'explorer.hair.braid',
                         'explorer.body.dress', 'explorer.body.skirt') then i || '{"sex": "f"}'
    else i end)
  from jsonb_array_elements(value -> 'items') i)) where key = 'shop';

-- and add the new looks
update public.game_config set value = jsonb_set(value, '{items}', (value -> 'items') || (
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key', 'explorer.' || part || '.' || id, 'name', nm, 'kind', 'explorer', 'part', part, 'id', id,
           'group', 'Explorer', 'description', descr, 'cost', '{}'::jsonb, 'sex', sex)) order by o), '[]'::jsonb)
  from (values
    (1, 'hair', 'buzz', 'Buzz cut', 'Short and sharp.', 'm'),
    (2, 'hair', 'quiff', 'Quiff', 'Swept up at the front.', 'm'),
    (3, 'hair', 'sidepart', 'Side part', 'Classic and tidy.', 'm'),
    (4, 'hair', 'slick', 'Slicked back', 'Smooth and shiny.', 'm'),
    (5, 'hair', 'mohawk', 'Mohawk', 'A stripe of spikes.', 'm'),
    (6, 'hair', 'pixie', 'Pixie cut', 'Short and choppy.', 'f'),
    (7, 'hair', 'waves', 'Long waves', 'Loose, wavy and long.', 'f'),
    (8, 'hair', 'spacebuns', 'Space buns', 'Two buns on top.', 'f'),
    (10, 'body', 'broad', 'Broad', 'Wide shoulders.', 'm'),
    (11, 'body', 'slim', 'Slim', 'Lean build.', 'm'),
    (20, 'face', 'none', 'Bare face', 'Nothing extra.', null),
    (21, 'face', 'glasses', 'Glasses', 'Round frames.', null),
    (22, 'face', 'freckles', 'Freckles', 'A sprinkle across the cheeks.', null),
    (23, 'face', 'stubble', 'Stubble', 'A day or two of growth.', 'm'),
    (24, 'face', 'mustache', 'Mustache', 'Neatly groomed.', 'm'),
    (25, 'face', 'goatee', 'Goatee', 'Chin and lip.', 'm'),
    (26, 'face', 'beard', 'Full beard', 'All the way round.', 'm'),
    (27, 'face', 'beautymark', 'Beauty mark', 'A little dot.', 'f'),
    (30, 'skin', 'porcelain', 'Porcelain', 'Skin tone.', null),
    (31, 'skin', 'fair', 'Fair', 'Skin tone.', null),
    (32, 'skin', 'olive', 'Olive', 'Skin tone.', null),
    (33, 'skin', 'golden', 'Golden', 'Skin tone.', null),
    (34, 'skin', 'caramel', 'Caramel', 'Skin tone.', null),
    (35, 'skin', 'chestnut', 'Chestnut', 'Skin tone.', null),
    (36, 'skin', 'espresso', 'Espresso', 'Skin tone.', null),
    (37, 'skin', 'ebony', 'Ebony', 'Skin tone.', null),
    (40, 'hairc', 'auburn', 'Auburn', 'Hair colour.', null),
    (41, 'hairc', 'ginger', 'Ginger', 'Hair colour.', null),
    (42, 'hairc', 'platinum', 'Platinum', 'Hair colour.', null),
    (43, 'hairc', 'white', 'White', 'Hair colour.', null),
    (44, 'hairc', 'green', 'Green', 'Hair colour.', null),
    (45, 'hairc', 'purple', 'Purple', 'Hair colour.', null),
    (46, 'hairc', 'teal', 'Teal', 'Hair colour.', null)
  ) n(o, part, id, nm, descr, sex)
  where not exists (select 1 from jsonb_array_elements(value -> 'items') y where y ->> 'key' = 'explorer.' || part || '.' || id))) where key = 'shop';

-- the face is a part you can wear
do $$
declare d text;
begin
  d := pg_get_functiondef('public.equip_explorer(jsonb)'::regprocedure);
  if position($a$'body', 'sex']$a$ in d) = 0 or position($a$"body": "classic"}$a$ in d) = 0 then raise exception 'equip_explorer anchor missing'; end if;
  d := replace(d, $a$'body', 'sex']$a$, $a$'body', 'sex', 'face']$a$);
  d := replace(d, $a$"body": "classic"}$a$, $a$"body": "classic", "face": "none"}$a$);
  execute d;
end $$;
