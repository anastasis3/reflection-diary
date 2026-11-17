/**
 * The question bank: two questions per zone, eighteen in total.
 *
 * This mirrors the `prompts` table seeded by the database migrations. The
 * selection service never invents a question — it chooses a zone first and
 * then draws an active question from that zone, which is what makes the
 * "why this question?" explanation on screen S-03a truthful.
 */
export const PROMPTS = [
  { id: 1, zoneId: 'work', text: 'What at work or in your studies took more energy from you this week than it gave back?' },
  { id: 2, zoneId: 'work', text: 'What did you finish this week that nobody noticed?' },

  { id: 3, zoneId: 'people', text: 'Who did you want to reach out to this week — and what stopped you, or did not?' },
  { id: 4, zoneId: 'people', text: 'When did you feel genuinely understood by someone recently?' },

  { id: 5, zoneId: 'health', text: 'How did your body feel this week — and did you listen to it?' },
  { id: 6, zoneId: 'health', text: 'What did your body ask you for this week that you postponed?' },

  { id: 7, zoneId: 'energy', text: 'When did you feel most awake this week, and what were you doing?' },
  { id: 8, zoneId: 'energy', text: 'What drained you this week in a way you did not expect?' },

  { id: 9, zoneId: 'emotion', text: 'What did you feel most strongly this week, and what set it off?' },
  { id: 10, zoneId: 'emotion', text: 'What feeling did you decide not to show anyone this week?' },

  { id: 11, zoneId: 'self', text: 'What did you do this week that felt like you at your best?' },
  { id: 12, zoneId: 'self', text: 'What would the version of you from a year ago find surprising about this week?' },

  { id: 13, zoneId: 'interest', text: 'What caught your attention lately that has nothing to do with duty?' },
  { id: 14, zoneId: 'interest', text: 'What did you want to learn more about this week but had no time for?' },

  { id: 15, zoneId: 'meaning', text: 'What did you spend time on this week that felt worth doing in itself?' },
  { id: 16, zoneId: 'meaning', text: 'What part of this week would you keep if you could keep only one?' },

  { id: 17, zoneId: 'everyday', text: 'What small thing in your day-to-day would make the week lighter if you fixed it?' },
  { id: 18, zoneId: 'everyday', text: 'What did you put off this week that would have taken ten minutes?' },
];

const byId = new Map(PROMPTS.map((p) => [p.id, p]));

export function getPrompt(id) {
  return byId.get(Number(id)) ?? null;
}

export function promptsForZone(zoneId) {
  return PROMPTS.filter((p) => p.zoneId === zoneId);
}

export default PROMPTS;
