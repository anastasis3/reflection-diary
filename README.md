# Reflection Diary

**Development and Experimental Evaluation of an Adaptive Self-Reflection Diary
with AI-Based Personalization**

A diary that offers **three questions a day** and lets the person pick the
one that fits. Which questions it offers depends on what the person has been
writing about: every entry is analysed for nine topic zones, and nine weights
move slowly towards what the entries are actually about. Two of the three
questions come from those weights; the third is drawn at random, so that the
project can measure whether the chosen questions suit people better than
chance does — mainly by which question gets picked.

This repository holds the whole working system: the HTTP API, the interface,
the automated tests, the API documentation and the continuous integration that
runs them.

---

## Running it

Node 20.11 or newer. Out of the box no database server and no API key are
needed: the data goes into a JSON file (the **memory** driver). For the real
deployment on **Supabase** (PostgreSQL + Supabase Auth) follow
[`docs/supabase.md`](docs/supabase.md) and set `DB_DRIVER=supabase`.

```bash
npm install
cp .env.example .env     # optional in development; the defaults work
npm start
```

| | |
| --- | --- |
| the interface | <http://localhost:3000/> |
| the API | <http://localhost:3000/api/health> |
| the API reference | <http://localhost:3000/docs/> |

Other commands:

```bash
npm run dev       # restarts on every change
npm test          # the whole test suite
npm run seed      # a demo account with a month of history (memory driver)
npm run db:migrate  # apply supabase/migrations to the database in SUPABASE_DB_URL
```

`npm run seed` creates `demo@example.test` / `demo12345` with thirty days of
entries behind it. The History screen, the trend chart and the calendar only
show anything after weeks of use, and waiting a month to look at them is not a
way to work. **Nothing produced by that script is a result**: those entries
were written for the script, not collected from anyone, and no number taken
from them belongs in the thesis.

---

## What is in here

```
src/                     the server
  config/                every environment variable, read in one place
  routes/                what the API offers — a table of contents
  controllers/           read the request, call one service, send the answer
  services/              all the rules of the product live here
  repositories/          the only code that touches stored data
    index.js             picks the driver from DB_DRIVER
    memory/              JSON file — tests, CI, a quick local run
    postgres/            PostgreSQL + Supabase Auth — the deployment
  middleware/            authentication, validation, errors, logging
  validators/            every shape the API accepts, as Zod schemas
  data/                  zones, question bank, JSON store, pg pool, Supabase client
  utils/                 errors, password hashing, AES-256-GCM, dates
  app.js                 assembles Express
  server.js              starts it

public/                  the interface: HTML, CSS and JavaScript, no framework
  css/base.css           layout and components of the mockup
  css/theme.css          the violet glass look, the eye intro, phone tweaks
  js/
    core.js              state, zones, icons, render / go / route
    api.js               the only place the browser talks to the server
    data.js              shared loaders (profile, entries, the week)
    radar.js             the radar chart, its animations and sparks
    effects.js           the haze and the rating burst
    eye.js               the Three.js eye intro of the quiz
    screens/             auth, quiz, today, profile, history, settings

supabase/
  migrations/            the database schema, in order (run on Supabase)
  seed/                  test_data.sql (local only) and checks.sql
  local/00_auth_stub.sql stands in for Supabase Auth on a plain PostgreSQL

tests/
  unit/                  the algorithms, with no HTTP and no database
  integration/           the real application, driven over HTTP (memory driver)
  postgres/              the same API on a real PostgreSQL (needs TEST_DATABASE_URL)

docs/
  openapi.yaml           the API, described once
  api.md                 the same thing, readable without tooling
  supabase.md            creating the Supabase project and connecting to it
  index.html             the rendered reference, served at /docs/

scripts/
  seed.js                the demo account (memory driver)
  check-docs.js          fails if the code and openapi.yaml disagree

.github/workflows/ci.yml tests, PostgreSQL, a smoke run, the documentation check
```

---

## How the layers fit together

A request passes through four layers, and each one has exactly one job:

```
  route          which URL, which method, which schema validates it
    ↓
  controller     read req.validated, call one service, send the result
    ↓
  service        the rules: choosing a question, moving the weights, consent
    ↓
  repository     the only code that reads or writes stored data
```

Two consequences are worth stating, because they are the reason for the
arrangement:

* **The services can be tested without Express.** `chooseThree` and
  `nextWeight` take plain values and return plain values, including their
  source of randomness. That is why `tests/unit/` can assert exactly which
  branch the selection rule takes instead of running it a thousand times and
  checking a proportion.
* **The storage can be swapped without touching anything above it.** The
  memory and the Supabase drivers export the same async functions and return
  the same shapes; no controller, service or route knows which one runs.

### Where the data lives

Chosen by `DB_DRIVER`:

| | `memory` (default) | `supabase` |
| --- | --- | --- |
| data | one JSON file, `DATA_FILE` | PostgreSQL on Supabase, `SUPABASE_DB_URL` |
| accounts | e-mail + scrypt hash in the file | Supabase Auth (`auth.users`) |
| entry text | plain, in the local file | AES-256-GCM ciphertext (`ENTRY_ENCRYPTION_KEY`) |
| audit trail | written by `weights.repo.js` | written by the trigger `record_weight_change()` |
| used by | tests, CI, a quick local run | the pilot |

The JSON collections are named after the database tables and hold the same
columns. In both cases the API issues its own access token; with Supabase,
Auth checks the password first.

---

## The model

### Nine zones

Derived from the four domains of **WHOQOL-BREF** and the five elements of
**PERMA**, adapted as journalling topics (UX specification §1.4).

| id | name | | id | name |
| --- | --- | --- | --- | --- |
| `work` | work & study | | `self` | self & growth |
| `people` | close people | | `interest` | interests |
| `health` | health & body | | `meaning` | meaning |
| `energy` | energy & sleep | | `everyday` | everyday life |
| `emotion` | emotions | | | |

This is an adaptation, **not a validated scale**. A weight says how relevant a
topic is to this person right now, for the purpose of choosing a question. It
is not a measurement of well-being and the interface never presents it as one.

### Three questions a day — `src/services/selection.service.js`

Each day three questions on three different zones:

| slot | how it is chosen | `selection_reason` |
| --- | --- | --- |
| A | one of the three highest zones, more often the higher it is | `top_three` |
| B | another of the top three — or, with `EXPLORATION_RATE` (0.15), one of the quietest zones | `top_three` / `exploration` |
| C | a zone drawn at random from the rest — **the control** | `baseline_random` |

Muted zones are never offered. The three are shuffled into slots 1–3 and look
identical. They are created on the first request of the day and stored, so a
reload or a second device gets the same three. The person answers one or more;
a question is rated only **after** it has been answered.

**Picking is a signal.** Picking a question moves its zone up once by
`CHOICE_BOOST` (0.03, source `choice`) before anything is written, so a new
concern reaches the top three a day or two sooner.

**Which question was the random one is never sent to the browser** — not on
Today, not in History. A participant who could see it would choose and rate
differently. The reason is stored in `prompts_shown.selection_reason` and read
only for the analysis. "Why this question?" tells the truth when it is opened.

### Moving the weights — `src/services/adaptation.service.js`

```
new = 0.3 × score + 0.7 × old
```

An exponential moving average. It is **slow**, so a single unusual day cannot
rewrite the profile and the person sees a profile that is recognisably theirs
from one day to the next. It is **reversible**, so a topic whose mentions grow
weaker falls back without any special decay rule.

Two zones are skipped:

* **a muted zone** — the person said not to ask about it, and moving its weight
  behind their back would make the Profile screen lie to them;
* **a zone the entry says nothing about** — silence is not evidence. This
  matters more than it looks: a person writes about two or three zones a day,
  so if silence pulled a weight down, every zone would be dragged towards zero
  on roughly eight days in nine and the whole profile would collapse within a
  month.

### Finding the topics — `src/services/classification.service.js`

The classifier here is a **lexicon**: it counts words belonging to each zone
and turns the counts into nine scores between 0 and 1. It is not a language
model and it does not understand anything. It exists so that the application is
complete and runs offline, deterministically, in the tests and in CI with no
API key and no network.

`classify()` is the seam. Swapping in a real model means adding a branch there
that returns the same nine scores; nothing else in the project changes, because
nothing else knows how the scores were produced. The accuracy of whichever
classifier is used is measured separately against hand-labelled entries
(KPI3, macro-F1 ≥ 0.70).

**When it runs matters as much as what it is.** The text of an entry is sent
for analysis only after Save is pressed — never while the person is typing
(NFR-7). The registration screen promises this, so the promise is kept in the
code and not only in the copy: the one call site is `entries.service.create`,
after the entry row already exists.

### The study

Every participant receives both kinds of question every day, so each person
is compared against themselves — a **within-subject** design.

* **Main outcome (KPI1): which question is picked first.** Blind picking would
  land on an adaptive question two times in three (66.7 %). Picking them more
  often is evidence that the selection matches what people want to write
  about. Views `kpi_choice` and `kpi_choice_per_participant`.
* **Second outcome (KPI2): ratings.** The share rated relevant among adaptive
  questions against random ones (`kpi_relevance`, `kpi_per_participant`).

Only the first pick of a day counts for KPI1: someone who answers all three
picks everything. `exploration` counts as adaptive — it is produced by the
model. Note for the methodology: the control is drawn from the zones not
already offered that day, a slight bias that keeps the three zones different.
An absent rating means *not rated*, never *disliked*.

---

## The interface

No framework, no build step: HTML, CSS and ES modules served as they are
written. The markup and the styles are those of the approved clickable
prototype, so the application looks like the mockup; the data comes from the
API. Each screen is a module with `view()` (the HTML), `wire()` (the event
handlers) and `load()` (the API calls it needs).

| Screen | File | What it is |
| --- | --- | --- |
| S-01a/b | `screens/auth.js` | Create an account (optional name, two separate consents, neither pre-ticked) and log in. |
| S-02 | `screens/quiz.js` + `eye.js` | The nine statements. Opens as the 3D eye (each answer flies deeper in); "Classic quiz", or no WebGL, gives the plain card. Answers are saved as given; a reload resumes. |
| S-03, S-04 | `screens/today.js` | Three questions → write → saved + rating → "That is today done" → read today's entries. |
| S-05 | `screens/profile.js` | The insight, the nine weights, editing by hand, one zone over 30 days, what you actually write about. |
| S-06 | `screens/history.js` | Filter pills, the month calendar with tooltips, one day in full. |
| S-07 | `screens/settings.js` | What is stored, the name, consent, the export, log out, deletion. |

### Layout

Two columns from tablet width (`.two`: the profile card beside the questions;
`.histgrid`: the calendar beside the day); one column on a phone, where the
navigation moves to its own row under the brand. Flexbox and Grid throughout.
The haze behind the screens is painted once into a canvas — scrolling never
repaints it — and the glass cards use no backdrop blur, so scrolling stays at
the display's frame rate.

### Accessibility

Not an afterthought — several of these decisions shaped the markup:

* the radar chart carries one `aria-label` listing all nine values, because a
  shape conveys nothing to a screen reader, and each label is focusable and
  shows that zone's exact number;
* one visible focus ring everywhere, on an offset so it is never swallowed by
  an element's own border;
* every error message is tied to its input with `aria-describedby`, and the
  message reserves its height so showing it does not move the page;
* the confirmation dialog is a native `<dialog>`, which gives focus trapping
  and Escape for free, and the safe option is focused first so Enter cannot
  confirm a deletion;
* `prefers-reduced-motion` switches off every transition and animation in one
  block, because all of them are defined through the same variables.

---

## Tests

```bash
npm test              # 100 tests (one skipped without PostgreSQL)
npm run test:coverage
```

The built-in Node test runner, with `supertest` for HTTP. No test framework to
install and nothing to configure.

**`tests/unit/`** — the algorithms, with no HTTP and no database.
`selection.test.js` hands the rule a scripted sequence of "random" numbers and
asserts what it must produce, then checks on 2,000 draws that every day has
three different zones, exactly one control, no muted zone, and that the
control is not stuck in one slot. `adaptation.test.js` checks the properties
the thesis claims about the model: that it moves towards the evidence, slowly,
within bounds, and that an unmentioned topic fades. `classification.test.js`
checks the contract the rest of the application relies on — nine scores,
always, each between 0 and 1.

**`tests/postgres/`** — the Supabase driver against a real PostgreSQL with the
real migrations: every query, trigger and constraint, and the encryption of
entry text. Runs in CI; locally with `TEST_DATABASE_URL` set.

**`tests/integration/`** — the real application, over HTTP, through
`createApp()`: the same middleware, routes, validation and error handling the
server uses. Each file gets its own data file, so the suites cannot collide.

Some of what they pin down:

* a wrong password and an unknown e-mail give the same answer, so the login
  form cannot be used to find out who has an account;
* three questions a day, the same three after a reload, one random control;
* picking moves the zone up 0.03 once; a rating before answering is refused;
* `selectionReason` never appears in any response the browser receives;
* an entry survives the classifier failing, and the profile does not move;
* an entry is saved but not analysed once consent is withdrawn;
* a muted zone's weight does not move when an entry is classified;
* fewer than three active zones is refused, and the refused edit changes
  nothing at all;
* a known entry id is not enough for another account to read it;
* deleting an account leaves no row behind in any collection — the test looks
  directly in the store for leftovers.

---

## Continuous integration

`.github/workflows/ci.yml`, on every push and pull request to `main`:

1. **Tests** on Node 20 and 22. `npm ci`, `node --check` on every source file,
   `npm audit` as advisory, then the suite.
2. **Smoke** — starts the real server and takes an account from registration
   through the quiz to a saved entry with `curl`. A suite can pass while the
   process itself fails to start; this catches that.
3. **PostgreSQL** — a `postgres:16` service: applies the auth stub, every
   migration and the test data, runs `supabase/seed/checks.sql` (fails on any
   FAIL), then runs `tests/postgres/` against it.
4. **Docs** — parses `docs/openapi.yaml`, then runs `scripts/check-docs.js`,
   which compares every route in `src/routes` with every path in the
   description and fails if they have drifted apart. Documentation goes stale
   because nothing notices when it does; this notices on the same pull request.

---

## Configuration

Everything is read in `src/config/index.js` and nowhere else, so the whole
configuration surface is one short file. See `.env.example`.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | 3000 | |
| `NODE_ENV` | development | `production` requires a real `JWT_SECRET` |
| `CORS_ORIGINS` | localhost:3000 | only needed when the interface is hosted apart from the API |
| `JWT_SECRET` | a development value | **must be set in production** |
| `JWT_EXPIRES_IN` | 7d | |
| `DB_DRIVER` | memory | `supabase` for PostgreSQL + Supabase Auth |
| `DATA_FILE` | ./data/db.json | memory driver only |
| `SUPABASE_URL` | | Supabase driver: Project URL |
| `SUPABASE_SECRET_KEY` | | Supabase driver: secret key (`sb_secret_…`), server only |
| `SUPABASE_DB_URL` | | Supabase driver: Postgres connection string |
| `ENTRY_ENCRYPTION_KEY` | | Supabase driver: 64 hex characters (AES-256) |
| `EXPLORATION_RATE` | 0.15 | how often slot B explores a quiet zone |
| `CHOICE_BOOST` | 0.03 | how much picking a question moves its zone |
| `ADAPTATION_ALPHA` | 0.3 | the learning rate of the weight update |
| `CLASSIFIER` | keyword | `failing` exercises the degraded path |

`checkConfig()` refuses to start in production with the development secret,
with a rate outside 0…1, or with `DB_DRIVER=supabase` and any of its four
variables missing.

---

## Security and privacy

* With Supabase, passwords never reach this application's tables: Supabase
  Auth stores and checks them. The memory driver hashes them with **scrypt**
  from the Node standard library (slow and memory-hard by design).
* With Supabase, entry text is encrypted with **AES-256-GCM** before it leaves
  the server (`src/utils/crypto.js`); the database holds ciphertext only and
  the key is not in it.
* The service role key and the database URL live only in the server's `.env`.
  The browser never talks to Supabase directly.
* Row level security is on for every personal table, and the KPI views are
  revoked from `anon` and `authenticated` — on Supabase a view would otherwise
  bypass RLS and be readable over the REST API.
* The account is taken from the signed token and **never** from the URL or the
  body. There is no endpoint that accepts a user id, which is the
  application-side counterpart of the row level security policies in the
  database.
* "Not found" and "not yours" give the same `404`, so a known id is not enough
  to learn that something exists.
* An unexpected error is logged with its stack on the server and answered with
  a flat 500 — an unexpected message may contain a file path, a query, or a
  value from someone's entry.
* The request log records no bodies. Bodies here contain diary entries.
* Everything the browser renders from a person's own text goes through `esc()`
  in `public/js/core.js` first.
* The draft of an unsaved entry is kept in that browser only, and the text
  reaches the server when Save is pressed — not before.

---

## What this is not

Said plainly, because the thesis depends on the distinction:

* the classifier is a word list, not a language model; its accuracy is measured
  separately and is not claimed here;
* the nine zones are an adaptation of two published instruments, not a
  validated scale, and a weight is not a measurement of well-being;
* `npm run seed` produces sample data, not results;
* the JSON store is a working stand-in for the PostgreSQL schema that was
  submitted separately — it holds the same columns and obeys the same
  constraints, but it is not that database.

---

## Licence

MIT. Author: Anastasiya Kupreichyk, European Humanities University.
