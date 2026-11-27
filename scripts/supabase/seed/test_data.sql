-- ============================================================================
-- Test data: 12 participants over a 30-day window.
--
-- The numbers here exist to exercise the schema — volumes, joins, indexes,
-- constraints and the views — and for no other purpose. They are generated
-- from a fixed random seed with no built-in difference between adaptive and
-- random questions, so nothing in this file should be read as a pilot
-- result. Running it twice gives the same database.
--
-- On Supabase the accounts in auth.users are created through the Auth API,
-- not by SQL. The first block below stands in for that step when the schema
-- is being tested on a plain PostgreSQL instance.
-- ============================================================================

begin;

select setseed(0.42);

-- ---------------------------------------------- 12 accounts (local only) ---
insert into auth.users (id, email)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'participant' || n || '@example.test'
from generate_series(1, 12) as n
on conflict do nothing;

-- ------------------------------------------------------------- profiles ---
-- Ten of the twelve finished the quiz; the two who did not are deliberate,
-- so that the KPI4 completion rate is not trivially 100 %.
insert into profiles (id, onboarding_started_at, onboarding_completed_at, created_at)
select u.id,
       ts,
       case when n in (7, 11) then null
            else ts + make_interval(secs => 95 + (random() * 110)::int) end,
       ts
from generate_series(1, 12) as n
join auth.users u on u.email = 'participant' || n || '@example.test'
cross join lateral (select (date '2026-10-01' + make_interval(hours => n * 3)) as ts) t;

-- Names are optional: two in three participants gave one at sign-up.
update profiles p
set display_name = (array['Mia','Lukas','Ona','Jonas','Ema','Tomas','Ieva','Marius'])[1 + (n % 8)]
from (select id, row_number() over (order by id) as n from profiles) t
where t.id = p.id and t.n % 3 <> 0;

-- ------------------------------------------------------------- consents ---
insert into consents (user_id, purpose, text_version, granted_at)
select p.id, purpose, 'v1.0', p.created_at
from profiles p
cross join (values ('study'), ('ai_processing')) as c(purpose);

-- One participant withdrew consent to AI processing on day 9. Their entries
-- stay; no further classification is allowed for them.
update consents
set withdrawn_at = date '2026-10-09'
where purpose = 'ai_processing'
  and user_id = (select id from profiles order by id offset 4 limit 1);

-- --------------------------------------------------- onboarding answers ---
insert into onboarding_answers (user_id, zone_id, value, answered_at)
select p.id, z.id, 1 + floor(random() * 5)::smallint,
       coalesce(p.onboarding_completed_at, p.onboarding_started_at)
from profiles p
cross join zones z
where p.onboarding_started_at is not null;

-- -------------------------------------------------- starting weights -----
-- weight = (answer - 1) / 4, so a 1-5 answer maps onto 0.00-1.00.
-- This insert fires the audit trigger, which seeds weight_changes and
-- today's row in weight_history.
insert into user_topic_weights (user_id, zone_id, weight, source, updated_at)
select a.user_id, a.zone_id, round((a.value - 1) / 4.0, 3), 'quiz', a.answered_at
from onboarding_answers a;

-- Two participants muted a zone by hand on day 6 (US-5.3).
update user_topic_weights
set is_muted = true, source = 'manual'
where zone_id = 'everyday'
  and user_id in (select id from profiles order by id limit 2);

-- ----------------------------------------------------- 30 days of history --
-- Backfilled so that the trend chart has something to draw. Each day walks
-- the weight a little; the series is smooth, not a step function.
insert into weight_history (user_id, zone_id, as_of, weight)
select w.user_id, w.zone_id, d::date,
       greatest(0, least(1, round(
         (w.weight + sin((d::date - date '2026-10-01') / 4.0) * 0.06
                   + (random() - 0.5) * 0.02)::numeric, 3)))
from user_topic_weights w
cross join generate_series(date '2026-10-01', date '2026-10-30', interval '1 day') as d
on conflict (user_id, zone_id, as_of) do nothing;

-- -------------------------------------------------- prompts and entries ---
-- For each participant, 30 days. Three questions are shown every day on
-- three different zones: one from the three highest weights, one more from
-- the top three or (about one day in seven) the quietest zone, and one drawn
-- at random as the control. They go to shuffled slots.
--
-- On about three days in four the participant picks one and writes; on some
-- of those days they come back for a second. The pick is made blindly here
-- (each of the three equally likely), so the choice KPI on this data should
-- sit near the 66.7 % expected by chance. That is the point: the test data
-- must not contain the effect the study is looking for.
do $$
declare
  p          record;
  d          date;
  zs         text[];
  rs         text[];
  slots      int[];
  i          int;
  k          int;
  first_pick int;
  second_pick int;
  picks      int[];
  pr_id      integer;
  new_entry  uuid;
  st         text;
  written    timestamptz;
  rated      boolean;
begin
  for p in select * from profiles where onboarding_completed_at is not null order by id loop
    for d in select generate_series(date '2026-10-01', date '2026-10-30', interval '1 day')::date loop

      -- slot 1: weighted towards the top three
      select array[w.zone_id] into zs
      from (select zone_id from user_topic_weights
            where user_id = p.id and not is_muted
            order by weight desc limit 3) w
      order by random() limit 1;
      rs := array['top_three'];

      -- slot 2: the rest of the top three, or the quietest zone
      if random() < 0.15 then
        select zs || w.zone_id into zs from user_topic_weights w
        where w.user_id = p.id and not w.is_muted and w.zone_id <> all(zs)
        order by w.weight asc limit 1;
        rs := rs || 'exploration'::text;
      else
        select zs || t.zone_id into zs
        from (select zone_id from user_topic_weights
              where user_id = p.id and not is_muted
              order by weight desc limit 3) t
        where t.zone_id <> all(zs)
        order by random() limit 1;
        rs := rs || 'top_three'::text;
      end if;

      -- slot 3: random, the control
      select zs || z.id into zs from zones z
      where z.id <> all(zs) order by random() limit 1;
      rs := rs || 'baseline_random'::text;

      -- shuffled screen positions
      select array_agg(n order by random()) into slots from generate_series(1, 3) n;

      picks := array[]::int[];
      if random() < 0.74 then
        first_pick := 1 + floor(random() * 3)::int;
        picks := array[first_pick];
        if random() < 0.2 then
          second_pick := 1 + ((first_pick + floor(random() * 2)::int) % 3);
          picks := picks || second_pick;
        end if;
      end if;

      for i in 1..3 loop
        select id into pr_id from prompts
        where zone_id = zs[i] and is_active order by random() limit 1;

        new_entry := null;
        k := array_position(picks, i);       -- null = not picked; 1 = first pick; 2 = second

        if k is not null then
          st      := case when random() < 0.04 then 'classification_failed' else 'classified' end;
          written := d + time '20:40' + make_interval(mins => k * 25 + (random() * 20)::int);

          insert into entries (user_id, text_encrypted, status, created_at, classified_at)
          values (p.id, 'enc:' || encode(gen_random_bytes(24), 'base64'), st, written,
                  case when st = 'classified'
                       then written + make_interval(secs => 2 + (random() * 5)::int) end)
          returning id into new_entry;

          insert into entry_topic_scores (entry_id, zone_id, score)
          select new_entry, z.id,
                 round((case when z.id = zs[i] then 0.55 + random() * 0.45
                             else random() * 0.35 end)::numeric, 3)
          from zones z
          where st = 'classified';
        end if;

        rated := k is not null and random() < 0.6;

        insert into prompts_shown (user_id, prompt_id, zone_id, selection_reason,
                                   shown_on, slot, shown_at,
                                   was_chosen, chosen_at,
                                   was_answered, entry_id,
                                   relevance_rating, rated_at, explanation_opened)
        values (p.id, pr_id, zs[i], rs[i],
                d, slots[i], d + time '08:00',
                k is not null, case when k is not null then written - interval '10 minutes' end,
                k is not null, new_entry,
                case when rated then random() < 0.72 end,
                case when rated then written + interval '2 minutes' end,
                random() < 0.22);
      end loop;

    end loop;
  end loop;
end $$;

-- A pick nudges the zone up once (CHOICE_BOOST = 0.03). Applied here for
-- one participant only, so that source = 'choice' appears in the audit trail.
update user_topic_weights w
set weight = least(1, w.weight + 0.03), source = 'choice'
where w.user_id = (select id from profiles order by id limit 1)
  and w.zone_id = (select zone_id from prompts_shown
                   where user_id = w.user_id and was_chosen
                   order by chosen_at desc limit 1);

-- ------------------------------------------------- the degraded path -----
-- Six entries are left unclassified on purpose. The classifier failing is a
-- documented state (NFR-2), it has its own screen (S-04b) and its own partial
-- index, so the test set has to contain it.
with failed as (
  select id from entries where status = 'classified' order by id limit 6
)
update entries e
set status = 'classification_failed', classified_at = null
from failed f where e.id = f.id;

delete from entry_topic_scores s
using entries e
where s.entry_id = e.id and e.status = 'classification_failed';

-- ------------------------------------------------------------ highlights --
-- Markers for the trend chart, taken from entries that were classified.
insert into entry_highlights (entry_id, zone_id, quote, occurred_on)
select e.id, s.zone_id, q.quote, e.created_at::date
from entries e
join lateral (
  select zone_id from entry_topic_scores
  where entry_id = e.id order by score desc limit 1
) s on true
join lateral (
  select (array['three nights under six hours',
                'first call home in three weeks',
                'the release finally shipped',
                'walked instead of sitting through it',
                'said no and nothing broke'])[1 + floor(random() * 5)::int] as quote
) q on true
where e.status = 'classified' and random() < 0.07;

-- ----------------------------------------------------------- gold labels --
-- A labelled subset for KPI3. Labels are written for every zone of the
-- chosen entries, because macro-F1 needs the negatives as well.
insert into entry_gold_labels (entry_id, zone_id, is_relevant, labelled_by)
select e.id, z.id,
       coalesce((select ts.score from entry_topic_scores ts
                 where ts.entry_id = e.id and ts.zone_id = z.id) > 0.5, false)
         <> (random() < 0.12),        -- disagree with the model about 12 % of the time
       'labeller_a'
from (select id from entries where status = 'classified' order by random() limit 60) e
cross join zones z;

commit;
