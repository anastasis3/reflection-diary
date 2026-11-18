-- ============================================================================
-- 0003  Adaptation: the weights, their history, and what was shown.
--
-- This is the part of the schema the thesis is actually about: how relevance
-- is learned, how it is shown back, and whether the participant agreed.
-- ============================================================================

-- --------------------------------------------- user_topic_weights (now) ----
-- The current profile: nine rows per participant, the state the selection
-- rule reads. Updated after every classified entry by
--     new = 0.3 * score + 0.7 * old
create table user_topic_weights (
  user_id    uuid        not null references profiles (id) on delete cascade,
  zone_id    text        not null references zones (id) on update cascade on delete restrict,
  weight     numeric(4, 3) not null,
  is_muted   boolean     not null default false,
  source     text        not null default 'quiz',
  updated_at timestamptz not null default now(),
  primary key (user_id, zone_id),
  constraint user_topic_weights_range  check (weight >= 0 and weight <= 1),
  constraint user_topic_weights_source check (source in ('quiz', 'learned', 'manual'))
);

comment on table  user_topic_weights          is 'The nine current weights per participant. One row per zone, always present.';
comment on column user_topic_weights.weight   is 'Relevance for question selection between 0 and 1. Not a measurement of well-being.';
comment on column user_topic_weights.is_muted is 'A muted zone is never asked about. Separate from weight = 0, which is still a learned value (US-5.3).';
comment on column user_topic_weights.source   is 'Where the current value came from: the onboarding quiz, learning, or the participant editing it.';

-- ----------------------------------------------- weight_history (daily) ----
-- One snapshot per participant, zone and day. Without this table the 30-day
-- curve (US-5.6) and the past-day view on Today (US-5.8) cannot exist: the
-- table above only ever holds the present.
create table weight_history (
  user_id   uuid     not null references profiles (id) on delete cascade,
  zone_id   text     not null references zones (id) on update cascade on delete restrict,
  as_of     date     not null,
  weight    numeric(4, 3) not null,
  primary key (user_id, zone_id, as_of),
  constraint weight_history_range check (weight >= 0 and weight <= 1)
);

comment on table  weight_history       is 'End-of-day value of every weight. The source of the trend chart and of any past-day view.';
comment on column weight_history.as_of is 'The day the value belongs to. One row per day even when nothing changed.';

-- ---------------------------------------------- weight_changes (manual) ----
-- Every manual edit is recorded. The specification promises this to the
-- participant, and the analysis needs it: a weight a participant set by hand
-- is not evidence about the learning rule.
create table weight_changes (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references profiles (id) on delete cascade,
  zone_id    text        not null references zones (id) on update cascade on delete restrict,
  old_weight numeric(4, 3),
  new_weight numeric(4, 3) not null,
  old_muted  boolean,
  new_muted  boolean     not null,
  source     text        not null,
  changed_at timestamptz not null default now(),
  constraint weight_changes_source check (source in ('quiz', 'learned', 'manual'))
);

comment on table weight_changes is 'Audit trail of weight changes. Written by trigger, never by the application.';

-- -------------------------------------------------------- prompts_shown ----
-- One row per question put in front of a participant. This is the join
-- between what the system decided and what the participant did about it.
create table prompts_shown (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid        not null references profiles (id) on delete cascade,
  prompt_id          integer     not null references prompts (id) on delete restrict,
  zone_id            text        not null references zones (id) on update cascade on delete restrict,
  selection_reason   text        not null,
  shown_at           timestamptz not null default now(),
  was_answered       boolean     not null default false,
  entry_id           uuid unique references entries (id) on delete set null,
  relevance_rating   boolean,
  rated_at           timestamptz,
  explanation_opened boolean     not null default false,
  constraint prompts_shown_reason_valid
    check (selection_reason in ('top_three', 'exploration', 'baseline_random')),
  constraint prompts_shown_answer_consistent
    check (was_answered = (entry_id is not null)),
  constraint prompts_shown_rating_consistent
    check ((relevance_rating is null) = (rated_at is null))
);

comment on table  prompts_shown                    is 'Every question shown, why it was chosen, and what came back. The main table for KPI1 and KPI2.';
comment on column prompts_shown.selection_reason   is 'top_three = from the three highest weights; exploration = the epsilon = 0.15 branch; baseline_random = the control arm.';
comment on column prompts_shown.entry_id           is 'The entry written in answer, if any. One entry answers at most one shown prompt.';
comment on column prompts_shown.relevance_rating   is 'true = relevant, false = not relevant, null = not rated. Rating is optional by design.';
comment on column prompts_shown.explanation_opened is 'Whether "Why this question?" was opened. Evidence for the transparency claim, not a KPI.';
