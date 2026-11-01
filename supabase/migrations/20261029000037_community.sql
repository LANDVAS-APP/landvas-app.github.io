-- v0.21: more connection between players.
--  * Sketch of the Day shows who's sketching today; votes (sketches and challenges) are final.
--  * Hundreds of sketch words, duet prompts and Draw & Guess words.
--  * The operator can set today's sketch word and pick the Painting of the Day.
--  * Notifications: someone collected your stamp, visited or checked into your room, was
--    inspired by your art, voted for your sketch, or left a note in your room.
--  * Room guestbook (short, filtered notes) and the room's recent visitors.
--  * New free explorer looks: hair styles and colours, skin tones and a dress.

-- ===== Words ===========================================================================
create table if not exists public.sketch_word_overrides (
  day timestamptz primary key,
  word text not null check (char_length(word) between 1 and 40),
  set_by uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.sketch_word_overrides enable row level security;
revoke all on public.sketch_word_overrides from anon, authenticated;

create or replace function private.sketch_word(p_day timestamptz) returns text
language sql stable as $$
  select coalesce((select word from public.sketch_word_overrides where day = p_day),
    (array['lighthouse','dragon','teacup','volcano','jellyfish','robot','cactus','castle','octopus','rainbow','snail','rocket','pizza','owl','mermaid','treehouse','penguin','umbrella','tornado','guitar','sunflower','submarine','fox','island','ghost','whale','dinosaur','balloon','mushroom','spaceship','waterfall','crown','bicycle','cupcake','wizard','turtle','windmill','comet','sloth','lantern','bee','camera','unicorn','bridge','coral reef','pirate ship','snowman','campfire','hedgehog','dragonfly','moon','train','flamingo','cloud city','sandcastle','koala','bonsai','monster','astronaut','frog','tea party','haunted house','ice cream','parrot','desert','hot air balloon','butterfly','lion','garden','storm','chameleon','planet','mountain','raccoon','skateboard','robot dog','vending machine','treasure chest','firefly','jungle','zebra','city at night','sushi','bat','phoenix','deer','fishbowl','music','time machine','tiny house','yeti','sunset','a cat in a hat','a dog on a skateboard','breakfast','your dream house','a secret door','the deep sea','a magic potion','a giant snack','a sleepy fox','a busy market','a train in the snow','a floating island','a robot chef','a dragon egg','a cozy cabin','a lost balloon','a space picnic','a pirate parrot','an underwater city','a garden gnome','a sandcastle kingdom','a rainy window','a lighthouse storm','a candy shop','a bird nest','a cactus in sunglasses','a moon base','a jungle temple','a hamster wheel','a lazy cat','a snowy village','a street musician','a hot cocoa','a carousel','a roller coaster','a sunflower field','a whale in the sky','a tiny dragon','a cat cafe','a library','a bakery','a fishing boat','a campervan','a tree spirit','a friendly ghost','a beach day','a kite festival','a lantern festival','a fireworks night','a mountain cabin','a frozen lake','a spooky forest','a rocket launch','a robot garden','a dinosaur museum','a pumpkin patch','a winter scarf','a desert oasis','an ice castle','a cloud with a face','a happy volcano','a picnic basket','a paper boat','a magic lamp','a messy desk','a bubble bath','a crystal cave','a toy box','a sleepy owl','a dancing robot','a goldfish','a jellyfish lamp','a mushroom house','a sushi cat','a pizza planet','a donut tower','a snail race','a hedgehog in a cup','a fox in a scarf','a bear in a canoe','a city skyline','a street at night','a pirate map','a hidden treasure','a giant sandwich','a flying car','a submarine window','a deep space nebula','a moonlit beach','a lighthouse keeper','a farm at dawn','a busy beehive','a rainbow bridge','a dragon library','a wizard tower','a knight and a dragon','a castle kitchen','a robot pet','a tiny planet','a mountain lake','an autumn tree','a spring meadow','a summer storm','a winter morning','alien','anchor','angel','ant','apple tree','aquarium','arcade','armadillo','astronaut cat','avocado','axolotl','backpack','badger','bagel','bamboo','banana boat','bandstand','barn','beach hut','beanstalk','beaver','bee hive','beetle','bell tower','birthday cake','black hole','blizzard','blueberry','boat house','bookshop','boombox','bowling','bubble','bumblebee','bunny','burrito','bus stop','butterfly garden','cable car','cactus garden','campervan','candle','canoe','capybara','carnival','carrot','castle gate','caterpillar','cave','cello','cheese','cherry blossom','chess','chick','chimney','chocolate','circus tent','city park','clock tower','clownfish','coffee','comet tail','constellation','cookie jar','coral','corgi','cosmic whale','cotton candy','cowboy','crab','crane','crayons','croissant','crystal','cupcake tower','cyclops','daisy','dandelion','deer in snow','diner','disco ball','diver','dolphin','donkey','doughnut','dragon kite','drum kit','duck pond','eagle','earth','eclipse','eel','eiffel tower','elephant','elf','emerald','emu','falcon','fairy','fairy lights','ferris wheel','ferry','fire truck','fireplace','fish market','flower crown','flower pot','flying fish','fog','forest path','fountain','frog prince','fruit bowl','galaxy','garden shed','gecko','geyser','gift box','giraffe','glacier','globe','goat','goldfish bowl','gondola','gorilla','grandma','grapes','greenhouse','griffin','guinea pig','hammock','hamster','harbor','harp','hat shop','hawk','heart balloon','helicopter','hermit crab','hippo','honey jar','horse','hot dog','hummingbird','husky','ice skates','igloo','iguana','jam jar','jet','juice box','kangaroo','kayak','kettle','key','kingfisher','kitten','kiwi','ladybug','lagoon','lamp post','lava lamp','lemonade stand','lemur','leopard','lighthouse beam','lily pad','llama','lobster','lollipop','lotus','lunchbox','lynx','macaron','magnifying glass','mailbox','mammoth','mango','manta ray','maple leaf','marshmallow','meerkat','metro','milkshake','mole','monkey','moose','mosaic','moth','motorcycle','mountain goat','mouse','muffin','narwhal','nest','night market','noodles','oak tree','observatory','orca','orchard','origami','ostrich','otter','paintbrush','palm tree','panda','pancakes','panther','paper plane','parachute','park bench','peacock','pear','pelican','pepper','piano','pickle','pier','pig','pine cone','pinwheel','plant shop','platypus','polar bear','pond','popcorn','poppy','porcupine','postcard','pretzel','pufferfish','pug','puppet','pyramid','quail','quokka','rabbit hole','radio','rain cloud','red panda','reindeer','rhino','river','robin','rocking chair','roller skates','rooftop','rose','rowboat','rubber duck','sailboat','salamander','sandwich','satellite','saturn','scarecrow','scooter','sea lion','sea turtle','seahorse','shark','sheep','shell','ship in a bottle','skyscraper','sled','snow globe','snowflake','soup','sparrow','spider web','squid','squirrel','stained glass','starfish','steam train','stork','strawberry','street lamp','sun hat','surfboard','swan','swing','taco','tiger','toad','toaster','tomato','toucan','tractor','tram','tree frog','tuba','tulip','tuna','turnip','typewriter','ufo','vase','violin','walrus','watermelon','weather vane','well','wolf','woodpecker','yak','yo-yo'])[1 + (floor(extract(epoch from p_day) / 86400)::bigint % 505)::int])
$$;

create or replace function private.doodle_words() returns text[]
language sql immutable as $$ select array['apple','banana','cat','dog','house','tree','sun','moon','star','fish','bird','car','boat','plane','train','rocket','flower','heart','cloud','rain','snowman','pizza','cake','ice cream','hat','shoe','glasses','umbrella','guitar','drum','book','clock','key','lamp','chair','bed','cup','spoon','fork','bridge','castle','tent','fire','mountain','island','volcano','rainbow','snake','spider','butterfly','bee','frog','turtle','whale','octopus','crab','shark','penguin','owl','elephant','giraffe','lion','monkey','rabbit','mouse','pig','cow','horse','duck','robot','ghost','crown','sword','shield','dragon','unicorn','mermaid','alien','planet','camera','phone','computer','headphones','balloon','kite','ball','ladder','door','window','candle','bell','anchor','lighthouse','cactus','mushroom','carrot','cherry','grapes','lemon','watermelon','donut','cookie','burger','hot dog','sandwich','egg','bicycle','skateboard','sailboat','tractor','bus','helicopter','compass','map','treasure','pirate','wizard','witch','king','queen','baby','tooth','eye','hand','foot','nose','ear','smile','snowflake','tornado','lightning','wave','beach','igloo','pyramid','windmill','fountain','scarf','sock','tie','dress','magnet','battery','bulb','paintbrush','pencil','scissors','envelope','airplane','alligator','ambulance','angel','ant','arm','arrow','astronaut','avocado','axe','backpack','bacon','badge','bag','bandage','barn','baseball','basket','basketball','bat','bathtub','bear','beard','bee hive','belt','bench','bird nest','birthday','blanket','boot','bone','boomerang','bottle','bow','bowl','box','bracelet','brain','bread','broom','brush','bubble','bucket','bug','bulldozer','bunny','butter','button','cactus pot','calculator','calendar','camel','campfire','can','canoe','cap','cape','car wash','card','carousel','castle tower','caterpillar','cave','chain','chameleon','cheese','chef','chess','chicken','chimney','chocolate','church','circus','clam','claw','cliff','clown','coat','coconut','coffee','coin','comb','comet','cone','cookie jar','corn','couch','cowboy','crayon','crocodile','croissant','crow','cupcake','curtain','cushion','dancer','deer','desert','desk','diamond','dice','dinosaur','diver','doctor','dolphin','dominoes','dough','dragonfly','drill','drop','drum kit','duck pond','dumbbell','eagle','earring','earth','easel','eel','egg cup','elbow','elf','engine','eraser','eyebrow','fairy','fan','farm','feather','fence','ferris wheel','fire truck','firework','fishing rod','flag','flamingo','flashlight','flute','fly','football','forest','fox','fries','frying pan','garden','gate','gem','gift','glove','glue','goat','goggles','goldfish','golf','goose','gorilla','gum','hair','hamburger','hammer','hammock','hamster','harp','hedgehog','helmet','hippo','hockey','honey','hook','horn','hose','hospital','hourglass','hurricane','ice cube','iron','jacket','jam','jar','jeans','jelly','jellyfish','jet','juice','kangaroo','kettle','keyboard','kitchen','kitten','knee','knife','knight','koala','ladybug','lake','lamb','laptop','leaf','leg','lemonade','letter','lips','lizard','llama','lobster','lock','lollipop','mailbox','mask','medal','mermaid tail','microphone','microscope','milk','mirror','mitten','money','monster','moose','mop','motorbike','mountain goat','moustache','muffin','mug','nail','necklace','needle','nest','net','ninja','noodles','notebook','nut','oar','ocean','onion','orange','orca','oven','paddle','paint','palm tree','pan','panda','pants','paper','parachute','parrot','party','peach','peacock','peanut','pear','peas','pen','pencil case','penguin chick','pepper','piano','pickle','pie','pillow','pineapple','pirate ship','pizza box','plant','plate','playground','plug','police car','pond','popcorn','popsicle','postcard','pot','potato','present','pumpkin','puppy','purse','puzzle','queen bee','quilt','rabbit hole','raccoon','radio','raft','rain boots','rake','rat','razor','recycle','reindeer','rhino','ribbon','ring','river','road','robe','rock','roller coaster','roof','rope','rose','rug','ruler','sack','saddle','salad','salt','sandcastle','saturn','sausage','saw','saxophone','scale','scarecrow','school','scooter','scorpion','seal','seahorse','seesaw','shark fin','sheep','shell','ship','shirt','shorts','shovel','shower','sink','skeleton','skull','sled','slide','slipper','sloth','smoke','snail','sneeze','snow globe','soap','soccer','sofa','soup','spaceship','spaghetti','sponge','squid','squirrel','stairs','stamp','starfish','statue','steak','stethoscope','stool','stop sign','storm','stove','straw','strawberry','submarine','suitcase','sunflower','sunglasses','superhero','surfboard','sushi','swan','sweater','swing','syringe','table','taco','tail','tank','teapot','teddy bear','telescope','television','tennis','tent pole','thermometer','thumb','ticket','tiger','tire','toast','toaster','toilet','tomato','tongue','toothbrush','torch','tortoise','towel','tower','toy','traffic light','trampoline','trash can','tree house','trophy','truck','trumpet','tshirt','tulip','turkey','umbrella hat','unicycle','vacuum','vampire','vase','violin','volleyball','waffle','wagon','wallet','walrus','wand','wardrobe','washing machine','watch','waterfall','web','wheel','whistle','wig','windmill blade','wing','wolf','worm','wrench','yacht','yarn','yo-yo','zebra','zipper','zombie'] $$;

create or replace function private.duet_prompt() returns text
language sql volatile as $$
  select (array['a creature','a robot','a monster','a superhero','a wizard','an alien','a knight','a mermaid','a dancer','a scarecrow','a dragon','a pirate','a chef','an astronaut','a ghost','a dinosaur','a fairy','a cowboy','a vampire','a tree spirit','a cat','a dog','a bird','a fish','a frog','an owl','a bear','a fox','a rabbit','a horse','an elephant','a giraffe','a penguin','a lion','a tiger','a monkey','a snake','a turtle','a whale','an octopus','a crab','a bee','a butterfly','a snail','a unicorn','a griffin','a phoenix','a yeti','a troll','a goblin','an elf','a giant','a cyclops','a centaur','a minotaur','a sphinx','a kraken','a sea serpent','a gargoyle','a golem','a king','a queen','a princess','a prince','a ninja','a samurai','a viking','a clown','a magician','a detective','a scientist','a doctor','a firefighter','a farmer','a gardener','a painter','a musician','a rock star','a ballerina','a boxer','a skateboarder','a surfer','a skier','a diver','a pilot','a sailor','a soldier','a mummy','a zombie','a werewolf','a witch','a genie','a mad scientist','a time traveller','a space pirate','a deep-sea diver','a lumberjack','a librarian','a baker','a mail carrier','a cake','a house','a castle','a tower','a tree','a cactus','a flower','a mushroom','a rocket','a spaceship','a submarine','a train','a car','a bus','a boat','a lighthouse','a volcano','a mountain','a snowman','a totem pole','a robot dog','a vending machine','a fountain','a hot air balloon','a windmill','a skyscraper','a treehouse','a teapot','a lamp','a jukebox','an ice cream sundae','a burger','a sandwich','a pizza slice','a taco','a sushi roll','a layer cake','a milkshake','a donut stack','a lollipop','a statue','a scarecrow robot','a snow monster','a jungle beast','a desert nomad','a cloud creature','a candy golem','a crystal dragon','a mushroom knight','a moon rabbit','a star whale','a garden gnome','a sea monster','a forest guardian','a city robot','a toy soldier','a jack-in-the-box','a puppet','a living sofa','a walking house','a self-portrait','your best friend','your teacher','a famous painting','a superhero sidekick','a villain','a royal guard','a party animal','a sleepy giant','a tiny warrior'])[1 + floor(random() * 170)::int]
$$;

create or replace function public.admin_set_sketch_word(p_word text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_day timestamptz := private.day_start(now()); v_word text := lower(btrim(coalesce(p_word, '')));
begin
  if v_word = '' then
    delete from public.sketch_word_overrides where day = v_day;
  else
    if char_length(v_word) > 40 or private.chat_clean(v_word) <> v_word then raise exception 'invalid_word' using errcode = 'P0001'; end if;
    insert into public.sketch_word_overrides (day, word, set_by) values (v_day, v_word, v_uid)
    on conflict (day) do update set word = excluded.word, set_by = excluded.set_by, created_at = now();
  end if;
  -- sketches started today but not sent yet switch to the new word
  update public.sketches set word = private.sketch_word(v_day) where day = v_day and submitted_at is null;
  perform private.audit('sketch.word', 'sketch_day', v_day::text, jsonb_build_object('word', private.sketch_word(v_day)));
  return jsonb_build_object('word', private.sketch_word(v_day), 'custom', v_word <> '');
end $$;

-- who's sketching today (the faces only — which sketch is whose stays secret until voting ends)
create or replace function public.sketch_artists_today() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('count', count(*), 'artists', coalesce(jsonb_agg(private.profile_json(x.player_id) order by md5(x.player_id::text || x.day::text)) filter (where x.rn <= 40), '[]'::jsonb))
  from (select s.player_id, s.day, row_number() over (order by s.submitted_at desc) rn
          from public.sketches s where s.day = private.day_start(now()) and s.submitted_at is not null) x
$$;

-- ===== Final votes =====================================================================
create or replace function public.sketch_vote(p_sketch_id uuid, p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.creative('sketch'); s public.sketches%rowtype; v_day timestamptz := private.day_start(now());
begin
  select * into s from public.sketches where id = p_sketch_id for update;
  if not found or s.submitted_at is null or s.day <> v_day then raise exception 'voting_closed' using errcode = 'P0001'; end if;
  if s.player_id = v_uid then raise exception 'own_sketch' using errcode = 'P0001'; end if;
  if p_on then
    if not private.old_enough(v_uid, coalesce((c ->> 'min_account_hours')::numeric, 24)) then raise exception 'account_too_new' using errcode = 'P0001'; end if;
    if (select count(*) from public.sketch_votes where voter_id = v_uid and day = v_day) >= coalesce((c ->> 'votes_per_player')::int, 20) then
      raise exception 'no_votes_left' using errcode = 'P0001';
    end if;
    insert into public.sketch_votes (sketch_id, voter_id, day) values (s.id, v_uid, v_day) on conflict do nothing;
  else
    -- a vote is final once it's placed
    raise exception 'vote_final' using errcode = 'P0001';
  end if;
  update public.sketches set votes = (select count(*) from public.sketch_votes where sketch_id = s.id) where id = s.id;
  return public.sketch_today();
end $$;

create or replace function public.challenge_vote(p_challenge_id uuid, p_publication_id uuid, p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); ch public.challenges%rowtype; e public.challenge_entries%rowtype; cfg jsonb := private.earn('challenges');
begin
  perform private.rate_limit('challenge_vote', 120, 3600);
  perform private.challenge_sweep();
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or ch.status <> 'open' or ch.starts_at > now() or ch.ends_at <= now() then raise exception 'challenge_closed' using errcode = 'P0001'; end if;
  select * into e from public.challenge_entries where challenge_id = ch.id and publication_id = p_publication_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if e.owner_id = v_uid then raise exception 'cannot_vote_own' using errcode = 'P0001'; end if;
  if p_on then
    -- only established accounts with land vote, so extra accounts can't stuff the ballot
    if not private.old_enough(v_uid, coalesce((cfg ->> 'min_account_hours')::numeric, 24)) or not exists (select 1 from public.world_plots where owner_id = v_uid) then
      raise exception 'account_too_new_to_vote' using errcode = 'P0001';
    end if;
    if (select count(*) from public.challenge_votes where challenge_id = ch.id and voter_id = v_uid) >= coalesce((cfg ->> 'votes_per_player')::int, 3) then
      raise exception 'out_of_votes' using errcode = 'P0001';
    end if;
    insert into public.challenge_votes (challenge_id, voter_id, publication_id) values (ch.id, v_uid, p_publication_id) on conflict do nothing;
    if found then update public.challenge_entries set votes = votes + 1 where challenge_id = ch.id and publication_id = p_publication_id; end if;
  else
    -- a vote is final once it's placed
    raise exception 'vote_final' using errcode = 'P0001';
  end if;
  return private.challenge_json(ch, v_uid);
end $$;

-- ===== Painting of the Day =============================================================
-- the operator's pick (section 'spotlight', until the next daily reset) leads Featured today
create or replace function public.admin_set_potd(p_publication_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderation']); a public.artwork_publications%rowtype;
begin
  update public.featured_artwork set ends_at = now() where section = 'spotlight' and (ends_at is null or ends_at > now());
  if p_publication_id is null then return jsonb_build_object('ok', true); end if;
  select * into a from public.artwork_publications where id = p_publication_id;
  if not found or a.status <> 'published' then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.featured_artwork (publication_id, section, note, featured_by, starts_at, ends_at)
  values (a.id, 'spotlight', nullif(btrim(coalesce(p_note, '')), ''), v_uid, now(), private.day_start(now()) + interval '1 day');
  perform private.notify(a.owner_id, 'potd', v_uid, jsonb_build_object('publication_id', a.id, 'title', a.title));
  perform private.audit('potd.set', 'publication', a.id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'title', a.title);
end $$;

create or replace function public.featured_today(p_limit int default 12) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_limit int := least(greatest(coalesce(p_limit, 12), 1), 30); v_res jsonb;
begin
  with potd as (
    select a.id, private.artwork_card(a, v_uid) || jsonb_build_object('pick', 'potd', 'note', f.note) as card, -1 as grp, 0 as s1, -extract(epoch from f.starts_at) as s2
      from public.featured_artwork f join public.artwork_publications a on a.id = f.publication_id
     where f.section = 'spotlight' and a.status = 'published' and f.starts_at <= now() and (f.ends_at is null or f.ends_at > now())
       and private.visible_to(a.owner_id, v_uid)
     order by f.starts_at desc limit 1
  ), staff as (
    select a.id, private.artwork_card(a, v_uid) || jsonb_build_object('pick', 'staff', 'note', f.note) as card, 0 as grp, f.sort as s1, -extract(epoch from f.starts_at) as s2
      from public.featured_artwork f join public.artwork_publications a on a.id = f.publication_id
     where f.section <> 'spotlight' and a.id not in (select id from potd) and a.status = 'published' and f.starts_at >= private.day_start(now()) - interval '1 day'
       and (f.ends_at is null or f.ends_at > now()) and private.visible_to(a.owner_id, v_uid)
  ), community as (
    select a.id, private.artwork_card(a, v_uid) || jsonb_build_object('pick', 'community') as card, 1 as grp, -a.appreciation_count as s1, -extract(epoch from a.published_at) as s2
      from public.artwork_publications a
     where a.status = 'published' and a.published_at > now() - interval '1 day' and private.visible_to(a.owner_id, v_uid)
       and a.id not in (select id from staff) and a.id not in (select id from potd)
     order by a.appreciation_count desc, a.published_at desc limit v_limit
  ), both_ as (select * from potd union all select * from staff union all select * from community)
  select coalesce(jsonb_agg(card order by grp, s1, s2), '[]'::jsonb) into v_res
    from (select * from both_ order by grp, s1, s2 limit v_limit) x;
  return v_res;
end $$;

-- ===== Notifications ===================================================================
create table if not exists public.player_notifications (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in ('stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle')),
  actor_id uuid references public.players(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists player_notifications_player on public.player_notifications (player_id, created_at desc);
alter table public.player_notifications enable row level security;
revoke all on public.player_notifications from anon, authenticated;

create or replace function private.notify(p_player uuid, p_kind text, p_actor uuid, p_data jsonb) returns void
language plpgsql as $$
begin
  if p_player is null or p_player = p_actor then return; end if;
  -- the same visitor doesn't ping you twice in an hour
  if p_kind = 'visit' and exists (select 1 from public.player_notifications where player_id = p_player and kind = 'visit' and actor_id = p_actor and created_at > now() - interval '1 hour') then return; end if;
  insert into public.player_notifications (player_id, kind, actor_id, data) values (p_player, p_kind, p_actor, coalesce(p_data, '{}'::jsonb));
end $$;

create or replace function private.notify_stamp_trg() returns trigger language plpgsql as $$
begin
  perform private.notify((select owner_id from public.artwork_publications where id = new.publication_id), 'stamp', new.collector_id,
    jsonb_build_object('publication_id', new.publication_id, 'title', (select title from public.artwork_publications where id = new.publication_id), 'serial', new.serial, 'ink', new.artist_ink));
  return new;
end $$;
drop trigger if exists stamps_notify on public.stamps;
create trigger stamps_notify after insert on public.stamps for each row execute function private.notify_stamp_trg();

create or replace function private.notify_visit_trg() returns trigger language plpgsql as $$
begin
  perform private.notify(new.host_id, 'visit', new.visitor_id, '{}'::jsonb);
  return new;
end $$;
drop trigger if exists room_visits_notify on public.room_visits;
create trigger room_visits_notify after insert or update of entered_at on public.room_visits for each row execute function private.notify_visit_trg();

create or replace function private.notify_checkin_trg() returns trigger language plpgsql as $$
begin
  perform private.notify(new.host_id, 'checkin', new.visitor_id, jsonb_build_object('ink', new.host_ink));
  return new;
end $$;
drop trigger if exists room_checkins_notify on public.room_checkins;
create trigger room_checkins_notify after insert on public.room_checkins for each row execute function private.notify_checkin_trg();

create or replace function private.notify_inspire_trg() returns trigger language plpgsql as $$
declare a public.artwork_publications%rowtype;
begin
  select * into a from public.artwork_publications where id = new.publication_id;
  perform private.notify(a.owner_id, 'inspire', new.player_id, jsonb_build_object('publication_id', a.id, 'title', a.title));
  return new;
end $$;
drop trigger if exists gallery_reactions_notify on public.gallery_reactions;
create trigger gallery_reactions_notify after insert on public.gallery_reactions for each row execute function private.notify_inspire_trg();

create or replace function private.notify_sketch_vote_trg() returns trigger language plpgsql as $$
declare s public.sketches%rowtype;
begin
  select * into s from public.sketches where id = new.sketch_id;
  -- voters stay anonymous while voting is open
  perform private.notify(s.player_id, 'sketch_vote', null, jsonb_build_object('word', s.word, 'sketch_id', s.id));
  return new;
end $$;
drop trigger if exists sketch_votes_notify on public.sketch_votes;
create trigger sketch_votes_notify after insert on public.sketch_votes for each row execute function private.notify_sketch_vote_trg();

create or replace function private.notify_duet_trg() returns trigger language plpgsql as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    perform private.notify(new.top_id, 'duet', new.bottom_id, jsonb_build_object('duet_id', new.id, 'prompt', new.prompt));
  end if;
  return new;
end $$;
drop trigger if exists duets_notify on public.duets;
create trigger duets_notify after update on public.duets for each row execute function private.notify_duet_trg();

create or replace function public.my_alerts(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'unread', (select count(*) from public.player_notifications where player_id = auth.uid() and read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'data', n.data, 'created_at', n.created_at, 'read', n.read_at is not null,
               'actor', case when n.actor_id is not null then private.profile_json(n.actor_id) end) order by n.created_at desc)
             from (select * from public.player_notifications where player_id = auth.uid() order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) n), '[]'::jsonb))
$$;

create or replace function public.alerts_unread() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.player_notifications where player_id = auth.uid() and read_at is null
$$;

create or replace function public.mark_alerts_read() returns int
language sql security definer set search_path = public, pg_temp as $$
  with u as (update public.player_notifications set read_at = now() where player_id = auth.uid() and read_at is null returning 1) select count(*)::int from u
$$;

-- ===== Room guestbook and visitors =====================================================
create table if not exists public.room_notes (
  id bigint generated always as identity primary key,
  host_id uuid not null references public.players(id) on delete cascade,
  author_id uuid not null references public.players(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 140),
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);
create index if not exists room_notes_host on public.room_notes (host_id, created_at desc);
alter table public.room_notes enable row level security;
revoke all on public.room_notes from anon, authenticated;

create or replace function public.room_social(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_host uuid;
begin
  select id into v_host from public.profiles where lower(username) = lower(p_username);
  if v_host is null or not private.visible_to(v_host, v_uid) then raise exception 'room_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'visitors', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(x.visitor_id), 'at', x.at, 'checked_in', x.checked) order by x.at desc), '[]'::jsonb)
                 from (select v.visitor_id, greatest(v.entered_at, coalesce(c.at, v.entered_at)) at, c.at is not null checked
                         from public.room_visits v
                         left join (select visitor_id, max(created_at) at from public.room_checkins where host_id = v_host group by visitor_id) c on c.visitor_id = v.visitor_id
                        where v.host_id = v_host and v.visitor_id <> v_host and private.visible_to(v.visitor_id, v_uid)
                        order by 2 desc limit 30) x),
    'visits', (select count(*) from public.room_visits where host_id = v_host),
    'checkins', (select count(*) from public.room_checkins where host_id = v_host),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'at', n.created_at, 'author', private.profile_json(n.author_id), 'mine', n.author_id = v_uid) order by n.created_at desc), '[]'::jsonb)
              from (select * from public.room_notes where host_id = v_host and not hidden and private.visible_to(author_id, v_uid) order by created_at desc limit 40) n),
    'is_host', v_uid = v_host);
end $$;

create or replace function public.room_note(p_username text, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_host uuid; v_body text;
begin
  perform private.rate_limit('room_note', 20, 3600);
  select id into v_host from public.profiles where lower(username) = lower(p_username);
  if v_host is null or not private.visible_to(v_host, v_uid) then raise exception 'room_not_found' using errcode = 'P0001'; end if;
  v_body := private.chat_clean(p_body);
  if v_body is null or char_length(v_body) = 0 then raise exception 'empty_message' using errcode = 'P0001'; end if;
  insert into public.room_notes (host_id, author_id, body) values (v_host, v_uid, left(v_body, 140));
  perform private.notify(v_host, 'note', v_uid, jsonb_build_object('body', left(v_body, 140)));
  return public.room_social(p_username);
end $$;

-- the host (or the note's author) can remove a note
create or replace function public.room_note_delete(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); n public.room_notes%rowtype;
begin
  select * into n from public.room_notes where id = p_id;
  if not found or (n.host_id <> v_uid and n.author_id <> v_uid and not private.has_role(v_uid, array['moderator'])) then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.room_notes set hidden = true where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ===== Explorer looks ==================================================================
update public.game_config set value = jsonb_set(value, '{items}', (value -> 'items') || (
  select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements('[
    {"key": "explorer.hair.short", "name": "Short", "kind": "explorer", "part": "hair", "id": "short", "group": "Explorer", "description": "Neat and tidy.", "cost": {}},
    {"key": "explorer.hair.long", "name": "Long", "kind": "explorer", "part": "hair", "id": "long", "group": "Explorer", "description": "Long and flowing.", "cost": {}},
    {"key": "explorer.hair.ponytail", "name": "Ponytail", "kind": "explorer", "part": "hair", "id": "ponytail", "group": "Explorer", "description": "Swishes as you walk.", "cost": {}},
    {"key": "explorer.hair.pigtails", "name": "Pigtails", "kind": "explorer", "part": "hair", "id": "pigtails", "group": "Explorer", "description": "Two bouncy bunches.", "cost": {}},
    {"key": "explorer.hair.bob", "name": "Bob", "kind": "explorer", "part": "hair", "id": "bob", "group": "Explorer", "description": "A sharp chin-length cut.", "cost": {}},
    {"key": "explorer.hair.bun", "name": "Top bun", "kind": "explorer", "part": "hair", "id": "bun", "group": "Explorer", "description": "Out of the way while you paint.", "cost": {}},
    {"key": "explorer.hair.curly", "name": "Curls", "kind": "explorer", "part": "hair", "id": "curly", "group": "Explorer", "description": "Big, bouncy curls.", "cost": {}},
    {"key": "explorer.hair.braid", "name": "Braid", "kind": "explorer", "part": "hair", "id": "braid", "group": "Explorer", "description": "One long braid.", "cost": {}},
    {"key": "explorer.hair.spiky", "name": "Spiky", "kind": "explorer", "part": "hair", "id": "spiky", "group": "Explorer", "description": "Full of energy.", "cost": {}},
    {"key": "explorer.hairc.brown", "name": "Brown", "kind": "explorer", "part": "hairc", "id": "brown", "group": "Explorer", "description": "Hair colour.", "cost": {}},
    {"key": "explorer.hairc.black", "name": "Black", "kind": "explorer", "part": "hairc", "id": "black", "group": "Explorer", "description": "Hair colour.", "cost": {}},
    {"key": "explorer.hairc.blonde", "name": "Blonde", "kind": "explorer", "part": "hairc", "id": "blonde", "group": "Explorer", "description": "Hair colour.", "cost": {}},
    {"key": "explorer.hairc.red", "name": "Red", "kind": "explorer", "part": "hairc", "id": "red", "group": "Explorer", "description": "Hair colour.", "cost": {}},
    {"key": "explorer.hairc.pink", "name": "Pink", "kind": "explorer", "part": "hairc", "id": "pink", "group": "Explorer", "description": "Hair colour.", "cost": {}},
    {"key": "explorer.hairc.blue", "name": "Blue", "kind": "explorer", "part": "hairc", "id": "blue", "group": "Explorer", "description": "Hair colour.", "cost": {}},
    {"key": "explorer.hairc.silver", "name": "Silver", "kind": "explorer", "part": "hairc", "id": "silver", "group": "Explorer", "description": "Hair colour.", "cost": {}},
    {"key": "explorer.skin.peach", "name": "Peach", "kind": "explorer", "part": "skin", "id": "peach", "group": "Explorer", "description": "Skin tone.", "cost": {}},
    {"key": "explorer.skin.light", "name": "Light", "kind": "explorer", "part": "skin", "id": "light", "group": "Explorer", "description": "Skin tone.", "cost": {}},
    {"key": "explorer.skin.tan", "name": "Tan", "kind": "explorer", "part": "skin", "id": "tan", "group": "Explorer", "description": "Skin tone.", "cost": {}},
    {"key": "explorer.skin.brown", "name": "Brown", "kind": "explorer", "part": "skin", "id": "brown", "group": "Explorer", "description": "Skin tone.", "cost": {}},
    {"key": "explorer.skin.deep", "name": "Deep", "kind": "explorer", "part": "skin", "id": "deep", "group": "Explorer", "description": "Skin tone.", "cost": {}},
    {"key": "explorer.body.classic", "name": "Classic", "kind": "explorer", "part": "body", "id": "classic", "group": "Explorer", "description": "Explorer body.", "cost": {}},
    {"key": "explorer.body.dress", "name": "Dress", "kind": "explorer", "part": "body", "id": "dress", "group": "Explorer", "description": "Explorer body with a dress.", "cost": {}},
    {"key": "explorer.body.skirt", "name": "Skirt", "kind": "explorer", "part": "body", "id": "skirt", "group": "Explorer", "description": "Explorer body with a skirt.", "cost": {}}
  ]'::jsonb) x where not exists (select 1 from jsonb_array_elements(value -> 'items') y where y ->> 'key' = x ->> 'key'))) where key = 'shop';

create or replace function public.equip_explorer(p_style jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_cur jsonb; v_new jsonb := '{}'::jsonb; part text; v_id text; v_item jsonb;
  v_defaults jsonb := '{"hat": "beret", "hold": "brush", "outfit": "accent", "trail": "none", "aura": "accent", "hair": "short", "hairc": "brown", "skin": "peach", "body": "classic"}'::jsonb;
begin
  perform private.rate_limit('equip', 240, 3600);
  select explorer_style into v_cur from public.profiles where id = v_uid;
  foreach part in array array['hat', 'hold', 'outfit', 'trail', 'aura', 'hair', 'hairc', 'skin', 'body'] loop
    v_id := coalesce(p_style ->> part, v_cur ->> part, v_defaults ->> part);
    v_item := private.shop_item('explorer.' || part || '.' || v_id);
    if v_item is null then raise exception 'unknown_item' using errcode = 'P0001', detail = part || '.' || v_id; end if;
    if not private.item_is_free(v_item)
       and not exists (select 1 from public.player_unlocks where player_id = v_uid and unlock_key = 'explorer.' || part || '.' || v_id) then
      raise exception 'not_owned' using errcode = 'P0001', detail = part || '.' || v_id;
    end if;
    v_new := v_new || jsonb_build_object(part, v_id);
  end loop;
  update public.profiles set explorer_style = v_new, updated_at = now() where id = v_uid;
  return private.profile_json(v_uid);
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.notify(uuid, text, uuid, jsonb)', 'private.notify_stamp_trg()', 'private.notify_visit_trg()', 'private.notify_checkin_trg()',
    'private.notify_inspire_trg()', 'private.notify_sketch_vote_trg()', 'private.notify_duet_trg()'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.admin_set_sketch_word(text)', 'public.admin_set_potd(uuid, text)', 'public.my_alerts(int)', 'public.alerts_unread()',
    'public.mark_alerts_read()', 'public.room_note(text, text)', 'public.room_note_delete(bigint)', 'public.equip_explorer(jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.sketch_artists_today()', 'public.room_social(text)', 'public.featured_today(int)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end $$;
