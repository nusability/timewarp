// Time parsing & formatting for Wikidata timestamps.
// Wikidata times look like "+1789-07-14T00:00:00Z" or "-0044-03-15T00:00:00Z" (44 BCE).
// SPARQL results may omit the leading "+". Years can exceed 4 digits.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TIME_RE = /^([+-]?)(\d{1,16})-(\d{2})-(\d{2})/;

// Returns { y, m, d, yearFloat } or null. yearFloat is a signed decimal year
// suitable for positioning on a continuous axis (BCE years are negative).
export function parseWDTime(str) {
  if (!str) return null;
  const m = TIME_RE.exec(str);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const y = sign * parseInt(m[2], 10);
  const mo = Math.min(12, Math.max(1, parseInt(m[3], 10) || 1));
  const d = Math.min(31, Math.max(1, parseInt(m[4], 10) || 1));
  const frac = (mo - 1) / 12 + (d - 1) / 365;
  return { y, m: mo, d, yearFloat: y + (sign < 0 ? frac : frac) };
}

export function formatYear(y) {
  const yr = Math.round(y);
  return yr < 0 ? `${-yr} BCE` : `${yr}`;
}

// Wikidata truthy statements don't carry precision, so infer a sensible
// display granularity: Jan 1 usually means "year known only".
export function formatDate(t) {
  if (!t) return '';
  if (t.m === 1 && t.d === 1) return formatYear(t.y);
  if (t.d === 1) return `${MONTHS[t.m - 1]} ${formatYear(t.y)}`;
  return `${t.d} ${MONTHS[t.m - 1]} ${formatYear(t.y)}`;
}

// Human string for an event's time: "14 Jul 1789", "1789 – 1799", "1712 – …"
export function formatWhen(ev) {
  if (ev.kind === 'point') return formatDate(ev.tp);
  const a = ev.ta ? formatDate(ev.ta) : '…';
  const b = ev.open ? 'today' : (ev.tb ? formatDate(ev.tb) : '…');
  return `${a} – ${b}`;
}

// Pick a "nice" tick step (1/2/5 × 10^k years) aiming for ~targetCount ticks.
export function niceStep(span, targetCount = 14) {
  const raw = Math.abs(span) / targetCount;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  for (const mult of [1, 2, 5, 10]) {
    if (pow * mult >= raw) return Math.max(1, pow * mult);
  }
  return Math.max(1, pow * 10);
}

export function currentYear() {
  return new Date().getFullYear();
}
