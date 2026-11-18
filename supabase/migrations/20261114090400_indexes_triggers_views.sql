-- ============================================================================
-- 0005  Indexes, triggers and views.
--
-- Each index below answers a query the product or the analysis actually runs;
-- none is added on the chance that it might help. Primary keys and unique
-- constraints already index what they cover and are not repeated here.
-- ============================================================================

-- ------------------------------------------------------------- indexes ----

-- History screen: this participant's entries, newest first.
create index entries_user_recent_idx
  on entries (user_id, created_at desc);

-- The retry worker: entries still waiting for the classifier (NFR-2).
create index entries_pending_idx
  on entries (created_at)
  where status <> 'classified';

-- Today and the KPI1 query: what this participant was shown, newest first.
create index prompts_shown_user_recent_idx
  on prompts_shown (user_id, shown_at desc);

-- KPI2: ratings by zone, ignoring the unrated majority.
create index prompts_shown_rated_idx
  on prompts_shown (zone_id, relevance_rating)
  where relevance_rating is not null;

-- Selection: a random active prompt in a chosen zone.
create index prompts_active_by_zone_idx
  on prompts (zone_id)
  where is_active;

-- The heat map: how often a zone appears across entries.
create index entry_topic_scores_zone_idx
  on entry_topic_scores (zone_id);

-- The trend chart: one zone over a date range for one participant.
create index weight_history_lookup_idx
  on weight_history (user_id, zone_id, as_of desc);

-- The markers on that chart.
create index entry_highlights_entry_idx
  on entry_highlights (entry_id);

-- ------------------------------------------------------------ triggers ----

-- 1. Keep updated_at honest: the application cannot forget to set it.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger user_topic_weights_touch
  before update on user_topic_weights
  for each row execute function set_updated_at();

-- 2. Record every weight change and keep today's snapshot current.
--    Writing the audit row here rather than in the application means an edit
--    cannot reach the table without being logged, which is what the
--    specification promises the participant.
create or replace function record_weight_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.weight is not distinct from old.weight
     and new.is_muted is not distinct from old.is_muted then
    return new;                       -- nothing meaningful changed
  end if;

  insert into weight_changes (user_id, zone_id, old_weight, new_weight,
                              old_muted, new_muted, source)
  values (new.user_id, new.zone_id,
          case when tg_op = 'UPDATE' then old.weight end,
          new.weight,
          case when tg_op = 'UPDATE' then old.is_muted end,
          new.is_muted,
          new.source);

  insert into weight_history (user_id, zone_id, as_of, weight)
  values (new.user_id, new.zone_id, current_date, new.weight)
  on conflict (user_id, zone_id, as_of) do update set weight = excluded.weight;

  return new;
end $$;

create trigger user_topic_weights_audit
  after insert or update on user_topic_weights
  for each row execute function record_weight_change();

-- --------------------------------------------------------------- views ----
-- The pilot is within-subject: every participant gets adaptive questions,
-- and about one in three is replaced by a random one from the whole bank.
-- Each person is therefore their own control, and every comparison below is
-- between two kinds of question, never between two groups of people.

-- 1. What a researcher may see of an entry: that it exists, when, how it was
--    classified. Never the text, never the account. The participant is
--    reduced to a stable pseudonym so rows can be grouped per person without
--    naming one.
create view research_entries as
select
  encode(digest(e.user_id::text, 'sha256'), 'hex') as participant,
  e.id                      as entry_id,
  e.created_at::date        as entry_date,
  e.status,
  length(e.text_encrypted)  as ciphertext_length,
  ps.zone_id                as asked_zone,
  ps.selection_reason,
  ps.relevance_rating
from entries e
join profiles p            on p.id = e.user_id
left join prompts_shown ps on ps.entry_id = e.id;

comment on view research_entries is
  'Masked entry view for analysis. No text, no account id; the participant column is a one-way hash.';

-- 2. Engagement, per participant. Descriptive: with no control group there is
--    nothing to compare days-with-entry against, so this reports and does not
--    test.
create view kpi_engagement as
select
  p.id                               as user_id,
  count(distinct e.created_at::date) as days_with_entry,
  count(e.id)                        as entries_total,
  min(e.created_at)::date            as first_entry,
  max(e.created_at)::date            as last_entry
from profiles p
left join entries e on e.user_id = p.id
group by p.id;

comment on view kpi_engagement is 'Descriptive engagement per participant. Not a comparison: the design has no control group.';

-- 3. The main result. Adaptive questions against random ones, pooled over
--    everybody. The rated count is reported beside the percentage because
--    rating is optional and a percentage without its denominator overstates
--    what is known.
create view kpi_relevance as
select
  case when ps.selection_reason = 'baseline_random' then 'random' else 'adaptive' end as question_kind,
  count(*)                                            as shown,
  count(*) filter (where ps.was_answered)             as answered,
  round(count(*) filter (where ps.was_answered)::numeric / nullif(count(*), 0) * 100, 1) as percent_answered,
  count(ps.relevance_rating)                          as rated,
  count(*) filter (where ps.relevance_rating)         as liked,
  round(count(*) filter (where ps.relevance_rating)::numeric
        / nullif(count(ps.relevance_rating), 0) * 100, 1) as percent_liked
from prompts_shown ps
group by 1;

comment on view kpi_relevance is 'KPI2. Adaptive questions against random ones, pooled over all participants.';

-- 4. The same comparison inside each participant. On a handful of people this
--    is the honest form of the result: "in 3 of 4 participants the adaptive
--    questions were liked more often" survives scrutiny that a pooled
--    percentage does not.
create view kpi_per_participant as
select
  user_id,
  count(*) filter (where selection_reason <> 'baseline_random' and relevance_rating is not null) as rated_adaptive,
  count(*) filter (where selection_reason =  'baseline_random' and relevance_rating is not null) as rated_random,
  round(count(*) filter (where selection_reason <> 'baseline_random' and relevance_rating)::numeric
        / nullif(count(*) filter (where selection_reason <> 'baseline_random'
                                    and relevance_rating is not null), 0) * 100, 1) as percent_liked_adaptive,
  round(count(*) filter (where selection_reason =  'baseline_random' and relevance_rating)::numeric
        / nullif(count(*) filter (where selection_reason =  'baseline_random'
                                    and relevance_rating is not null), 0) * 100, 1) as percent_liked_random
from prompts_shown
group by user_id;

comment on view kpi_per_participant is
  'KPI2 per person: each participant is their own control. Compare the last two columns and count how many are positive.';
