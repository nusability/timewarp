// Event categorization from Wikidata "instance of" (P31) claims.
// No AI involved: a curated mapping of common P31 classes to a small set of
// filterable categories. Unknown classes fall through to "other".

export const CATEGORIES = {
  person:   { label: 'People',            glyph: '\u{1F464}' },
  conflict: { label: 'Wars & conflicts',  glyph: '⚔️' },
  event:    { label: 'Events',            glyph: '⚡' },
  disaster: { label: 'Disasters',         glyph: '\u{1F30B}' },
  place:    { label: 'Places & polities', glyph: '\u{1F4CD}' },
  org:      { label: 'Organizations',     glyph: '\u{1F3DB}️' },
  work:     { label: 'Works & documents', glyph: '\u{1F4D6}' },
  period:   { label: 'Periods',           glyph: '⏳' },
  calendar: { label: 'Calendar years',    glyph: '\u{1F4C6}', defaultOff: true },
  other:    { label: 'Other',             glyph: '●' },
};

// Entities that are Wikipedia plumbing, not history — dropped entirely.
const EXCLUDE = new Set([
  'Q4167410',  // disambiguation page
  'Q13406463', // list article
  'Q4167836',  // category page
  'Q101352',   // family name
  'Q202444',   // given name
  'Q12308941', // male given name
  'Q11879590', // female given name
  'Q17442446', // Wikimedia internal item
]);

const MAP = {
  // people
  Q5: 'person',
  // wars & conflicts
  Q198: 'conflict', Q178561: 'conflict', Q350604: 'conflict', Q831663: 'conflict',
  Q188055: 'conflict', Q124734: 'conflict', Q10931: 'conflict', Q45382: 'conflict',
  Q41397: 'conflict', Q3199915: 'conflict', Q2223653: 'conflict', Q103495: 'conflict',
  Q645883: 'conflict', Q8465: 'conflict', Q1261499: 'conflict',
  // disasters
  Q8065: 'disaster', Q7944: 'disaster', Q8068: 'disaster', Q3839081: 'disaster',
  Q168247: 'disaster', Q12184: 'disaster', Q44512: 'disaster', Q168983: 'disaster',
  Q8092: 'disaster', Q8081: 'disaster', Q8070: 'disaster', Q7692360: 'disaster',
  Q744913: 'disaster',
  // one-time / general events
  Q1190554: 'event', Q1656682: 'event', Q13418847: 'event', Q40231: 'event',
  Q43109: 'event', Q131569: 'event', Q625298: 'event', Q132241: 'event',
  Q273120: 'event', Q175331: 'event',
  // places & polities
  Q6256: 'place', Q3624078: 'place', Q3024240: 'place', Q48349: 'place',
  Q417175: 'place', Q133156: 'place', Q515: 'place', Q1549591: 'place',
  Q7275: 'place', Q5119: 'place', Q1048835: 'place', Q41176: 'place',
  Q16970: 'place', Q23413: 'place', Q16560: 'place', Q12280: 'place',
  Q4989906: 'place',
  // organizations
  Q43229: 'org', Q4830453: 'org', Q783794: 'org', Q7278: 'org', Q3918: 'org',
  Q484652: 'org', Q31855: 'org', Q176799: 'org', Q1530022: 'org', Q167037: 'org',
  // works & documents
  Q571: 'work', Q7725634: 'work', Q47461344: 'work', Q11424: 'work',
  Q3305213: 'work', Q2188189: 'work', Q41298: 'work', Q11032: 'work',
  Q13442814: 'work', Q732577: 'work', Q179461: 'work', Q7889: 'work',
  Q1344: 'work', Q25379: 'work', Q5185279: 'work', Q7366: 'work',
  Q482994: 'work', Q860861: 'work',
  // periods
  Q11514315: 'period', Q6428674: 'period', Q186081: 'period', Q3186692: 'period',
  Q968159: 'period', Q164950: 'period',
  // calendar units (hidden by default — they'd flood every topic)
  Q577: 'calendar', Q39911: 'calendar', Q578: 'calendar', Q36507: 'calendar',
};

// Priority when an entity has several P31 classes.
const PRIORITY = ['person', 'conflict', 'disaster', 'calendar', 'period', 'event', 'place', 'org', 'work'];

// types: array of QID strings. Returns a category key, or null to drop.
export function categorize(types) {
  if (!types || !types.length) return 'other';
  const cats = new Set();
  for (const q of types) {
    if (EXCLUDE.has(q)) return null;
    const c = MAP[q];
    if (c) cats.add(c);
  }
  for (const p of PRIORITY) if (cats.has(p)) return p;
  return 'other';
}
