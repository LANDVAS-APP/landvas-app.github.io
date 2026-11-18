-- ==== Apps under store review keep working ===========================================================================
-- An app version under store review (Live control's review hold) runs the code inside it, while the server moves on
-- with every deploy. When the Ouroboros and the Homunculus left (20261119000290), the World map's live layer stopped
-- returning `walkers` and `coils`; app 1.0.0 still iterates both, so it crashed on the map ("l.walkers is not iterable")
-- and Google Play rejected it. Both keys are back, always empty: nothing walks or coils any more, and every app version
-- out there reads an empty list as "nothing to draw".
-- Rule (CLAUDE.md, "Apps under review"): a key an app version reads stays in the answer, even when it's always empty.
select private.fn_patch('public.enchant_map2(integer,integer,integer,integer)',
  $a$'server_now', extract(epoch from clock_timestamp()))$a$,
  $b$'server_now', extract(epoch from clock_timestamp()), 'walkers', '[]'::jsonb, 'coils', '[]'::jsonb)$b$, true);
