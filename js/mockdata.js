// Bundled sample dataset for ?mock=1 — lets the app run fully offline
// (demos, tests, airplanes). Shapes match wiki.js exactly.

const T = (y, m = 1, d = 1) => {
  const sign = y < 0 ? '-' : '+';
  const ay = String(Math.abs(y)).padStart(4, '0');
  return `${sign}${ay}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00Z`;
};

let mockThumbCounter = 0;
function thumb() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  const hue = (mockThumbCounter++ * 47) % 360;
  const grad = g.createLinearGradient(0, 0, 96, 96);
  grad.addColorStop(0, `hsl(${hue} 60% 45%)`);
  grad.addColorStop(1, `hsl(${(hue + 60) % 360} 60% 25%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  return c.toDataURL();
}

let qidCounter = 900000;
const E = (title, cat, times, sitelinks, withThumb = true) => {
  const TYPES = {
    person: ['Q5'], conflict: ['Q198'], event: ['Q1190554'], disaster: ['Q8065'],
    place: ['Q6256'], org: ['Q43229'], work: ['Q571'], period: ['Q11514315'],
    calendar: ['Q577'], other: ['Q99999999'],
  };
  return {
    qid: `Q${qidCounter++}`, title, thumb: withThumb ? thumb() : null,
    sitelinks, types: TYPES[cat], times,
  };
};

function frenchRevolution() {
  const self = E('French Revolution (mock)', 'period', { start: T(1789, 5, 5), end: T(1799, 11, 9) }, 200);
  self.self = true;
  return {
    title: 'French Revolution (mock)', qid: self.qid, thumb: self.thumb,
    entities: [
      self,
      E('Storming of the Bastille', 'event', { point: T(1789, 7, 14) }, 120),
      E('Declaration of the Rights of Man', 'work', { inception: T(1789, 8, 26) }, 95),
      E('Women’s March on Versailles', 'event', { point: T(1789, 10, 5) }, 60),
      E('Flight to Varennes', 'event', { point: T(1791, 6, 20) }, 55),
      E('Battle of Valmy', 'conflict', { point: T(1792, 9, 20) }, 58),
      E('Execution of Louis XVI', 'event', { point: T(1793, 1, 21) }, 88),
      E('Reign of Terror', 'period', { start: T(1793, 9, 5), end: T(1794, 7, 28) }, 105),
      E('Battle of Fleurus', 'conflict', { point: T(1794, 6, 26) }, 40),
      E('Coup of 18 Brumaire', 'event', { point: T(1799, 11, 9) }, 70),
      E('Louis XVI', 'person', { birth: T(1754, 8, 23), death: T(1793, 1, 21) }, 130),
      E('Marie Antoinette', 'person', { birth: T(1755, 11, 2), death: T(1793, 10, 16) }, 125),
      E('Maximilien Robespierre', 'person', { birth: T(1758, 5, 6), death: T(1794, 7, 28) }, 118),
      E('Georges Danton', 'person', { birth: T(1759, 10, 26), death: T(1794, 4, 5) }, 80),
      E('Jean-Paul Marat', 'person', { birth: T(1743, 5, 24), death: T(1793, 7, 13) }, 78),
      E('Napoleon Bonaparte', 'person', { birth: T(1769, 8, 15), death: T(1821, 5, 5) }, 190),
      E('Voltaire', 'person', { birth: T(1694, 11, 21), death: T(1778, 5, 30) }, 150),
      E('Jean-Jacques Rousseau', 'person', { birth: T(1712, 6, 28), death: T(1778, 7, 2) }, 145),
      E('Jacobin Club', 'org', { inception: T(1789), dissolved: T(1794, 11, 12) }, 65),
      E('National Constituent Assembly', 'org', { inception: T(1789, 7, 9), dissolved: T(1791, 9, 30) }, 50),
      E('First French Republic', 'place', { inception: T(1792, 9, 22), dissolved: T(1804, 5, 18) }, 85),
      E('Kingdom of France', 'place', { inception: T(987), dissolved: T(1792, 9, 21) }, 90),
      E('Paris', 'place', { inception: T(-52) }, 210),
      E('Age of Enlightenment', 'period', { start: T(1715), end: T(1789) }, 110),
      E('Great Fear', 'event', { start: T(1789, 7, 22), end: T(1789, 8, 6) }, 35),
      E('French Famine of 1788', 'disaster', { point: T(1788) }, 20),
      E('The Social Contract', 'work', { inception: T(1762) }, 72),
      E('La Marseillaise', 'work', { inception: T(1792, 4, 25) }, 84),
      E('1789', 'calendar', { point: T(1789) }, 40),
      E('1793', 'calendar', { point: T(1793) }, 38),
      E('Estates General of 1789', 'event', { point: T(1789, 5, 5) }, 45),
      E('Napoleonic Wars', 'conflict', { start: T(1803, 5, 18), end: T(1815, 11, 20) }, 160),
      E('Concordat of 1801', 'work', { inception: T(1801, 7, 15) }, 30),
      E('Guillotine', 'other', { inception: T(1792) }, 66),
    ],
  };
}

function romanEmpire() {
  const self = E('Roman Empire (mock)', 'place', { start: T(-27), end: T(476, 9, 4) }, 250);
  self.self = true;
  return {
    title: 'Roman Empire (mock)', qid: self.qid, thumb: self.thumb,
    entities: [
      self,
      E('Julius Caesar', 'person', { birth: T(-100, 7, 12), death: T(-44, 3, 15) }, 200),
      E('Augustus', 'person', { birth: T(-63, 9, 23), death: T(14, 8, 19) }, 180),
      E('Nero', 'person', { birth: T(37, 12, 15), death: T(68, 6, 9) }, 140),
      E('Constantine the Great', 'person', { birth: T(272, 2, 27), death: T(337, 5, 22) }, 150),
      E('Battle of Actium', 'conflict', { point: T(-31, 9, 2) }, 75),
      E('Assassination of Julius Caesar', 'event', { point: T(-44, 3, 15) }, 90),
      E('Great Fire of Rome', 'disaster', { point: T(64, 7, 18) }, 70),
      E('Eruption of Mount Vesuvius', 'disaster', { point: T(79, 10, 24) }, 95),
      E('Colosseum', 'place', { inception: T(80) }, 155),
      E('Crossing of the Rubicon', 'event', { point: T(-49, 1, 10) }, 60),
      E('Pax Romana', 'period', { start: T(-27), end: T(180) }, 85),
      E('Crisis of the Third Century', 'period', { start: T(235), end: T(284) }, 55),
      E('Roman Republic', 'place', { inception: T(-509), dissolved: T(-27) }, 130),
      E('Sack of Rome', 'event', { point: T(410, 8, 24) }, 65),
      E('Roman Senate', 'org', { inception: T(-753) }, 88),
      E('Aeneid', 'work', { inception: T(-19) }, 77),
      E('Edict of Milan', 'work', { inception: T(313) }, 50),
      E('Punic Wars', 'conflict', { start: T(-264), end: T(-146) }, 100),
    ],
  };
}

function adaLovelace() {
  const self = E('Ada Lovelace (mock)', 'person', { birth: T(1815, 12, 10), death: T(1852, 11, 27) }, 140);
  self.self = true;
  return {
    title: 'Ada Lovelace (mock)', qid: self.qid, thumb: self.thumb,
    entities: [
      self,
      E('Charles Babbage', 'person', { birth: T(1791, 12, 26), death: T(1871, 10, 18) }, 120),
      E('Lord Byron', 'person', { birth: T(1788, 1, 22), death: T(1824, 4, 19) }, 135),
      E('Mary Somerville', 'person', { birth: T(1780, 12, 26), death: T(1872, 11, 29) }, 60),
      E('Analytical Engine', 'other', { inception: T(1837) }, 85),
      E('Difference Engine', 'other', { inception: T(1822) }, 70),
      E('Note G (first algorithm)', 'work', { inception: T(1843) }, 45),
      E('Royal Society', 'org', { inception: T(1660, 11, 28) }, 95),
      E('University of London', 'org', { inception: T(1836) }, 80),
      E('Victorian era', 'period', { start: T(1837, 6, 20), end: T(1901, 1, 22) }, 105),
      E('Industrial Revolution', 'period', { start: T(1760), end: T(1840) }, 170),
      E('London', 'place', { inception: T(47) }, 220),
    ],
  };
}

const TOPICS = { 'French Revolution (mock)': frenchRevolution, 'Roman Empire (mock)': romanEmpire, 'Ada Lovelace (mock)': adaLovelace };

export function mockSearch(query) {
  const q = query.toLowerCase();
  return Object.keys(TOPICS)
    .filter((t) => t.toLowerCase().includes(q) || q.length < 2)
    .map((title) => ({ title }));
}

export async function mockLoadTopic(title, onProgress) {
  onProgress('Loading sample data…');
  const make = TOPICS[title] || TOPICS[Object.keys(TOPICS).find((t) => t.toLowerCase().includes(title.toLowerCase()))];
  if (!make) throw new Error(`No mock topic “${title}”`);
  await new Promise((res) => setTimeout(res, 300));
  return make();
}

export async function mockSummary(title) {
  return {
    title,
    description: 'Sample entry from the bundled offline dataset',
    extract: 'This is mock data used for offline demos and testing. Run the app without ?mock=1 to load live data from Wikipedia and Wikidata.',
    thumb: null,
    url: 'https://en.wikipedia.org/',
  };
}
