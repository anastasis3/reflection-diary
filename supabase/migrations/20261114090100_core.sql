-- ============================================================================
-- 0002  Core: participants, consent, onboarding, entries.
--
-- Identity lives in Supabase Auth. This schema never stores an email address
-- or a password: auth.users owns both, and profiles extends it one-to-one.
-- Password reset is handled by Supabase Auth and needs no table here.
-- ============================================================================

-- ------------------------------------------------------------- profiles ----
create table profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  onboarding_started_at  timestamptz,
  onboarding_completed_at timestamptz,
  created_at             timestamptz not null default now(),
  constraint profiles_onboarding_order
    check (onboarding_completed_at is null
           or onboarding_started_at is null
           or onboarding_completed_at >= onboarding_started_at)
);

comment on table  profiles                        is 'One row per participant. Extends auth.users; holds no credentials.';
comment on column profiles.onboarding_started_at  is 'Set when the quiz opens. With the next column this is KPI4 (median under 3 minutes).';
comment on column profiles.onboarding_completed_at is 'Null while the quiz is unfinished; the completion rate is the other half of KPI4.';

-- ------------------------------------------------------------- consents ----
-- Separate from profiles because consent is given per purpose and can be
-- withdrawn, and because the wording a participant agreed to must be
-- recoverable afterwards. Withdrawal is recorded, never deleted.
create table consents (
  id           bigint generated always as identity primary key,
  user_id      uuid        not null references profiles (id) on delete cascade,
  purpose      text        not null,
  text_version text        not null,
  granted_at   timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint consents_purpose_valid check (purpose in ('study', 'ai_processing')),
  constraint consents_withdrawn_after_granted
    check (withdrawn_at is null or withdrawn_at >= granted_at)
);

create unique index consents_one_active_per_purpose
  on consents (user_id, purpose) where withdrawn_at is null;

comment on table  consents              is 'Consent events. A participant has at most one active consent per purpose.';
comment on column consents.purpose      is 'study = taking part at all; ai_processing = sending entry text to the classifier.';
comment on column consents.text_version is 'Version of the consent wording shown, so a past agreement can be reconstructed.';

-- --------------------------------------------------- onboarding_answers ----
-- The raw quiz answers. Only the derived weights are needed to run the
-- product, but the thesis analyses the starting point itself, so the answers
-- are stored rather than recomputed from the weights.
create table onboarding_answers (
  user_id     uuid        not null references profiles (id) on delete cascade,
  zone_id     text        not null references zones (id) on update cascade on delete restrict,
  value       smallint    not null,
  answered_at timestamptz not null default now(),
  primary key (user_id, zone_id),
  constraint onboarding_answers_scale check (value between 1 and 5)
);

comment on table  onboarding_answers       is 'One answer per zone on a 1-5 agreement scale; the source of the starting weights.';
comment on column onboarding_answers.value is '1 = strongly disagree … 5 = strongly agree.';

-- -------------------------------------------------------------- entries ----
-- Entry text is encrypted by the application before it reaches the database
-- (NFR-6, AES-256). The database never sees the plaintext, which is why there
-- is no full-text index and why filtering uses the stored classification.
create table entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null references profiles (id) on delete cascade,
  text_encrypted text        not null,
  status         text        not null default 'saved',
  created_at     timestamptz not null default now(),
  classified_at  timestamptz,
  constraint entries_status_valid check (status in ('saved', 'classified', 'classification_failed')),
  constraint entries_classified_has_time
    check ((status = 'classified') = (classified_at is not null))
);

comment on table  entries                is 'One diary entry. Saving always succeeds; classification may follow, fail, or be retried.';
comment on column entries.status         is 'saved = stored, not yet classified; classified = scores present; classification_failed = the service did not answer (NFR-2).';
comment on column entries.text_encrypted is 'Ciphertext. Decryption happens in the application, never in SQL.';

-- --------------------------------------------------- entry_topic_scores ----
-- What the classifier said about one entry. Scores are what move the weights.
create table entry_topic_scores (
  entry_id uuid    not null references entries (id) on delete cascade,
  zone_id  text    not null references zones (id) on update cascade on delete restrict,
  score    numeric(4, 3) not null,
  primary key (entry_id, zone_id),
  constraint entry_topic_scores_range check (score >= 0 and score <= 1)
);

comment on table  entry_topic_scores       is 'Classifier output per zone for one entry; the input to the weight update.';
comment on column entry_topic_scores.score is 'Between 0 and 1. Rows are written only for zones the classifier actually scored.';
