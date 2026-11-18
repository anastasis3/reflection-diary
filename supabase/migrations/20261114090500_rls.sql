-- ============================================================================
-- 0006  Access control.
--
-- Two kinds of reader, and the rules differ in kind, not in degree:
--
--   a participant  reaches the database through Supabase with their own JWT,
--                  and row level security confines every query to their own
--                  rows. There is no application-side "where user_id = ..."
--                  that could be forgotten;
--
--   a researcher   never reads the tables at all. The researcher role is
--                  granted on three views only, and those views contain no
--                  entry text and no account identifier.
--
-- The service role used by the backend worker bypasses RLS, which is why the
-- worker runs on the server and its key is never shipped to the browser.
-- ============================================================================

-- --------------------------------------------------------------- grants --
-- Supabase grants these to the authenticated role by default. They are
-- written out anyway: a privilege that is only a platform default is a
-- privilege nobody can see when reviewing the schema, and the migrations
-- then also run on a plain PostgreSQL instance.
grant usage on schema public to authenticated, anon;

grant select on zones, prompts to authenticated;

grant select, insert, update, delete on
  profiles, consents, onboarding_answers, entries,
  user_topic_weights, prompts_shown
  to authenticated;

-- Written by the trigger or by the backend worker; the participant reads them.
grant select on entry_topic_scores, entry_highlights,
                weight_history, weight_changes
  to authenticated;

-- entry_gold_labels and erasure_log are granted to nobody.

-- ------------------------------------------ catalog: readable by everyone --
alter table zones   enable row level security;
alter table prompts enable row level security;

create policy zones_readable on zones
  for select to authenticated using (true);

create policy prompts_readable on prompts
  for select to authenticated using (is_active);

-- --------------------------------------------- personal data: own rows only --
alter table profiles            enable row level security;
alter table consents            enable row level security;
alter table onboarding_answers  enable row level security;
alter table entries             enable row level security;
alter table entry_topic_scores  enable row level security;
alter table user_topic_weights  enable row level security;
alter table weight_history      enable row level security;
alter table weight_changes      enable row level security;
alter table prompts_shown       enable row level security;
alter table entry_highlights    enable row level security;
alter table entry_gold_labels   enable row level security;
alter table erasure_log         enable row level security;

-- profiles: the row is the participant.
create policy profiles_own on profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Tables that carry user_id directly.
create policy consents_own on consents
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy onboarding_answers_own on onboarding_answers
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy entries_own on entries
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_topic_weights_own on user_topic_weights
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy prompts_shown_own on prompts_shown
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Read-only to the participant: written by the trigger or by the worker.
create policy weight_history_own on weight_history
  for select to authenticated using (user_id = auth.uid());

create policy weight_changes_own on weight_changes
  for select to authenticated using (user_id = auth.uid());

-- Tables that reach the participant through the entry.
create policy entry_topic_scores_own on entry_topic_scores
  for select to authenticated
  using (exists (select 1 from entries e
                 where e.id = entry_topic_scores.entry_id
                   and e.user_id = auth.uid()));

create policy entry_highlights_own on entry_highlights
  for select to authenticated
  using (exists (select 1 from entries e
                 where e.id = entry_highlights.entry_id
                   and e.user_id = auth.uid()));

-- entry_gold_labels and erasure_log carry no policy at all: with RLS on and
-- no policy, nobody but the service role can read them. Labels must not be
-- visible to the participant whose entry was labelled.

-- ----------------------------------------------------- the researcher role --
do $$ begin
  create role researcher nologin;
exception when duplicate_object then null; end $$;

revoke all on all tables in schema public from researcher;

grant usage on schema public to researcher;
grant select on research_entries, kpi_engagement, kpi_relevance,
                kpi_per_participant to researcher;

comment on role researcher is
  'Analysis only. Holds select on three views and on no table; sees no entry text and no account id.';
