-- ============================================================================
-- 0008  Three questions a day, an optional name, and the choice metric.
--
-- What changed in the product, and what each change needs from the schema:
--
--   * The diary now offers three questions a day on three different zones
--     instead of one. Two come from the selection rule (top three, or the
--     exploration branch), one is drawn at random as the control. They are
--     shown in shuffled order and look identical. The participant answers
--     one or more of them.
--       -> prompts_shown gets shown_on (the diary day) and slot (1-3, the
--          position on screen), with one row per slot and per zone a day.
--
--   * Choosing a question is itself a signal. The participant picks one of
--     three before writing, so the pick is recorded separately from the
--     answer, and the zone of the picked question is nudged up once by a
--     small fixed amount (CHOICE_BOOST = 0.03).
--       -> prompts_shown gets was_chosen / chosen_at;
--       -> the weight source lists gain 'choice'.
--
--   * The main KPI is now which question gets picked: the share of picks
--     that land on an adaptive question, against the share expected if the
--     participant picked blindly (two in three).
--       -> the views kpi_choice and kpi_choice_per_participant.
--
--   * Sign-up asks for an optional name to greet the participant by.
--       -> profiles.display_name.
-- ============================================================================

-- ------------------------------------------------------ profiles: a name ---
alter table profiles
  add column display_name text,
  add constraint profiles_display_name_valid
    check (display_name is null
           or (char_length(display_name) between 1 and 40
               and display_name = btrim(display_name)));

comment on column profiles.display_name is
  'Optional, set at sign-up or in Settings. Used only for the greeting; null means the greeting has no name.';

-- ----------------------------------------- weight source: add ''choice'' ---
alter table user_topic_weights
  drop constraint user_topic_weights_source,
  add  constraint user_topic_weights_source
    check (source in ('quiz', 'learned', 'manual', 'choice'));

alter table weight_changes
  drop constraint weight_changes_source,
  add  constraint weight_changes_source
    check (source in ('quiz', 'learned', 'manual', 'choice'));

comment on column user_topic_weights.source is
  'Where the current value came from: quiz = onboarding, learned = an analysed entry, '
  'manual = the participant edited it, choice = the participant picked a question on this zone.';

-- ---------------------------------------- prompts_shown: three per day ---
-- The table is empty when this runs on a fresh project, so the new NOT NULL
-- columns need no backfill. Defaults are dropped afterwards on purpose: the
-- application must say which day and which slot, never rely on a default.
alter table prompts_shown
  add column shown_on  date     not null default current_date,
  add column slot      smallint not null default 1,
  add column was_chosen boolean not null default false,
  add column chosen_at timestamptz;

alter table prompts_shown
  alter column shown_on drop default,
  alter column slot     drop default;

alter table prompts_shown
  add constraint prompts_shown_slot_range
    check (slot between 1 and 3),
  add constraint prompts_shown_one_per_slot
    unique (user_id, shown_on, slot),
  add constraint prompts_shown_distinct_zones
    unique (user_id, shown_on, zone_id),
  add constraint prompts_shown_choice_consistent
    check (was_chosen = (chosen_at is not null)),
  add constraint prompts_shown_answer_needs_choice
    check (not was_answered or was_chosen),
  add constraint prompts_shown_rating_needs_answer
    check (relevance_rating is null or was_answered);

comment on column prompts_shown.shown_on   is 'The diary day the question belongs to. Three rows share it.';
comment on column prompts_shown.slot       is 'Position on screen, 1-3. The order is shuffled, so the slot says nothing about why the question was picked.';
comment on column prompts_shown.was_chosen is 'The participant opened this question to answer it. Picking is the main KPI signal and moves the zone weight once (source = choice).';
comment on column prompts_shown.chosen_at  is 'When it was picked. The earliest pick of a day is the one the choice KPI counts.';

create index prompts_shown_user_day_idx
  on prompts_shown (user_id, shown_on desc);

-- ------------------------------------------------- KPI: what gets picked ---
-- Only the first pick of each day is counted. A participant who answers all
-- three questions picks everything, which says nothing about preference; the
-- first pick, made while all three were still open, does.
create view kpi_choice_first_picks as
select distinct on (ps.user_id, ps.shown_on)
  ps.user_id,
  ps.shown_on,
  ps.zone_id,
  ps.selection_reason,
  ps.selection_reason <> 'baseline_random' as is_adaptive,
  ps.chosen_at
from prompts_shown ps
where ps.was_chosen
order by ps.user_id, ps.shown_on, ps.chosen_at, ps.slot;

comment on view kpi_choice_first_picks is
  'One row per participant and day: the first question picked, and whether it was an adaptive one.';

create view kpi_choice as
with shown as (
  select round(count(*) filter (where selection_reason <> 'baseline_random')::numeric
               / nullif(count(*), 0) * 100, 1) as percent_adaptive_shown
  from prompts_shown
)
select
  count(*)                                    as days_with_a_pick,
  count(*) filter (where f.is_adaptive)       as picked_adaptive,
  count(*) filter (where not f.is_adaptive)   as picked_random,
  round(count(*) filter (where f.is_adaptive)::numeric
        / nullif(count(*), 0) * 100, 1)       as percent_picked_adaptive,
  s.percent_adaptive_shown                    as percent_expected_by_chance
from kpi_choice_first_picks f
cross join shown s
group by s.percent_adaptive_shown;

comment on view kpi_choice is
  'KPI1, pooled. Share of first picks that were adaptive questions, against the share expected by chance '
  '(the share of adaptive questions among those shown, two in three by design).';

create view kpi_choice_per_participant as
select
  f.user_id,
  count(*)                                    as days_with_a_pick,
  count(*) filter (where f.is_adaptive)       as picked_adaptive,
  round(count(*) filter (where f.is_adaptive)::numeric
        / nullif(count(*), 0) * 100, 1)       as percent_picked_adaptive,
  round(count(*) filter (where f.is_adaptive)::numeric
        / nullif(count(*), 0) * 100, 1) - 66.7 as above_chance_points
from kpi_choice_first_picks f
group by f.user_id;

comment on view kpi_choice_per_participant is
  'KPI1 per person: each participant is their own control. A positive above_chance_points means they '
  'picked adaptive questions more often than blind picking would. Count how many are positive (sign test).';

-- The researcher works on masked data only. kpi_choice_first_picks and
-- kpi_choice_per_participant carry the account id, as kpi_per_participant
-- already does, so they get the same masked twin.
create view research_choices as
select
  encode(digest(user_id::text, 'sha256'), 'hex') as participant,
  shown_on,
  zone_id,
  selection_reason,
  is_adaptive
from kpi_choice_first_picks;

comment on view research_choices is
  'First picks per day with the participant replaced by a one-way hash. Input for the sign test.';

grant select on kpi_choice, research_choices to researcher;

-- ------------------------------------------ views are not for participants --
-- On Supabase every new table and view in public is granted to anon and
-- authenticated by default, and a view runs with its owner's rights, which
-- skips row level security. Without the revoke below, any signed-in
-- participant could read every other participant's numbers through the KPI
-- views over the REST API. The tables are safe (RLS is on), the views are
-- not, so the views are closed explicitly. Same for the two tables that are
-- meant for nobody but the service role.
revoke all on research_entries, kpi_engagement, kpi_relevance, kpi_per_participant,
              kpi_choice_first_picks, kpi_choice, kpi_choice_per_participant,
              research_choices
  from anon, authenticated;

revoke all on entry_gold_labels, erasure_log from anon, authenticated;

-- anon is the role of a request with no sign-in. Nothing in this schema is
-- public, so anon holds no table privilege at all.
revoke all on all tables in schema public from anon;
