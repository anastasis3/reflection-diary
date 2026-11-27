-- ============================================================================
-- 0001  Catalog: the nine topic zones and the prompt bank.
--
-- Both tables are shared reference data, identical for every participant.
-- They are the only tables in the schema that contain no personal data.
-- ============================================================================

-- pgcrypto supplies digest(), used by the masked research view in 0005.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- zones ----
-- The nine zones are derived from the four WHOQOL-BREF domains and the five
-- PERMA elements, adapted as journalling topics (UX specification, section 1.2).
-- The id is a short stable text key so that it can be read in queries and in
-- log output without a join; the set is fixed by the study design.
create table zones (
  id          text primary key,
  name_en     text        not null,
  description text        not null,
  sort_order  smallint    not null,
  is_active   boolean     not null default true,
  constraint zones_id_lowercase check (id = lower(id)),
  constraint zones_sort_unique  unique (sort_order)
);

comment on table  zones            is 'The nine topic zones. Fixed by the study design; not editable by participants.';
comment on column zones.id         is 'Stable short key used as a foreign key everywhere else.';
comment on column zones.is_active  is 'A zone withdrawn after the pilot keeps its history but is no longer asked about.';

insert into zones (id, name_en, description, sort_order) values
  ('work',     'work & study',   'Load, progress, what is finished and what is stuck',        1),
  ('people',   'close people',   'Family, friends, colleagues, contact kept or missed',       2),
  ('health',   'health & body',  'How the body feels, movement, pain, care taken',            3),
  ('energy',   'energy & sleep', 'Rest, recovery, when energy rises and drops',               4),
  ('emotion',  'emotions',       'What was felt and what set it off',                         5),
  ('self',     'self & growth',  'Who the person is becoming, what changed in them',          6),
  ('interest', 'interests',      'Attention given to something for its own sake',             7),
  ('meaning',  'meaning',        'What the days are spent on and whether it is worth it',     8),
  ('everyday', 'everyday life',  'Home, money, routine, the practical frame of the week',     9);

-- -------------------------------------------------------------- prompts ----
-- The question bank. Every prompt belongs to exactly one zone, which is what
-- makes "the question was chosen for zone X" a fact rather than an inference.
create table prompts (
  id         integer generated always as identity primary key,
  zone_id    text        not null references zones (id) on update cascade on delete restrict,
  text       text        not null,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  constraint prompts_text_not_blank check (length(btrim(text)) > 0),
  constraint prompts_text_unique    unique (zone_id, text)
);

comment on table  prompts           is 'Reflection questions, one zone each. The baseline arm draws from the same bank at random.';
comment on column prompts.is_active is 'A prompt withdrawn mid-pilot stays here so that past selections remain explainable.';

insert into prompts (zone_id, text) values
  ('work',     'What at work or in your studies took more energy from you this week than it gave back?'),
  ('work',     'What did you finish this week that nobody noticed?'),
  ('people',   'Who did you want to reach out to this week — and what stopped you, or did not?'),
  ('people',   'Who made your week easier, and do they know it?'),
  ('health',   'How did your body feel this week — and did you listen to it?'),
  ('health',   'What did you do for your body this week that was not an obligation?'),
  ('energy',   'When did you feel most awake this week, and what were you doing?'),
  ('energy',   'What took your energy this week without giving anything back?'),
  ('emotion',  'What did you feel most strongly this week, and what set it off?'),
  ('emotion',  'Was there a moment this week when your reaction surprised you?'),
  ('self',     'What did you do this week that felt like you at your best?'),
  ('self',     'What would you do differently if this week started again?'),
  ('interest', 'What caught your attention lately that has nothing to do with duty?'),
  ('interest', 'What did you want to learn more about this week?'),
  ('meaning',  'What did you spend time on this week that felt worth doing in itself?'),
  ('meaning',  'What mattered to you this week that would not show up on any list?'),
  ('everyday', 'What small thing in your day-to-day would make the week lighter if you fixed it?'),
  ('everyday', 'What part of your week ran smoothly, and why?');
