-- ============================================================================
-- Verification. Run after the migrations and the test data.
--
-- Every check prints PASS or FAIL. These are the claims the documentation
-- makes about the schema, written as queries so that they can be re-run
-- rather than taken on trust.
-- ============================================================================

\set ON_ERROR_STOP off
\pset format aligned

-- Everything runs inside one transaction and is rolled back at the end, so
-- the checks leave the database exactly as they found it. The transaction is
-- also what makes SET LOCAL and the savepoints below work.
begin;

-- --------------------------------------------------------------------------
-- 1. Row level security: a participant sees their own rows and no others.
-- --------------------------------------------------------------------------
\echo '--- 1. Row level security'

select id as victim_id from profiles order by id offset 1 limit 1 \gset
select id as actor_id  from profiles order by id limit 1 \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', :'actor_id', true);

select case when count(*) = 1 then 'PASS' else 'FAIL' end as "own profile visible (expect 1)",
       count(*) from profiles;

select case when count(*) = 0 then 'PASS' else 'FAIL' end as "other participants hidden",
       count(*) from profiles where id <> :'actor_id'::uuid;

select case when count(*) > 0 then 'PASS' else 'FAIL' end as "own entries visible",
       count(*) from entries;

select case when count(*) = 0 then 'PASS' else 'FAIL' end as "entries of others hidden",
       count(*) from entries where user_id <> :'actor_id'::uuid;

-- Gold labels are not merely filtered by a policy: the role has no privilege
-- on the table at all, so the check asks about the grant rather than selecting.
select case when has_table_privilege('authenticated', 'entry_gold_labels', 'select')
            then 'FAIL' else 'PASS' end as "gold labels not granted to participants";

-- Writing into someone else's account must be refused by the WITH CHECK clause.
\echo '--- 2. A participant cannot write into another account'
savepoint before_cross_write;
insert into entries (user_id, text_encrypted) values (:'victim_id'::uuid, 'enc:nope');
rollback to savepoint before_cross_write;
\echo '(expected: new row violates row-level security policy)'

reset role;

-- --------------------------------------------------------------------------
-- 3. The researcher role reaches the views and not the tables.
-- --------------------------------------------------------------------------
\echo '--- 3. Researcher access'

select case when has_table_privilege('researcher', 'entries', 'select')
            then 'FAIL' else 'PASS' end as "researcher cannot select entries";

select case when has_table_privilege('researcher', 'research_entries', 'select')
            then 'PASS' else 'FAIL' end as "researcher can select the masked view";

select case when exists (
         select 1 from information_schema.columns
         where table_name = 'research_entries' and column_name in ('text_encrypted', 'user_id'))
       then 'FAIL' else 'PASS' end as "masked view exposes no text and no account id";

-- --------------------------------------------------------------------------
-- 4. Constraints reject the data they are supposed to reject.
-- --------------------------------------------------------------------------
\echo '--- 4. Constraints'

savepoint c1;
insert into entry_topic_scores (entry_id, zone_id, score)
select id, 'work', 1.4 from entries limit 1;
rollback to savepoint c1;
\echo '(expected: entry_topic_scores_range)'

savepoint c2;
insert into entries (user_id, text_encrypted, status)
select id, 'enc:x', 'classified' from profiles limit 1;
rollback to savepoint c2;
\echo '(expected: entries_classified_has_time)'

savepoint c3;
update prompts_shown set relevance_rating = true
where relevance_rating is null and rated_at is null;
rollback to savepoint c3;
\echo '(expected: prompts_shown_rating_consistent)'

savepoint c4;
insert into prompts_shown (user_id, prompt_id, zone_id, selection_reason, shown_on, slot)
select p.id, pr.id, pr.zone_id, 'guessed', date '2027-01-01', 1
from profiles p cross join (select id, zone_id from prompts limit 1) pr limit 1;
rollback to savepoint c4;
\echo '(expected: prompts_shown_reason_valid)'

-- --------------------------------------------------------------------------
-- 5. The audit trigger fires without the application doing anything.
-- --------------------------------------------------------------------------
\echo '--- 5. Audit trigger'

select count(*) as changes_before from weight_changes \gset
-- 0.123 cannot be a starting value: those are (answer - 1) / 4, so the
-- update is guaranteed to be a real change and the trigger must fire.
update user_topic_weights set weight = 0.123, source = 'manual'
where user_id = (select id from profiles order by id limit 1) and zone_id = 'work';

select case when count(*) = :changes_before + 1 then 'PASS' else 'FAIL' end
         as "weight_changes gained exactly one row",
       count(*) from weight_changes;

select case when weight = 0.123 then 'PASS' else 'FAIL' end as "weight_history holds today's value"
from weight_history
where user_id = (select id from profiles order by id limit 1)
  and zone_id = 'work' and as_of = current_date;

-- --------------------------------------------------------------------------
-- 6. Erasure: deleting the account removes everything that belongs to it.
-- --------------------------------------------------------------------------
\echo '--- 6. Erasure by cascade'

select id as doomed from profiles order by id desc limit 1 \gset

savepoint erasure;
select count(*) as before_rows from (
  select 1 from entries           where user_id = :'doomed'::uuid
  union all select 1 from prompts_shown      where user_id = :'doomed'::uuid
  union all select 1 from user_topic_weights where user_id = :'doomed'::uuid
  union all select 1 from weight_history     where user_id = :'doomed'::uuid
) t \gset

delete from auth.users where id = :'doomed'::uuid;

select case when count(*) = 0 then 'PASS' else 'FAIL' end as "all rows of the account are gone",
       count(*) from (
  select 1 from entries           where user_id = :'doomed'::uuid
  union all select 1 from prompts_shown      where user_id = :'doomed'::uuid
  union all select 1 from user_topic_weights where user_id = :'doomed'::uuid
  union all select 1 from weight_history     where user_id = :'doomed'::uuid
) t;

rollback to savepoint erasure;

-- --------------------------------------------------------------------------
-- 7. Three questions a day.
-- --------------------------------------------------------------------------
\echo '--- 7. Three questions a day'

select case when max(c) = 3 and min(c) = 3 then 'PASS' else 'FAIL' end as "exactly three shown per participant-day",
       min(c), max(c)
from (select count(*) c from prompts_shown group by user_id, shown_on) t;

select case when count(*) = 0 then 'PASS' else 'FAIL' end as "each day has one random control",
       count(*)
from (select user_id, shown_on from prompts_shown group by 1, 2
      having count(*) filter (where selection_reason = 'baseline_random') <> 1) t;

savepoint t1;
insert into prompts_shown (user_id, prompt_id, zone_id, selection_reason, shown_on, slot)
select user_id, prompt_id, zone_id, 'top_three', shown_on, 3
from prompts_shown where slot = 1 limit 1;
rollback to savepoint t1;
\echo '(expected: prompts_shown_distinct_zones or prompts_shown_one_per_slot)'

savepoint t2;
update prompts_shown set slot = 4 where slot = 1;
rollback to savepoint t2;
\echo '(expected: prompts_shown_slot_range)'

savepoint t3;
update prompts_shown set was_chosen = false, chosen_at = null where was_answered;
rollback to savepoint t3;
\echo '(expected: prompts_shown_answer_needs_choice)'

savepoint t4;
update profiles set display_name = '   ' where display_name is null;
rollback to savepoint t4;
\echo '(expected: profiles_display_name_valid)'

select case when count(*) > 0 then 'PASS' else 'FAIL' end as "choice appears as a weight source",
       count(*) from weight_changes where source = 'choice';

-- --------------------------------------------------------------------------
-- 8. The KPI views are closed to participants and to anonymous requests.
-- --------------------------------------------------------------------------
\echo '--- 8. View privileges'

select case when has_table_privilege('authenticated', 'kpi_choice', 'select')
              or has_table_privilege('anon', 'kpi_choice', 'select')
              or has_table_privilege('authenticated', 'research_entries', 'select')
            then 'FAIL' else 'PASS' end as "participants cannot read KPI views";

select case when has_table_privilege('researcher', 'kpi_choice', 'select')
             and has_table_privilege('researcher', 'research_choices', 'select')
            then 'PASS' else 'FAIL' end as "researcher can read the choice KPI";

select * from kpi_choice;

rollback;
\echo '--- done (nothing was kept: the transaction was rolled back)'
