-- Final Terms of Service and Privacy Policy (LANDVAS LLC, Utah), replacing the October drafts.
-- New versions: players who accepted the drafts are asked once, in the game, to accept the new terms.
-- (The public contact address, contact@landvas.app, lives in the app's legal and support pages; the world
-- config stays free of email addresses.)
update public.game_config
   set value = (value - 'support_email' - 'abuse_email' - 'copyright_email')
               || '{"terms_version": "2026-11-12", "privacy_version": "2026-11-12", "support": "in_app"}'::jsonb,
       description = 'Legal versions: bumping terms_version asks every player to accept the new terms again.'
 where key = 'legal';
