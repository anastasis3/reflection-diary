/**
 * The researcher console: the pilot's numbers, for the researcher only.
 * Reads pseudonyms, shown / picked / answered / rated questions and entry
 * dates. Never reads the text of an entry, an e-mail address or a name.
 *   KPI1 choice     share of first picks that were adaptive vs blind picking (2 of 3)
 *   KPI2 relevance  share rated "relevant": adaptive vs random questions
 */
import config from '../config/index.js';

async function loadRows() {
  if (config.storage.driver === 'supabase') {
    const { query } = await import('../data/db.js');
    const [profiles, shown, entries] = await Promise.all([
      query(`select id, created_at as "createdAt", onboarding_completed_at as "onboardingCompletedAt"
             from profiles order by created_at`),
      query(`select user_id as "userId", zone_id as "zoneId", selection_reason as "selectionReason",
                    shown_on as "shownOn", slot, was_chosen as "wasChosen", chosen_at as "chosenAt",
                    was_answered as "wasAnswered", relevance_rating as "relevanceRating",
                    rated_at as "ratedAt", explanation_opened as "explanationOpened", text_source as "textSource"
             from prompts_shown`),
      query(`select user_id as "userId", created_at as "createdAt", status from entries`),
    ]);
    return { profiles, shown, entries };
  }
  const { default: store } = await import('../data/store.js');
  const s = store.state;
  return {
    profiles: [...s.profiles].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    shown: s.promptsShown,
    entries: s.entries.map(({ userId, createdAt, status }) => ({ userId, createdAt, status })),
  };
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const isAdaptive = (r) => r.selectionReason !== 'baseline_random';

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
  const liked = rated.filter((r) => r.relevanceRating).length;
  return { rated: rated.length, liked, percent: pct(liked, rated.length) };
}

export async function summary() {
  const { profiles, shown, entries } = await loadRows();
  const alias = new Map(profiles.map((p, i) => [p.id, `P-${String(i + 1).padStart(3, '0')}`]));

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

  const a = relevance(shown.filter(isAdaptive));
  const r = relevance(shown.filter((x) => !isAdaptive(x)));
  const kpi2 = {
    adaptive: a, random: r,
    deltaPoints: a.percent !== null && r.percent !== null ? Math.round((a.percent - r.percent) * 10) / 10 : null,
  };

  const table = profiles.map((p) => {
    const mine = shown.filter((x) => x.userId === p.id);
    const myEntries = entries.filter((e) => e.userId === p.id);
    const myPicks = picks.filter((x) => x.userId === p.id);
    return {
      pseudonym: alias.get(p.id),
      onboarded: Boolean(p.onboardingCompletedAt),
      daysShown: new Set(mine.map((x) => x.shownOn)).size,
      daysWritten: new Set(myEntries.map((e) => e.createdAt.slice(0, 10))).size,
      answered: mine.filter((x) => x.wasAnswered).length,
      rated: mine.filter((x) => x.relevanceRating !== null && x.relevanceRating !== undefined).length,
      firstPickAdaptive: pct(myPicks.filter(isAdaptive).length, myPicks.length),
      lastEntry: myEntries.map((e) => e.createdAt).sort().at(-1) ?? null,
    };
  });

  const kind = (x) => (isAdaptive(x) ? 'adaptive' : 'random');
  const feed = [
    ...shown.filter((x) => x.wasChosen).map((x) => ({ at: x.chosenAt, who: alias.get(x.userId), what: 'picked', zone: x.zoneId, kind: kind(x) })),
    ...shown.filter((x) => x.ratedAt).map((x) => ({ at: x.ratedAt, who: alias.get(x.userId), what: x.relevanceRating ? 'rated relevant' : 'rated not relevant', zone: x.zoneId, kind: kind(x) })),
    ...entries.map((e) => ({ at: e.createdAt, who: alias.get(e.userId), what: e.status === 'classification_failed' ? 'saved an entry (analysis pending)' : 'saved an entry', zone: null, kind: null })),
  ].filter((e) => e.at && e.who).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 12);

  const firstDay = profiles[0]?.createdAt?.slice(0, 10) ?? null;
  return {
    generatedAt: new Date().toISOString(),
    pilotDay: firstDay ? Math.floor((Date.now() - Date.parse(`${firstDay}T00:00:00Z`)) / 86_400_000) + 1 : 0,
    participants: profiles.length,
    entries: entries.length,
    failedAnalyses: entries.filter((e) => e.status === 'classification_failed').length,
    classifier: config.classifier,
    kpi1, kpi2, table, feed,
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