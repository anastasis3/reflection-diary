/**
 * The profile row: when the account was created and how far the onboarding
 * quiz got. KPI4 of the study (completion rate and median duration) is
 * computed from these two timestamps, which is why both are stored and not
 * just a boolean.
 */
import store from '../data/store.js';

export function findById(userId) {
  return store.state.profiles.find((p) => p.id === userId) ?? null;
}

export function create(userId) {
  const now = new Date().toISOString();
  const profile = {
    id: userId,
    onboardingStartedAt: now,
    onboardingCompletedAt: null,
    createdAt: now,
  };
  store.state.profiles.push(profile);
  store.save();
  return profile;
}

export function markOnboardingComplete(userId) {
  const profile = findById(userId);
  if (!profile) return null;
  profile.onboardingCompletedAt = new Date().toISOString();
  store.save();
  return profile;
}

export function remove(userId) {
  const { profiles } = store.state;
  const index = profiles.findIndex((p) => p.id === userId);
  if (index !== -1) profiles.splice(index, 1);
  store.save();
}

export default { findById, create, markOnboardingComplete, remove };
