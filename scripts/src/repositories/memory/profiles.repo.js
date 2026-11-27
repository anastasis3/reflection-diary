/**
 * Profiles — memory driver. One row per account: the optional display name
 * and the two onboarding timestamps (KPI4: completion rate and duration).
 */
import store from '../../data/store.js';

export async function findById(userId) {
  return store.state.profiles.find((p) => p.id === userId) ?? null;
}

export async function create(userId, { displayName = null } = {}) {
  const now = new Date().toISOString();
  const profile = {
    id: userId,
    displayName,
    onboardingStartedAt: now,
    onboardingCompletedAt: null,
    createdAt: now,
  };
  store.state.profiles.push(profile);
  store.save();
  return profile;
}

export async function setDisplayName(userId, displayName) {
  const profile = await findById(userId);
  if (!profile) return null;
  profile.displayName = displayName;
  store.save();
  return profile;
}

export async function markOnboardingComplete(userId) {
  const profile = await findById(userId);
  if (!profile) return null;
  profile.onboardingCompletedAt = new Date().toISOString();
  store.save();
  return profile;
}

export async function remove(userId) {
  store.state.profiles = store.state.profiles.filter((p) => p.id !== userId);
  store.save();
}

export default { findById, create, setDisplayName, markOnboardingComplete, remove };
