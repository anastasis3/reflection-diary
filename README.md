# Reflection Diary

**Development and Experimental Evaluation of an Adaptive Self-Reflection Diary
with AI-Based Personalization**

A diary that asks one question a day. Which question it asks depends on what
the person has been writing about: every entry is analysed for nine topic
zones, and nine weights move slowly towards what the entries are actually
about. About one question in three is drawn at random instead, so that the
project can measure whether the chosen questions suit people better than
chance does.

This repository holds the whole working system: the HTTP API, the interface,
the automated tests, the API documentation and the continuous integration that
runs them.

---

## Running it

Node 20.11 or newer. No database server and no API key are needed.

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
npm run seed      # a demo account with a month of history
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
  middleware/            authentication, validation, errors, logging
  validators/            every shape the API accepts, as Zod schemas
  data/                  the zone catalogue, the question bank, the store
  utils/                 errors, password hashing, dates
  app.js                 assembles Express
  server.js              starts it

public/                  the interface: HTML, CSS and JavaScript, no framework
  css/                   tokens, base, components, screens
  js/
    screens/             one file per screen of the UX specification
    components/          radar chart, week strip, calendar, trend, toasts
    api.js               the only place the browser talks to the server
    router.js            the hash router and the navigation rules

tests/
  unit/                  the algorithms, with no HTTP and no database
  integration/           the real application, driven over HTTP

docs/
  openapi.yaml           the API, described once
  api.md                 the same thing, readable without tooling
  index.html             the rendered reference, served at /docs/

scripts/
  seed.js                the demo account
  check-docs.js          fails if the code and openapi.yaml disagree

.github/workflows/ci.yml tests, a smoke run, and the documentation check
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

* **The services can be tested without Express.** `chooseZone` and
  `nextWeight` take plain values and return plain values, including their
  source of randomness. That is why `tests/unit/` can assert exactly which
  branch the selection rule takes instead of running it a thousand times and
  checking a proportion.
* **Moving to Supabase means rewriting `src/repositories` and nothing else.**
  No controller, service, route or test knows how the data is stored.

### Where the data lives

In one JSON file, named by `DATA_FILE`. The collections are named after the
tables of the PostgreSQL schema submitted for the database criterion and hold
the same columns, so the two descriptions of the data agree with each other.

A file rather than PostgreSQL, because the application has to start, run and be
tested from a clean clone with `npm install && npm start`, with no database
server and no credentials. Where the PostgreSQL schema uses a trigger to keep
the audit trail, `src/repositories/weights.repo.js` is the single place a
weight may change and it writes all three collections; the comment there says
which trigger it stands in for.

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

### Choosing the question — `src/services/selection.service.js`

1. With probability `RANDOM_QUESTION_SHARE` (0.33) the question is drawn
   uniformly from the whole bank — `baseline_random`, the **control
   condition**.
2. Otherwise, with probability `EXPLORATION_RATE` (0.15), the quietest
   non-muted zone — `exploration`. Without it the profile would narrow onto
   the same three topics for ever and could never discover that something else
   has become important.
3. Otherwise one of the three highest-weighted zones — `top_three`.

A muted zone is never chosen, and yesterday's zone is excluded so the same
topic is not asked two days running. One question per calendar day: asking
again the same day returns the same question, so a reload cannot hand out a
second one and quietly spoil the measurement.

**Which kind a question was is never sent to the browser.** A participant who
could see that today's question was drawn at random would rate it differently,
and the comparison the whole study rests on would be worthless. The reason is
stored in `prompts_shown.selection_reason` and read only for the analysis.

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

Every participant receives both kinds of question, so each person is compared
against themselves — a **within-subject** design. The main outcome is the share
of questions rated relevant among the adaptive ones against the random ones,
per participant.

`exploration` counts as adaptive and is deliberately a separate value rather
than being folded into the random case: it is produced by the model, not by
chance. An absent rating means *not rated*, never *disliked*.

---

## The interface

No framework, no build step: HTML, CSS and ES modules served as they are
written. The screens follow the approved UX specification.

| Screen | File | What it is |
| --- | --- | --- |
| S-01a | `screens/register.js` | Create an account. Two separate consents, neither pre-ticked; the button stays disabled until both are given, and the hint says which one is missing. |
| S-01b | `screens/login.js` | Log in. One message for a wrong e-mail and a wrong password. |
| S-02 | `screens/quiz.js` | The nine statements. Each answer is saved as it is given, so the screen resumes where it stopped. 1–5 on the keyboard. |
| S-03, S-04 | `screens/today.js` | The question, the box, and the three states after saving: saved, analysing, and saved-but-not-analysed. |
| S-05 | `screens/profile.js` | The nine weights, how far each has moved since the quiz, the trend chart, and editing by hand. |
| S-06 | `screens/history.js` | Filter pills, the month calendar, and one day in full. |
| S-07 | `screens/settings.js` | What is stored, withdrawing consent, the export, and deletion. |

Shared pieces live in `js/components/`: the radar chart, the week strip, the
month calendar, the trend chart, toasts and the confirmation dialog.

### Adaptive layout

Mobile first. Everything in `css/base.css` describes a phone; the media queries
add what a larger screen allows and never take anything away.

| Width | What changes |
| --- | --- |
| base | one column, 16px gutters, navigation at the bottom within thumb reach |
| ≥ 600px | wider gutters, larger headings, the week summary moves beside the strip |
| ≥ 860px | History puts the calendar and the chosen day side by side |
| ≥ 960px | navigation moves into the header; Today puts the chart beside the question |

Layout is Flexbox and Grid; there is no absolute positioning holding the page
together. `css/tokens.css` holds every colour, size and duration as a custom
property, so the palette is one file and nothing below it invents a value.

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
npm test              # 91 tests
npm run test:coverage
```

The built-in Node test runner, with `supertest` for HTTP. No test framework to
install and nothing to configure.

**`tests/unit/`** — the algorithms, with no HTTP and no database.
`selection.test.js` hands the rule a scripted sequence of "random" numbers and
asserts which branch it must take. `adaptation.test.js` checks the properties
the thesis claims about the model: that it moves towards the evidence, slowly,
within bounds, and that an unmentioned topic fades. `classification.test.js`
checks the contract the rest of the application relies on — nine scores,
always, each between 0 and 1.

**`tests/integration/`** — the real application, over HTTP, through
`createApp()`: the same middleware, routes, validation and error handling the
server uses. Each file gets its own data file, so the suites cannot collide.

Some of what they pin down:

* a wrong password and an unknown e-mail give the same answer, so the login
  form cannot be used to find out who has an account;
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
3. **Docs** — parses `docs/openapi.yaml`, then runs `scripts/check-docs.js`,
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
| `DATA_FILE` | ./data/db.json | |
| `RANDOM_QUESTION_SHARE` | 0.33 | the share of control questions |
| `EXPLORATION_RATE` | 0.15 | how often a quiet zone is explored |
| `ADAPTATION_ALPHA` | 0.3 | the learning rate of the weight update |
| `CLASSIFIER` | keyword | `failing` exercises the degraded path |

`checkConfig()` refuses to start in production with the development secret, or
with any of the three rates outside 0…1.

---

## Security and privacy

* Passwords are hashed with **scrypt** from the Node standard library,
  deliberately slow and memory-hard. The cost parameter is stored with the
  hash, so it can be raised later without invalidating old hashes.
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
  in `public/js/dom.js` first.
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
