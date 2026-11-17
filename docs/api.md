# Reflection Diary API

The same API as `openapi.yaml`, written out so it can be read without any
tooling. The YAML file is the authoritative description; this page exists
because a reviewer should not have to install anything to see what the server
does.

Base URL in development: `http://localhost:3000/api`

---

## Conventions

**Authentication.** `/auth/register` and `/auth/login` return a token. Every
other endpoint except `/health` and `/zones` needs it:

```
Authorization: Bearer <token>
```

The account is taken from the token and never from the URL or the body. There
is no endpoint that accepts a user id, which is why one participant cannot ask
for another's entries by guessing one.

**Errors.** Every failure has the same shape:

```json
{ "error": { "code": "TOO_FEW_ACTIVE_ZONES", "message": "At least 3 zones must stay on …" } }
```

`code` is stable and safe to branch on. `message` is written for the
participant and safe to show. A `422` adds `details`, one entry per field:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Some fields need correcting.",
  "details": [ { "field": "email", "message": "Enter a valid e-mail address.", "in": "body" } ] } }
```

**Status codes.**

| Code | When |
| --- | --- |
| 200 | fine |
| 201 | something was created |
| 400 | the request is wrong in a way no single field explains |
| 401 | no token, an expired token, or the account is gone |
| 404 | not found — or not yours, which is reported the same way on purpose |
| 409 | a rule of the model blocks this (`EMAIL_TAKEN`, `TOO_FEW_ACTIVE_ZONES`, `ONBOARDING_INCOMPLETE`) |
| 422 | one or more fields need correcting |
| 500 | a bug; the message is deliberately flat and says nothing about internals |

**Times** are ISO 8601 with a time zone. **Days** are `YYYY-MM-DD`.

---

## Endpoints

### Health and catalogue

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | no | Liveness check. Used by CI. |
| GET | `/zones` | no | The nine zones with their names and colours. |

### Account

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create an account. Both consents are required. |
| POST | `/auth/login` | Log in. |
| GET | `/auth/me` | Who the token belongs to. |

`POST /auth/register`

```json
{ "email": "you@example.com", "password": "at least eight characters",
  "acceptPrivacyNotice": true, "acceptAiProcessing": true }
```

Registration without `acceptAiProcessing` is refused with a `400`: the diary
cannot choose a question without reading what was written, so an account
without that consent has nothing to offer.

A wrong password and an unknown e-mail give the same `401` with the same
message, so this endpoint cannot be used to find out who has an account.

### Onboarding — the nine statements

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/onboarding` | The statements and how far the quiz has got. |
| POST | `/onboarding/answers` | Answer one statement: `{ "zoneId": "work", "value": 4 }`. |
| POST | `/onboarding/complete` | Turn the answers into the nine starting weights. |

Each answer is saved as it is given, so the screen resumes where it stopped —
`nextStep` is the first statement with no answer. Completing converts the
answers with `weight = (answer − 1) / 4`, so a 1–5 scale becomes 0.00–1.00.
Completing is refused while any statement is unanswered, and `details.missing`
lists which.

### Questions

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/prompts/today` | The question of the day. |
| GET | `/prompts/{id}/explanation` | "Why this question?" |
| POST | `/prompts/{id}/rating` | `{ "relevant": true }` |

One question per calendar day. Asking again the same day returns the same
question with `isNew: false`, so a reload or a second device cannot hand out a
second one.

**The response does not say why the question was chosen.** A participant who
could see that today's question was drawn at random would rate it differently,
and the comparison the whole study rests on would be worthless. The reason is
stored in `prompts_shown.selection_reason` and read only for the analysis.

Rating is optional. An absent rating means *not rated*, never *disliked* — the
analysis counts liked questions among the rated ones only.

### Entries

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/entries` | Save an entry, then analyse it. |
| GET | `/entries` | List, with `?zone=`, `?from=`, `?to=`. |
| GET | `/entries/{id}` | One entry. |

`POST /entries`

```json
{ "text": "Three meetings that could have been one message…",
  "promptShownId": "7f1c…" }
```

Four steps in this order: the text is saved, it is linked to the question, it
is analysed, the weights move. **This is the only point at which the text of an
entry is sent for analysis — never while the participant is typing.**

Steps three and four can fail without taking step one with them. The `analysis`
field says what happened:

| value | meaning |
| --- | --- |
| `classified` | analysed; `weightChanges` lists what moved |
| `failed` | the analysis was unavailable; the entry is kept, the profile is unchanged |
| `skipped_no_consent` | consent was withdrawn; the entry is kept and not analysed |

All three return `201`, because in all three the entry exists.

### Profile

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/profile` | The nine weights, highest first. |
| PATCH | `/profile/weights` | Edit by hand: `{ "zones": [{ "zoneId": "work", "weight": 0.4 }] }` |
| GET | `/profile/trend?zone=work&days=30` | One zone over time. |
| GET | `/profile/changes` | Every change, with its cause. |

Each zone comes back with `startWeight` (what the quiz set), `delta` (how far
it has moved since) and `askedAbout`.

An edit may set a value and mute zones, but **at least three must stay active**
or there is nothing to ask about; otherwise the whole edit is refused with
`409 TOO_FEW_ACTIVE_ZONES` and nothing changes. A muted zone is left alone by
the adaptation entirely — its weight does not move when an entry is classified.

The trend returns only the days on which the zone actually moved. No value is
invented for a day nothing was written.

### History

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/history/summary` | Entries per zone, for the filter pills. |
| GET | `/history/calendar?month=2026-11` | The month as a calendar. |
| GET | `/history/day/2026-11-17` | One day: question, rating, entries. |

All nine zones are returned by the summary, including the empty ones. The
calendar returns every day of the month, including the empty ones —
`firstWeekday` is 0 for Monday. A day with nothing on it is a valid answer, not
an error.

### Privacy

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/account/consents` | Both consents, with when each was given and withdrawn. |
| DELETE | `/account/consents/ai-processing` | Stop the analysis. |
| POST | `/account/consents/ai-processing` | Give the consent again. |
| GET | `/account/export` | Everything stored about this account, as JSON. |
| DELETE | `/account` | Delete the account and all of its data. |

Withdrawing deletes nothing: entries are still saved, they are simply no longer
analysed, so the profile stops changing. The consent row is kept with a
`withdrawnAt` timestamp, because the study has to be able to say when
processing stopped.

The export is assembled from the same repositories the application itself
reads, so it cannot quietly leave something out. It never contains the password
hash.

Deletion removes the account, every entry, every topic score, the profile, the
weight history and everything recorded during the pilot. The token stops
working immediately. `tests/integration/account.test.js` checks every
collection for leftover rows afterwards.

---

## The model in one page

**Zones.** Nine topics derived from the four WHOQOL-BREF domains and the five
PERMA elements, adapted for journalling. This is an adaptation, not a validated
scale: a weight says how relevant a topic is to this person right now, for
choosing a question. It is not a measure of well-being.

**Weights.** One per zone, 0.00–1.00. Set by the quiz, then moved by entries.

**Choosing a question** (`src/services/selection.service.js`):

1. with probability `RANDOM_QUESTION_SHARE` (0.33) — a question drawn at random
   from the whole bank: `baseline_random`, the control condition;
2. otherwise with probability `EXPLORATION_RATE` (0.15) — the quietest
   non-muted zone: `exploration`, so the profile cannot narrow onto three
   topics for ever;
3. otherwise one of the three highest-weighted zones: `top_three`.

A muted zone is never chosen, and yesterday's zone is excluded so the same
topic is not asked two days running.

**Moving the weights** (`src/services/adaptation.service.js`):

```
new = 0.3 × score + 0.7 × old
```

An exponential moving average: slow, so one unusual day does not rewrite the
profile, and reversible, so a topic that stops appearing fades on its own.

**The study.** Every participant receives both kinds of question, so each is
compared against themselves — a within-subject design. The main outcome is the
share of questions rated relevant among the adaptive ones against the random
ones, per participant. `exploration` counts as adaptive: it is produced by the
model, not by chance.
