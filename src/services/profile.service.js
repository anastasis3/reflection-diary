/**
 * The topic profile as the Profile screen (S-05) needs it.
 *
 * Three things are returned together because the screen shows them together:
 * the nine weights, how far each has moved since the quiz, and which three the
 * diary is currently asking about.
 */
import ApiError from '../utils/ApiError.js';
import { getZone, ZONE_IDS } from '../data/zones.js';
import * as weightsRepo from '../repositories/weights.repo.js';
import * as onboardingRepo from '../repositories/onboarding.repo.js';
import { applyManualEdit } from './adaptation.service.js';
import { topZones } from './selection.service.js';
import { daysAgo } from '../utils/dates.js';

export function getProfile(userId) {
  const weights = weightsRepo.listForUser(userId);
  if (weights.length === 0) {
    throw ApiError.conflict(
      'ONBOARDING_INCOMPLETE',
      'Your profile does not exist yet — finish the short quiz first.',
    );
  }

  const startingAnswers = onboardingRepo.listForUser(userId);
  const asked = topZones(userId);

  const zones = weights
    .map((w) => {
      const answer = startingAnswers.find((a) => a.zoneId === w.zoneId);
      const startWeight = answer ? (answer.value - 1) / 4 : null;
      return {
        zone: getZone(w.zoneId),
        weight: w.weight,
        isMuted: w.isMuted,
        source: w.source,
        updatedAt: w.updatedAt,
        startWeight,
        // "how far it has moved since the quiz" — the last column of S-05
        delta:
          startWeight === null ? null : Math.round((w.weight - startWeight) * 1000) / 1000,
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

/** A manual edit of the weights (Edit zones). */
export function updateWeights(userId, edits) {
  const result = applyManualEdit(userId, edits);
  if (!result.ok) throw ApiError.conflict(result.code, result.message);
  return { ...getProfile(userId), changes: result.changes };
}

/**
 * One zone's weight over time, for the trend chart.
 *
 * Returns the recorded days only. The chart draws what was measured; it does
 * not invent a value for a day the participant did not write on.
 */
export function trend(userId, zoneId, days = 30) {
  if (!getZone(zoneId)) throw ApiError.notFound(`"${zoneId}" is not one of the nine zones.`);
  const from = daysAgo(days - 1);
  const points = weightsRepo
    .historyForZone(userId, zoneId, from)
    .map((h) => ({ day: h.asOf, weight: h.weight }));

  return {
    zone: getZone(zoneId),
    from,
    days,
    points,
    first: points[0]?.weight ?? null,
    last: points.at(-1)?.weight ?? null,
  };
}

/** The audit trail, which the study needs and the participant may inspect. */
export function changeLog(userId) {
  return weightsRepo.changesForUser(userId).map((c) => ({ ...c, zone: getZone(c.zoneId) }));
}

export default { getProfile, updateWeights, trend, changeLog };
