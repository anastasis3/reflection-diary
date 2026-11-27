/**
 * The researcher console: the pilot's numbers, for the researcher only.
 *
 * What it reads: who took part (pseudonym, name, e-mail), which questions
 * were shown, picked, answered and rated, and when entries were saved.
 * What it never reads: the text of an entry. The CSV keeps pseudonyms only.
 *
 *   KPI1 choice     share of first picks of the day that were adaptive,
 *                   against the share expected by blind picking (2 of 3)
 *   KPI2 relevance  share rated "relevant": adaptive vs random questions
 */
import config from '../config/index.js';

/** Raw rows from whichever driver is in use, in one shape. */
async function loadRows() {
  if (config.storage.driver === 'supabase') {
    const { query } = await import('../data/db.js');
    const [profiles, shown, entries] = await Promise.all([
      query(`select p.id, p.created_at as "createdAt", p.onboarding_completed_at as "onboardingCompletedAt",
                    p.display_name as "displayName", u.email
             from profiles p left join auth.users u on u.id = p.id
             order by p.created_at`),
      query(`select user_id as "userId", zone_id as "zoneId", selection_reason as "selectionReason",
                    shown_on as "shownOn", slot, was_chosen as "wasChosen", chosen_at as "chosenAt",
                    was_answered as "wasAnswered", relevance_rating as "relevanceRating",
                    rated_at as "ratedAt", explanation_opened as "explanationOpened",
                    text_source as "textSource"
             from prompts_shown`),
      query(`select user_id as "userId", created_at as "createdAt", status from entries`),
    ]);
    return { profiles, shown, entries };
  }
  const { default: store } = await import('../data/store.js');
  const s = store.state;
  return {
    profiles: [...s.profiles]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((p) => ({ ...p, email: s.users.find((u) => u.id === p.id)?.email ?? null })),
    shown: s.promptsShown,
    entries: s.entries.map(({ userId, createdAt, status }) => ({ userId, createdAt, status })),
  };
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const isAdaptive = (r) => r.selectionReason !== 'baseline_random';

/** The first question picked each day, per participant. */
function firstPicks(shown) {
  const best = new Map();
  for (const r of shown) {
    if (!r.wasChosen) continue;
    const key = `${r.userId}|${r.shownOn}`;
    const cur = best.get(key);
    if (!cur || r.chosenAt < cur.chosenAt) best.set(key, r);
  }
  return [...best.values()];
}

function relevance(rows) {
  const rated = rows.filter((r) => r.relevanceRating !== null && r.relevanceRating !== undefined);
  return { rated: rated.length, liked: rated.filter((r) => r.relevanceRating).length,
    percent: pct(rated.filter((r) => r.relevanceRating).length, rated.length) };
}

export async function summary() {
  const { profiles, shown, entries } = await loadRows();
  const alias = new Map(profiles.map((p, i) => [p.id, `P-${String(i + 1).padStart(3, '0')}`]));
  // who is behind each pseudonym — shown in the console only, never in the CSV
  const who = new Map(profiles.map((p) => [p.id, p.displayName || p.email || alias.get(p.id)]));

  // KPI1 — what gets picked first
  const picks = firstPicks(shown);
  const picked = picks.filter(isAdaptive).length;
  const expected = pct(shown.filter(isAdaptive).length, shown.length) ?? 66.7;
  const kpi1 = {
    firstPicks: picks.length,
    adaptive: picked,
    percentAdaptive: pct(picked, picks.length),
    percentExpected: expected,
    deltaPoints: picks.length ? Math.round((pct(picked, picks.length) - expected) * 10) / 10 : null,
  };

  // KPI2 — what gets liked
  const a = relevance(shown.filter(isAdaptive));
  const r = relevance(shown.filter((x) => !isAdaptive(x)));
  const kpi2 = {
    adaptive: a, random: r,
    deltaPoints: a.percent !== null && r.percent !== null ? Math.round((a.percent - r.percent) * 10) / 10 : null,
  };

  // one row per participant
  const participants = profiles.map((p) => {
    const mine = shown.filter((x) => x.userId === p.id);
    const myEntries = entries.filter((e) => e.userId === p.id);
    const myPicks = picks.filter((x) => x.userId === p.id);
    const last = myEntries.map((e) => e.createdAt).sort().at(-1) ?? null;
    return {
      pseudonym: alias.get(p.id),
      name: p.displayName ?? null,
      email: p.email ?? null,
      onboarded: Boolean(p.onboardingCompletedAt),
      daysShown: new Set(mine.map((x) => x.shownOn)).size,
      daysWritten: new Set(myEntries.map((e) => e.createdAt.slice(0, 10))).size,
      answered: mine.filter((x) => x.wasAnswered).length,
      // likes and dislikes, split by the kind of question
      likedAdaptive: mine.filter((x) => isAdaptive(x) && x.relevanceRating === true).length,
      dislikedAdaptive: mine.filter((x) => isAdaptive(x) && x.relevanceRating === false).length,
      likedRandom: mine.filter((x) => !isAdaptive(x) && x.relevanceRating === true).length,
      dislikedRandom: mine.filter((x) => !isAdaptive(x) && x.relevanceRating === false).length,
      firstPickAdaptive: pct(myPicks.filter(isAdaptive).length, myPicks.length),
      lastEntry: last,
    };
  });

  // the latest events, newest first — no text, just what happened
  const feed = [
    ...shown.filter((x) => x.wasChosen).map((x) => ({ at: x.chosenAt, who: who.get(x.userId), what: 'picked', zone: x.zoneId, kind: isAdaptive(x) ? 'adaptive' : 'random' })),
    ...shown.filter((x) => x.ratedAt).map((x) => ({ at: x.ratedAt, who: who.get(x.userId), what: x.relevanceRating ? 'rated relevant' : 'rated not relevant', zone: x.zoneId, kind: isAdaptive(x) ? 'adaptive' : 'random' })),
    ...entries.map((e) => ({ at: e.createdAt, who: who.get(e.userId), what: e.status === 'classification_failed' ? 'saved an entry (analysis pending)' : 'saved an entry', zone: null, kind: null })),
  ].filter((e) => e.at && e.who).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 12);

  const firstDay = profiles[0]?.createdAt?.slice(0, 10) ?? null;
  return {
    generatedAt: new Date().toISOString(),
    pilotDay: firstDay ? Math.floor((Date.now() - Date.parse(`${firstDay}T00:00:00Z`)) / 86_400_000) + 1 : 0,
    participants: participants.length,
    entries: entries.length,
    failedAnalyses: entries.filter((e) => e.status === 'classification_failed').length,
    classifier: config.classifier,
    kpi1, kpi2,
    table: participants,
    feed,
  };
}

/** CSV: one row per question shown. No text, no e-mail, no account id. */
export async function exportCsv() {
  const { profiles, shown } = await loadRows();
  const alias = new Map(profiles.map((p, i) => [p.id, `P-${String(i + 1).padStart(3, '0')}`]));
  const first = new Set(firstPicks(shown));
  const head = 'participant,day,slot,zone,reason,text_source,chosen,first_pick,answered,rating,explanation_opened';
  const lines = shown
    .slice()
    .sort((x, y) => alias.get(x.userId).localeCompare(alias.get(y.userId)) || x.shownOn.localeCompare(y.shownOn) || x.slot - y.slot)
    .map((x) => [alias.get(x.userId), x.shownOn, x.slot, x.zoneId, x.selectionReason, x.textSource ?? 'bank', x.wasChosen,
      first.has(x), x.wasAnswered, x.relevanceRating ?? '', x.explanationOpened].join(','));
  return [head, ...lines].join('\n') + '\n';
}

export default { summary, exportCsv };