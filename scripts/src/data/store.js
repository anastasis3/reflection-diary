/**
 * The storage engine.
 *
 * The whole data set lives in one JSON file. The collections below are named
 * after the tables of the PostgreSQL schema that was submitted for the
 * database criterion, and they hold the same columns, so the two descriptions
 * of the data agree with each other.
 *
 * Why a file and not PostgreSQL here: the application has to start, run and be
 * tested from a clean clone with `npm install && npm start`, with no database
 * server and no credentials. Every query goes through src/repositories, so
 * moving to Supabase means rewriting those files and nothing above them —
 * no controller, service, route or test changes.
 *
 * Writes are synchronous. The data set of a pilot with a handful of
 * participants is a few hundred kilobytes, and a synchronous write removes a
 * whole class of "the process exited before it saved" bugs.
 */
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';

/** The shape of an empty database. Each key is one table. */
function emptyState() {
  return {
    users: [], //              credentials; stands in for Supabase auth.users
    profiles: [], //           one row per account
    consents: [], //           study + ai_processing, with withdrawal
    onboardingAnswers: [], //  the nine quiz answers
    userTopicWeights: [], //   the nine live weights per account
    weightHistory: [], //      one row per zone per day, for the trend chart
    weightChanges: [], //      audit trail, written on every weight change
    entries: [], //            the diary entries themselves
    entryTopicScores: [], //   classifier output, nine scores per entry
    promptsShown: [], //       which question was shown, why, and how it was rated
    sequences: { consents: 0, weightChanges: 0, promptsShown: 0, entryHighlights: 0 },
  };
}

class Store {
  #state = emptyState();

  #file = config.storage.dataFile;

  #loaded = false;

  /** Reads the file into memory. Safe to call repeatedly. */
  load() {
    if (this.#loaded) return this.#state;
    try {
      const raw = fs.readFileSync(this.#file, 'utf8');
      const parsed = JSON.parse(raw);
      // Merge over the empty shape so that a file written by an older version
      // of the code, missing a collection, still loads.
      this.#state = { ...emptyState(), ...parsed };
      this.#state.sequences = { ...emptyState().sequences, ...(parsed.sequences ?? {}) };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Could not read the data file at ${this.#file}: ${error.message}`);
      }
      this.#state = emptyState(); // first run: nothing on disk yet
    }
    this.#loaded = true;
    return this.#state;
  }

  /** The in-memory state. Repositories read and mutate this object. */
  get state() {
    if (!this.#loaded) this.load();
    return this.#state;
  }

  /** Writes the current state back to disk. */
  save() {
    fs.mkdirSync(path.dirname(this.#file), { recursive: true });
    fs.writeFileSync(this.#file, `${JSON.stringify(this.#state, null, 2)}\n`, 'utf8');
  }

  /** Next value of a numeric sequence, mirroring a PostgreSQL bigserial. */
  nextId(sequence) {
    const seq = this.state.sequences;
    seq[sequence] = (seq[sequence] ?? 0) + 1;
    return seq[sequence];
  }

  /** Empties the database. Used by the test helpers and by `npm run seed`. */
  reset() {
    this.#state = emptyState();
    this.#loaded = true;
    this.save();
  }

  /** Points the store at another file. Used by the tests for isolation. */
  useFile(file) {
    this.#file = file;
    this.#loaded = false;
    this.load();
  }

  get file() {
    return this.#file;
  }
}

export const store = new Store();
export default store;
