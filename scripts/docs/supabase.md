# Running the diary on Supabase

The application has two storage drivers. `memory` (the default) keeps
everything in a JSON file and needs nothing. `supabase` keeps the data in
PostgreSQL on Supabase and the accounts in Supabase Auth — the setup the
thesis describes and the pilot uses. This page sets up the second one.

Time needed: about 15 minutes. Cost: the Free plan is enough for the pilot.

---

## 1. Create the project

1. Sign in at <https://supabase.com/dashboard> (GitHub sign-in works).
2. **New project**. Choose:
   * **Name** — `reflection-diary`
   * **Database password** — press *Generate*, then **copy it somewhere safe**.
     It is needed in step 4 and is not shown again.
   * **Region** — the closest one, e.g. *Central EU (Frankfurt)*.
3. **Create new project** and wait 1–2 minutes until it is ready.

## 2. Copy three values

| What | Where in the dashboard | Goes into `.env` as |
| --- | --- | --- |
| Project URL | **Connect** (top bar) → *App Frameworks*, or **Settings → API Keys** | `SUPABASE_URL` |
| Secret key (`sb_secret_…`) | **Settings → API Keys → Secret keys** → reveal, copy | `SUPABASE_SECRET_KEY` |
| Connection string | **Connect** → **Session pooler** → URI | `SUPABASE_DB_URL` |

* The secret key bypasses row level security. It belongs on the server only —
  never in the browser, never in Git. (`.env` is already in `.gitignore`.)
  If the project only shows the legacy keys, the `service_role` key works
  in the same place.
* Use the **Session pooler** string, not *Direct connection*: the direct one
  is IPv6-only on the Free plan and fails from most home networks. It looks
  like `postgresql://postgres.abcd…:[YOUR-PASSWORD]@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`.
  Replace `[YOUR-PASSWORD]` with the password from step 1 (if it contains
  `@`, `#`, `/` or `%`, percent-encode them).

## 3. Generate the encryption key

Entry text is encrypted (AES-256-GCM) before it is written to the database.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the 64 characters into `ENTRY_ENCRYPTION_KEY`. **Keep a copy outside the
project**: losing the key makes every stored entry unreadable, and changing it
later makes the old entries unreadable too.

## 4. Fill in `.env`

```bash
cp .env.example .env
```

```ini
DB_DRIVER=supabase
SUPABASE_URL=https://abcd….supabase.co
SUPABASE_SECRET_KEY=sb_secret_…
SUPABASE_DB_URL=postgresql://postgres.abcd…:PASSWORD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
ENTRY_ENCRYPTION_KEY=…64 hex characters…
JWT_SECRET=…another long random string…
```

`JWT_SECRET` signs the API's own access tokens:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## 5. Create the tables

```bash
npm install
npm run db:migrate
```

This applies every file in `supabase/migrations/` in order and prints
`Catalogue: 9 zones, 18 questions` at the end. Running it again applies only
new files.

**Without Node** — the same by hand: **SQL Editor → New query**, paste the
contents of each file in `supabase/migrations/` **in file-name order**, press
**Run** after each one.

What the migrations create:

| File | What |
| --- | --- |
| `…090000_catalog` | `zones`, `prompts` — and fills them: 9 zones, 18 questions |
| `…090100_core` | `profiles`, `consents`, `onboarding_answers`, `entries`, `entry_topic_scores` |
| `…090200_adaptation` | `user_topic_weights`, `weight_history`, `weight_changes`, `prompts_shown` |
| `…090300_research` | `entry_highlights`, `entry_gold_labels`, `erasure_log` |
| `…090400_indexes_triggers_views` | indexes, the audit trigger, the KPI views |
| `…090500_rls` | row level security, grants, the `researcher` role |
| `…090600_comments` | documentation of every table and column |
| `…20261118090000_three_questions` | three questions a day, the pick, the name, the choice KPI |

**Do not run** on Supabase:

* `supabase/local/00_auth_stub.sql` — a stand-in for Supabase Auth on a plain
  PostgreSQL; Supabase already has the real one.
* `supabase/seed/test_data.sql` — invented participants for testing the
  schema. The pilot database must contain real participants only.

The other tables fill themselves as people use the diary: registration creates
the account in **Authentication → Users** and a row in `profiles` and
`consents`; the quiz fills `onboarding_answers` and `user_topic_weights`; every
day adds three rows to `prompts_shown`; every entry adds to `entries` and
`entry_topic_scores`; the trigger fills `weight_changes` and `weight_history`.

## 6. Start and check

```bash
npm start
```

The start-up log should say
`storage  Supabase (PostgreSQL + Auth), 18 questions loaded`.

Open <http://localhost:3000>, register, take the quiz, answer a question. Then
in the dashboard:

* **Authentication → Users** — the new account.
* **Table Editor → profiles / prompts_shown / entries** — the rows.
  `entries.text_encrypted` starts with `v1:` and is unreadable: that is the
  encryption working.

## 7. Optional settings

* **Authentication → Sign In / Providers → Email → Allow new users to sign
  up**: can be switched **off**. The API creates users with the secret key,
  which works regardless, and nobody can then sign up around the API.
* Accounts are created already confirmed (no confirmation e-mail). To require
  confirmation, turn on *Confirm email* there and remove `email_confirm: true`
  in `src/repositories/postgres/accounts.repo.js`.

## 8. For the analysis

The `researcher` role sees masked views only — no entry text, no account id:
`research_entries`, `research_choices`, `kpi_choice`, `kpi_relevance`,
`kpi_engagement`. In the SQL Editor:

```sql
select * from kpi_choice;                 -- KPI1: share of first picks that were adaptive vs 66.7 %
select * from kpi_choice_per_participant; -- the same per person (sign test)
select * from kpi_relevance;              -- KPI2: liked, adaptive vs random
```

---

### If something goes wrong

| Message | Cause |
| --- | --- |
| `SUPABASE_DB_URL is required …` at start | `.env` not filled in, or `DB_DRIVER=supabase` set by mistake |
| `Could not connect: … ENOTFOUND` / `ENETUNREACH` | the *Direct connection* string was copied — use **Session pooler** |
| `password authentication failed` | `[YOUR-PASSWORD]` not replaced, or a special character not encoded. Reset it in **Settings → Database** |
| `The prompts table is empty` | step 5 was not run |
| Registration answers 500, log says `Supabase Auth could not create the user` | wrong or publishable key in `SUPABASE_SECRET_KEY` |
| `Unsupported state or unable to authenticate data` when reading entries | `ENTRY_ENCRYPTION_KEY` changed since those entries were written |
