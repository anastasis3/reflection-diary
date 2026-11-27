-- ============================================================================
-- 0004  Research: the gold labels, the quoted highlights, the erasure log.
--
-- Three small tables that exist because the thesis makes three promises:
-- that macro-F1 is measured against human labels, that the markers on the
-- trend chart are quotes rather than inferences, and that erasure is provable.
-- ============================================================================

-- ---------------------------------------------------- entry_gold_labels ----
-- Human labels for the evaluation set, kept apart from the model's own
-- scores so that predictions can never be compared against themselves.
create table entry_gold_labels (
  entry_id    uuid        not null references entries (id) on delete cascade,
  zone_id     text        not null references zones (id) on update cascade on delete restrict,
  is_relevant boolean     not null,
  labelled_by text        not null,
  labelled_at timestamptz not null default now(),
  primary key (entry_id, zone_id)
);

comment on table  entry_gold_labels             is 'Manual labels for the evaluation subset. The ground truth for KPI3 (macro-F1 >= 0.70).';
comment on column entry_gold_labels.labelled_by is 'Who labelled it. Two labellers on the same entry mean the pair can be checked for agreement.';

-- ------------------------------------------------------ entry_highlights --
-- The marked moments on the 30-day curve. Each one is a span of text the
-- participant themselves wrote; the product never writes its own label here.
create table entry_highlights (
  id          bigint generated always as identity primary key,
  entry_id    uuid        not null references entries (id) on delete cascade,
  zone_id     text        not null references zones (id) on update cascade on delete restrict,
  quote       text        not null,
  occurred_on date        not null,
  created_at  timestamptz not null default now(),
  constraint entry_highlights_quote_short check (length(quote) between 1 and 120)
);

comment on table  entry_highlights       is 'Short quotes lifted from entries, shown as markers on the trend chart (US-5.6).';
comment on column entry_highlights.quote is 'Taken verbatim from the entry. Capped at 120 characters so a marker is a phrase, not a paragraph.';

-- ---------------------------------------------------------- erasure_log ----
-- Deliberately keeps no foreign key: the row survives the participant.
-- It records that an erasure happened and how long it took, and nothing
-- that could identify who it was about once the account is gone.
create table erasure_log (
  id           bigint generated always as identity primary key,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms  integer,
  row_count    integer,
  constraint erasure_log_duration_sign check (duration_ms is null or duration_ms >= 0)
);

comment on table  erasure_log             is 'Evidence for NFR-8 (erasure within 5 s). Holds no identifier of the erased account.';
comment on column erasure_log.row_count   is 'How many rows the cascade removed, for the report only.';
