-- ============================================================================
-- 0007  The remaining column comments.
--
-- The earlier files comment the columns whose meaning is a design decision.
-- This file fills in the rest, so that the data dictionary generated from the
-- database describes every column rather than most of them.
-- ============================================================================

comment on column zones.name_en    is 'Label shown in the interface.';
comment on column zones.description is 'One line on what questions in this zone are about.';
comment on column zones.sort_order is 'Fixed display order, so the profile reads the same way every time.';

comment on column prompts.id         is 'Surrogate key. Referenced by prompts_shown.';
comment on column prompts.zone_id    is 'The zone this question belongs to. A prompt belongs to exactly one.';
comment on column prompts.text       is 'The question as shown, in English.';
comment on column prompts.created_at is 'When the prompt entered the bank.';

comment on column profiles.id         is 'Same value as auth.users.id. Identity is owned by Supabase Auth.';
comment on column profiles.created_at is 'When the participant joined the study.';

comment on column consents.id           is 'Surrogate key; a participant has several consent events over time.';
comment on column consents.user_id      is 'The participant who gave or withdrew this consent.';
comment on column consents.granted_at   is 'When this consent was given.';
comment on column consents.withdrawn_at is 'Null while the consent still stands. Withdrawal is recorded, never deleted.';

comment on column onboarding_answers.user_id     is 'The participant who answered.';
comment on column onboarding_answers.zone_id     is 'The zone the statement was about; one statement per zone.';
comment on column onboarding_answers.answered_at is 'When the quiz was completed.';

comment on column user_topic_weights.user_id    is 'The participant whose profile this row belongs to.';
comment on column user_topic_weights.zone_id    is 'The zone this weight is for. Every participant has all nine.';
comment on column user_topic_weights.updated_at is 'Set by trigger on every change; never written by the application.';

comment on column weight_history.user_id is 'The participant.';
comment on column weight_history.zone_id is 'The zone.';
comment on column weight_history.weight  is 'The value this weight held on that day.';

comment on column weight_changes.id         is 'Surrogate key.';
comment on column weight_changes.user_id    is 'The participant whose weight changed.';
comment on column weight_changes.zone_id    is 'The zone that changed.';
comment on column weight_changes.old_weight is 'Value before the change. Null on the first insert.';
comment on column weight_changes.new_weight is 'Value after the change.';
comment on column weight_changes.old_muted  is 'Muted flag before the change. Null on the first insert.';
comment on column weight_changes.new_muted  is 'Muted flag after the change.';
comment on column weight_changes.source     is 'What caused it: the quiz, the learning rule, or the participant.';
comment on column weight_changes.changed_at is 'When the change was recorded.';

comment on column entries.id            is 'Surrogate key, also the handle used by prompts_shown.';
comment on column entries.user_id       is 'The participant who wrote it.';
comment on column entries.created_at    is 'When the entry was saved. Saving never waits for the classifier.';
comment on column entries.classified_at is 'When classification finished. Null until then, and after a failure.';

comment on column entry_topic_scores.entry_id is 'The entry that was scored.';
comment on column entry_topic_scores.zone_id  is 'The zone the score is for.';

comment on column prompts_shown.id           is 'Surrogate key.';
comment on column prompts_shown.user_id      is 'The participant the question was shown to.';
comment on column prompts_shown.prompt_id    is 'Which question was shown.';
comment on column prompts_shown.zone_id      is 'The zone chosen at that moment. Stored, not joined: see section 2.2 of the documentation.';
comment on column prompts_shown.shown_at     is 'When the question was put in front of the participant.';
comment on column prompts_shown.was_answered is 'True exactly when an entry is attached; enforced by a check constraint.';
comment on column prompts_shown.rated_at     is 'When the rating was given. Present exactly when relevance_rating is.';

comment on column entry_highlights.id          is 'Surrogate key.';
comment on column entry_highlights.entry_id    is 'The entry the quote was taken from.';
comment on column entry_highlights.zone_id     is 'The zone the marker belongs to on the trend chart.';
comment on column entry_highlights.occurred_on is 'The day the marker is placed on. Stored rather than derived, so that moving an entry cannot move its marker.';
comment on column entry_highlights.created_at  is 'When the highlight was extracted.';

comment on column entry_gold_labels.entry_id    is 'The entry being labelled.';
comment on column entry_gold_labels.zone_id     is 'The zone being judged. Labels cover every zone, because macro-F1 needs the negatives too.';
comment on column entry_gold_labels.is_relevant is 'Human judgement: does this entry genuinely concern this zone?';
comment on column entry_gold_labels.labelled_at is 'When the label was given.';

comment on column erasure_log.id           is 'Surrogate key.';
comment on column erasure_log.requested_at is 'When erasure was requested.';
comment on column erasure_log.completed_at is 'When it finished. Null means it did not.';
comment on column erasure_log.duration_ms  is 'Measured duration, against the five-second limit in NFR-8.';
