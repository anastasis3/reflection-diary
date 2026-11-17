/**
 * The nine zones of the topic profile.
 *
 * They are derived from the four domains of WHOQOL-BREF and the five elements
 * of PERMA, adapted as journalling topics (UX specification §1.4). They are an
 * adaptation, not a validated scale: a weight expresses how relevant a topic is
 * to this participant right now, for the purpose of choosing a question. It is
 * not a measurement of well-being and must never be presented as one.
 *
 * This table mirrors the `zones` table of the database migrations
 * (supabase/migrations/..._catalog.sql) so that the two cannot drift apart.
 */
export const ZONES = [
  { id: 'work', name: 'work & study', short: 'work', colour: '#A99BFF', sortOrder: 1 },
  { id: 'people', name: 'close people', short: 'people', colour: '#EDB4D0', sortOrder: 2 },
  { id: 'health', name: 'health & body', short: 'health', colour: '#9BD9A2', sortOrder: 3 },
  { id: 'energy', name: 'energy & sleep', short: 'energy', colour: '#F3BE8C', sortOrder: 4 },
  { id: 'emotion', name: 'emotions', short: 'emotions', colour: '#EDD392', sortOrder: 5 },
  { id: 'self', name: 'self & growth', short: 'self', colour: '#D8B4F2', sortOrder: 6 },
  { id: 'interest', name: 'interests', short: 'interests', colour: '#8FD1E8', sortOrder: 7 },
  { id: 'meaning', name: 'meaning', short: 'meaning', colour: '#B4C6F0', sortOrder: 8 },
  { id: 'everyday', name: 'everyday life', short: 'everyday', colour: '#95DCC6', sortOrder: 9 },
];

export const ZONE_IDS = ZONES.map((z) => z.id);

const byId = new Map(ZONES.map((z) => [z.id, z]));

export function getZone(id) {
  return byId.get(id) ?? null;
}

export function isZoneId(id) {
  return byId.has(id);
}

/**
 * The nine onboarding statements, one per zone, in the order they are shown.
 * The answer is 1–5 and becomes the starting weight as (answer - 1) / 4.
 */
export const ONBOARDING_STATEMENTS = [
  { zoneId: 'work', text: 'My work or study takes up most of my thoughts right now.' },
  { zoneId: 'people', text: 'When something matters to me, there is someone I can talk to about it.' },
  { zoneId: 'health', text: 'I pay attention to how my body feels during the week.' },
  { zoneId: 'energy', text: 'I notice clearly when my energy rises or drops during the week.' },
  { zoneId: 'emotion', text: 'I can usually name what I am feeling while I am feeling it.' },
  { zoneId: 'self', text: 'I often think about what kind of person I am becoming.' },
  { zoneId: 'interest', text: 'I make time for things that simply interest me.' },
  { zoneId: 'meaning', text: 'What I spend my days on feels connected to what matters to me.' },
  { zoneId: 'everyday', text: 'My home, money and daily routine are in an order that suits me.' },
];

export default ZONES;
