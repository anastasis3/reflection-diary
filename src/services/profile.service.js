/**
 * The topic profile as the Profile screen (S-05) needs it: the nine weights,
 * how far each has moved since the quiz, which three the diary is asking
 * about, and the one-sentence insight above the chart.
 */
import ApiError from '../utils/ApiError.js';
import { getZone, ZONE_IDS } from '../data/zones.js';
import { weightsRepo, onboardingRepo, entriesRepo } from '../repositories/index.js';
import { applyManualEdit } from './adaptation.service.js';
import { topZones } from './selection.service.js';
import { daysAgo, dayRange, toDay } from '../utils/dates.js';

const round3 = (x) => Math.round(x * 1000) / 1000;

async function requireWeights(userId) {
  const weights = await weightsRepo.listForUser(userId);
  if (weights.length === 0) {
    throw ApiError.conflict(
      'ONBOARDING_INCOMPLETE',
      'Your profile does not exist yet — finish the short quiz first.',
    );
  }
  return weights;
}

/** weight = (answer - 1) / 4 — the value the quiz set, per zone. */
async function startWeights(userId) {
  const answers = await onboardingRepo.listForUser(userId);
  return Object.fromEntries(answers.map((a) => [a.zoneId, (a.value - 1) / 4]));
}

export async function getProfile(userId) {
  const weights = await requireWeights(userId);
  const start = await startWeights(userId);
  const asked = await topZones(userId);

  const zones = weights
    .map((w) => {
      const startWeight = start[w.zoneId] ?? null;
      return {
        zone: getZone(w.zoneId),
        weight: w.weight,
        isMuted: w.isMuted,
        source: w.source,
        updatedAt: w.updatedAt,
        startWeight,
        delta: startWeight === null ? null : round3(w.weight - startWeight),
        askedAbout: asked.includes(w.zoneId),
      };
    })
    .sort((a, b) => b.weight - a.weight);

  return {
    zones,
    askedAbout: asked,
    mutedCount: weights.filter((w) => w.isMuted).length,
    totalZones: ZONE_IDS.length,
  };
}

/**
 * GET /api/profile/insight — the card above the weights.
 *
 * Built from the same numbers as the bars below it: the highest zone, how
 * often it came up, what follows, and which zone has gone quiet. It describes
 * what was written; it does not judge it.
 *
 * "Came up" = the classifier scored the zone at least MENTION_THRESHOLD in
 * an entry. One entry can mention several zones.
 */
export const INSIGHT_WINDOW_DAYS = 35; // five weeks
export const RECENT_DAYS = 14;
export const MENTION_THRESHOLD = 0.5;

export async function insight(userId) {
  const weights = await requireWeights(userId);
  const start = await startWeights(userId);
  const live = weights.filter((w) => !w.isMuted).sort((a, b) => b.weight - a.weight);
  if (live.length === 0) return null;

  const from = daysAgo(INSIGHT_WINDOW_DAYS - 1);
  const recentFrom = daysAgo(RECENT_DAYS - 1);
  const entries = await entriesRepo.listForUser(userId, { from });

  const mentions = (zoneId, sinceDay = from) =>
    entries.filter(
      (e) => e.createdAt.slice(0, 10) >= sinceDay && (e.scores[zoneId] ?? 0) >= MENTION_THRESHOLD,
    ).length;

  const [first, second] = live;
  const total = entries.length;
  const m1 = mentions(first.zoneId);
  // the quietest live zone that has not come up in the last two weeks —
  // only meaningful once there has been some writing in that time
  const wroteRecently = entries.some((e) => e.createdAt.slice(0, 10) >= recentFrom);
  const quiet = wroteRecently
    ? [...live].reverse().find((w) => w.zoneId !== first.zoneId && mentions(w.zoneId, recentFrom) === 0)
    : undefined;

  return {
    windowDays: INSIGHT_WINDOW_DAYS,
    totalEntries: total,
    top: {
      zone: getZone(first.zoneId),
      weight: first.weight,
      deltaSinceQuiz: start[first.zoneId] === undefined ? null : round3(first.weight - start[first.zoneId]),
      mentions: m1,
      recentMentions: mentions(first.zoneId, recentFrom),
      percentOfEntries: total === 0 ? 0 : Math.round((m1 / total) * 100),
    },
    next: second ? { zone: getZone(second.zoneId), weight: second.weight } : null,
    quiet: quiet ? { zone: getZone(quiet.zoneId), weight: quiet.weight, days: RECENT_DAYS } : null,
    askedAbout: (await topZones(userId)).map(getZone),
  };
}

/** A manual edit of the weights (Edit zones). */
export async function updateWeights(userId, edits) {
  const result = await applyManualEdit(userId, edits);
  if (!result.ok) throw ApiError.conflict(result.code, result.message);
  return { ...(await getProfile(userId)), changes: result.changes };
}

/** One zone over time — recorded days only, nothing invented. */
export async function trend(userId, zoneId, days = 30) {
  if (!getZone(zoneId)) throw ApiError.notFound(`"${zoneId}" is not one of the nine zones.`);
  const from = daysAgo(days - 1);
  const points = (await weightsRepo.historyForZone(userId, zoneId, from)).map((h) => ({
    day: h.asOf,
    weight: h.weight,
  }));
  return {
    zone: getZone(zoneId),
    from,
    days,
    points,
    first: points[0]?.weight ?? null,
    last: points.at(-1)?.weight ?? null,
  };
}

/**
 * GET /api/profile/history?days=7 — the whole profile on each of the last
 * `days` days, for the week strip on Today ("what did my profile look like on
 * Tuesday?"). weight_history has a row only on days a weight changed, so each
 * zone carries its last known value forward; before the quiz it is null.
 */
export async function snapshots(userId, days = 7) {
  await requireWeights(userId);
  const history = await weightsRepo.historyForUser(userId); // oldest first
  const out = [];
  const last = {};
  let i = 0;
  for (const day of dayRange(daysAgo(days - 1), toDay())) {
    while (i < history.length && history[i].asOf <= day) {
      last[history[i].zoneId] = history[i].weight;
      i += 1;
    }
    out.push({ day, weights: Object.fromEntries(ZONE_IDS.map((z) => [z, last[z] ?? null])) });
  }
  return { days: out };
}

/** The audit trail, which the study needs and the participant may inspect. */
export async function changeLog(userId) {
  return (await weightsRepo.changesForUser(userId)).map((c) => ({ ...c, zone: getZone(c.zoneId) }));
}

export default { getProfile, insight, updateWeights, trend, changeLog, snapshots };
