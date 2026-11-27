/**
 * The question bank: two questions per zone, eighteen in total.
 *
 * This mirrors the `prompts` table seeded by the database migrations. The
 * selection service never invents a question — it chooses a zone first and
 * then draws an active question from that zone, which is what makes the
 * "why this question?" explanation on screen S-03a truthful.
 */
export const PROMPTS = [  // same text and order as the INSERT in supabase/migrations/…_catalog.sql
  { id: 1, zoneId: 'work', text: 'What at work or in your studies took more energy from you this week than it gave back?' },
  { id: 2, zoneId: 'work', text: 'What did you finish this week that nobody noticed?' },

  { id: 3, zoneId: 'people', text: 'Who did you want to reach out to this week — and what stopped you, or did not?' },
  { id: 4, zoneId: 'people', text: 'Who made your week easier, and do they know it?' },

  { id: 5, zoneId: 'health', text: 'How did your body feel this week — and did you listen to it?' },
  { id: 6, zoneId: 'health', text: 'What did you do for your body this week that was not an obligation?' },

  { id: 7, zoneId: 'energy', text: 'When did you feel most awake this week, and what were you doing?' },
  { id: 8, zoneId: 'energy', text: 'What took your energy this week without giving anything back?' },

  { id: 9, zoneId: 'emotion', text: 'What did you feel most strongly this week, and what set it off?' },
  { id: 10, zoneId: 'emotion', text: 'Was there a moment this week when your reaction surprised you?' },

  { id: 11, zoneId: 'self', text: 'What did you do this week that felt like you at your best?' },
  { id: 12, zoneId: 'self', text: 'What would you do differently if this week started again?' },

  { id: 13, zoneId: 'interest', text: 'What caught your attention lately that has nothing to do with duty?' },
  { id: 14, zoneId: 'interest', text: 'What did you want to learn more about this week?' },

  { id: 15, zoneId: 'meaning', text: 'What did you spend time on this week that felt worth doing in itself?' },
  { id: 16, zoneId: 'meaning', text: 'What mattered to you this week that would not show up on any list?' },

  { id: 17, zoneId: 'everyday', text: 'What small thing in your day-to-day would make the week lighter if you fixed it?' },
  { id: 18, zoneId: 'everyday', text: 'What part of your week ran smoothly, and why?' },
];

let catalog = PROMPTS.map((p) => ({ ...p, isActive: true }));
let byId = new Map(catalog.map((p) => [p.id, p]));

/**
 * With the Supabase driver the `prompts` table is the source of truth: it is
 * read once at start-up and replaces the list above, so a question edited or
 * withdrawn in the database (is_active = false) is what the API uses.
 */
export function replaceCatalog(rows) {
  catalog = rows.map((r) => ({ id: Number(r.id), zoneId: r.zoneId, text: r.text, isActive: r.isActive }));
  byId = new Map(catalog.map((p) => [p.id, p]));
}

/** Any question, active or not — past selections must stay readable. */
export function getPrompt(id) {
  return byId.get(Number(id)) ?? null;
}

/** The active questions of one zone. */
export function promptsForZone(zoneId) {
  return catalog.filter((p) => p.zoneId === zoneId && p.isActive);
}

export default PROMPTS;
