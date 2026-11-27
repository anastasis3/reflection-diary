-- Personal questions written by Claude (adaptive questions only).
alter table prompts_shown
  add column prompt_text text,
  add column text_source text not null default 'bank',
  add constraint prompts_shown_text_source check (text_source in ('bank', 'generated')),
  add constraint prompts_shown_generated_has_text
    check ((text_source = 'generated') = (prompt_text is not null)),
  add constraint prompts_shown_prompt_text_length
    check (prompt_text is null or char_length(prompt_text) between 5 and 300);

comment on column prompts_shown.prompt_text is
  'The question as shown when Claude wrote it; null when the bank text of prompt_id was shown.';
comment on column prompts_shown.text_source is
  'bank or generated (adaptive questions only). Report KPIs by this too.';