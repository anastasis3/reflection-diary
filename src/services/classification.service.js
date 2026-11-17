/**
 * Finding the topics in an entry.
 *
 * Two things are worth being plain about.
 *
 * 1. WHEN it runs. The text of an entry is sent for analysis only after the
 *    participant presses Save — never while they type (NFR-7). The interface
 *    promises this on the registration screen, so the promise has to be kept
 *    in the code and not only in the copy. The one call site is
 *    entries.service.create, after the entry row already exists.
 *
 * 2. WHAT it is. The classifier below is a lexicon: it counts words belonging
 *    to each zone and turns the counts into nine scores between 0 and 1. It is
 *    not a language model and it does not understand anything. It exists so
 *    that the application is complete and runs offline, deterministically, in
 *    the tests and in CI with no API key and no network.
 *
 *    `classify()` is the seam. Swapping in a real model means adding a branch
 *    here that calls it and returns the same nine scores; nothing else in the
 *    project changes, because nothing else knows how the scores were produced.
 *    The accuracy of whichever classifier is used is measured separately
 *    against the hand-labelled entries (KPI3, macro-F1 >= 0.70).
 */
import config from '../config/index.js';
import { ZONE_IDS } from '../data/zones.js';

/**
 * Word stems belonging to each zone. Matching is on stems, so "meeting",
 * "meetings" and "met" all count towards `work`.
 */
const LEXICON = {
  work: ['work', 'job', 'studi', 'stud', 'exam', 'deadlin', 'meeting', 'project', 'task',
    'office', 'boss', 'colleag', 'client', 'report', 'shift', 'thesis', 'lectur', 'class',
    'assign', 'email', 'presentat', 'interview', 'career'],
  people: ['friend', 'family', 'mother', 'mum', 'mom', 'father', 'dad', 'sister', 'brother',
    'partner', 'wife', 'husband', 'talk', 'call', 'said', 'told', 'together', 'alone',
    'lonely', 'conversat', 'relationship', 'visit', 'someone', 'people', 'she', 'he'],
  health: ['body', 'pain', 'hurt', 'ache', 'ill', 'sick', 'doctor', 'health', 'back',
    'headach', 'stomach', 'muscle', 'walk', 'run', 'gym', 'train', 'exercis', 'stretch',
    'eat', 'ate', 'food', 'meal', 'water'],
  energy: ['tired', 'exhaust', 'sleep', 'slept', 'nap', 'awake', 'energ', 'rest', 'rested',
    'wake', 'woke', 'morning', 'night', 'bed', 'drain', 'fresh', 'coffee', 'yawn',
    'burnout', 'burn out'],
  emotion: ['feel', 'felt', 'angr', 'sad', 'happ', 'anx', 'nervous', 'worri', 'afraid',
    'fear', 'guilt', 'asham', 'proud', 'calm', 'upset', 'cry', 'cried', 'frustrat',
    'relief', 'relieved', 'joy', 'stress', 'overwhelm', 'mood'],
  self: ['myself', 'i am', 'i was', 'becom', 'grow', 'learn', 'chang', 'better', 'worse',
    'habit', 'discipl', 'mistake', 'improve', 'pattern', 'realis', 'realiz', 'notic',
    'understood', 'identity', 'who i'],
  interest: ['read', 'book', 'film', 'movie', 'music', 'game', 'play', 'draw', 'paint',
    'write', 'curious', 'interest', 'hobby', 'cook', 'photo', 'garden', 'podcast',
    'course', 'languag', 'guitar'],
  meaning: ['matter', 'meaning', 'purpos', 'value', 'worth', 'point of', 'why i',
    'important', 'believ', 'care about', 'long run', 'future', 'direction', 'enough'],
  everyday: ['home', 'house', 'flat', 'room', 'clean', 'tidy', 'laundry', 'dishes',
    'money', 'bill', 'rent', 'shop', 'groceri', 'bank', 'budget', 'routine', 'plan',
    'errand', 'repair', 'commut', 'bus', 'train ticket'],
};

/** The empty result: every zone present, every score zero. */
function emptyScores() {
  return Object.fromEntries(ZONE_IDS.map((id) => [id, 0]));
}

/**
 * One regular expression per zone, built once when the module loads.
 *
 * `\b` before the stem makes it match the *start of a word* and not any
 * substring. Without it "the" would count as "he" for `people` and "great" as
 * "eat" for `health`, which made the classifier pick up signal from ordinary
 * connecting words. Matching on a word start still catches inflections:
 * "work" matches "working" and "worked".
 */
const PATTERNS = Object.fromEntries(
  Object.entries(LEXICON).map(([zoneId, stems]) => {
    const escaped = stems.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return [zoneId, new RegExp(`\\b(?:${escaped.join('|')})`, 'gi')];
  }),
);

/**
 * The offline lexicon classifier.
 *
 * Scores are relative within the entry: the strongest zone gets 1.0 and the
 * rest are scaled against it. That matters because the weight update compares
 * a score against a weight on the same 0..1 scale, and a long entry should not
 * push every weight up merely by being long.
 */
export function classifyWithLexicon(text) {
  const haystack = String(text).toLowerCase();
  const scores = emptyScores();

  for (const [zoneId, pattern] of Object.entries(PATTERNS)) {
    pattern.lastIndex = 0; // the regexes are shared, so reset before each use
    scores[zoneId] = haystack.match(pattern)?.length ?? 0;
  }

  const highest = Math.max(...Object.values(scores));
  if (highest === 0) {
    // Nothing recognised. Every score stays zero, which the adaptation reads
    // as "this entry says nothing about any zone" and leaves the profile
    // alone. Inventing a small value here would be the classifier making
    // something up, and the profile would drift on entries it did not
    // understand.
    return scores;
  }

  for (const zoneId of ZONE_IDS) {
    scores[zoneId] = Math.round((scores[zoneId] / highest) * 1000) / 1000;
  }
  return scores;
}

/**
 * The seam. Returns nine scores, or throws so that the caller can record a
 * failed classification and keep the entry.
 *
 * @param {string} text
 * @returns {Promise<Record<string, number>>}
 */
export async function classify(text, { strategy = config.classifier } = {}) {
  switch (strategy) {
    case 'failing':
      // Used by the tests and by a manual run-through of the degraded path.
      throw new Error('The analysis service did not respond.');
    case 'keyword':
    default:
      return classifyWithLexicon(text);
  }
}

export default { classify, classifyWithLexicon };
