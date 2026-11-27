/**
 * The nine zones: the same ids, names and colours as the server.
 * The order is the order the zones go round the radar.
 */
export const ZONES = ['work', 'energy', 'emotion', 'people', 'self', 'interest', 'health', 'everyday', 'meaning'];

export const ZONE_COLOUR = {
  work: '#A99BFF', energy: '#F3BE8C', self: '#D8B4F2', interest: '#8FD1E8',
  meaning: '#B4C6F0', everyday: '#95DCC6', health: '#9BD9A2', people: '#EDB4D0', emotion: '#EDD392',
};

// Names from the four WHOQOL-BREF domains and the five PERMA elements,
// adapted as journalling topics (UX specification §1.4).
export const ZONE_NAME = {
  work: 'work & study', people: 'close people', health: 'health & body', energy: 'energy & sleep',
  emotion: 'emotions', self: 'self & growth', interest: 'interests', meaning: 'meaning', everyday: 'everyday life',
};

/** The short labels round the radar. */
export const ZONE_SHORT = {
  work: 'work', people: 'people', health: 'health', energy: 'energy', emotion: 'emotions',
  self: 'self', interest: 'interests', meaning: 'meaning', everyday: 'everyday',
};

export const zc = (z) => ZONE_COLOUR[z] || '#9B8CFF';
export const zl = (z) => ZONE_NAME[z] || z;
export const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** Zones sorted by weight, highest first: [[zone, weight], …] */
export const sortedZones = (weights) => Object.entries(weights).sort((a, b) => b[1] - a[1]);

/** The three zones the diary is asking about (muted ones never count). */
export const topThree = (weights, muted) => sortedZones(weights)
  .filter(([z]) => !muted.includes(z)).slice(0, 3).map(([z]) => z);
