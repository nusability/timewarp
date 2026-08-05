// App orchestration: search, topic management, filtering, ranking, the
// detail drawer, and wiring it all into the SpiralView.

import { SpiralView } from './spiral.js';
import { searchTitles, loadTopic, fetchSummary, MOCK } from './wiki.js';
import { CATEGORIES, categorize } from './categories.js';
import { parseWDTime, formatDate, periodName, currentYear } from './time.js';

const PALETTE = ['#ff5d73', '#ffc247', '#3ec97e', '#4d9dff', '#c77dff', '#ff9752'];
const MAX_TOPICS = 6;
const NOW = currentYear();

const state = {
  topics: [],            // { id, title, qid, color, selfEvent, events (all derived) }
  enabledCats: new Set(Object.keys(CATEGORIES).filter((k) => !CATEGORIES[k].defaultOff)),
  density: 75,
  loading: false,
};

const $ = (sel) => document.querySelector(sel);

const spiral = new SpiralView($('#scene'), {
  onPick: (ev, topic) => (ev ? openDrawer(ev, topic) : closeDrawer()),
  onHover: (ev, topic, x, y) => showTooltip(ev, topic, x, y),
});

// ---------------------------------------------------------------- events

// Turn a raw dated entity into a drawable event, or null to skip it.
function deriveEvent(ent) {
  const cat = categorize(ent.types);
  if (cat === null) return null;
  const t = {};
  for (const [k, v] of Object.entries(ent.times)) t[k] = parseWDTime(v);

  let kind = 'point', A = null, B = null, P = null, open = false;
  if (cat === 'person' && (t.birth || t.death)) {
    if (t.birth && t.death) { kind = 'range'; A = t.birth; B = t.death; }
    else if (t.birth && NOW - t.birth.y < 105) { kind = 'range'; A = t.birth; open = true; }
    else { P = t.birth || t.death; }
  } else if (t.point) {
    P = t.point;
  } else {
    const s = t.start || t.inception;
    const e = t.end || t.dissolved;
    if (s && e) { kind = 'range'; A = s; B = e; }
    else if (s && ['place', 'org', 'period'].includes(cat)) { kind = 'range'; A = s; open = true; }
    else if (s) { P = s; }
    else if (e) { P = e; }
    else return null;
  }
  if (kind === 'range' && B && B.yearFloat < A.yearFloat) [A, B] = [B, A];

  const whenText = kind === 'point'
    ? formatDate(P)
    : `${formatDate(A)} – ${open ? 'today' : formatDate(B)}`;
  return {
    qid: ent.qid, title: ent.title, thumb: ent.thumb, sitelinks: ent.sitelinks || 0,
    cat, kind, open, isSelf: !!ent.self,
    ta: A ? A.yearFloat : null, tb: B ? B.yearFloat : null, tp: P ? P.yearFloat : null,
    whenText,
  };
}

function eventMid(ev) {
  if (ev.kind === 'point') return ev.tp;
  return (ev.ta + (ev.open ? NOW : ev.tb)) / 2;
}

// Filter by category, rank by notability, cap by density, assign tiers.
// Happenings (conflicts, one-time events, disasters) get a ranking boost so
// Pearl Harbor outranks the ever-present countries and heads of state.
const BOOSTED = new Set(['conflict', 'event', 'disaster']);
const score = (ev) => ev.sitelinks * (BOOSTED.has(ev.cat) ? 1.8 : 1);

function visibleEvents(topic) {
  const list = topic.events
    .filter((ev) => !ev.isSelf && state.enabledCats.has(ev.cat))
    .sort((a, b) => score(b) - score(a))
    .slice(0, state.density);
  if (topic.selfEvent) list.unshift(topic.selfEvent);
  list.forEach((ev, i) => {
    ev.tier = ev.isSelf ? 0 : i <= 10 ? 0 : i <= 30 ? 1 : 2;
  });
  return list;
}

// ---------------------------------------------------------------- domain

function fitDomain() {
  // Anchor the range to each topic's own timeframe plus ~50% context on each
  // side — NOT to the linked events, whose most notable entries are exactly
  // the long-lived giants (countries, religions, empires) that would stretch
  // the view across millennia. WW2 should give you the war years plus a few
  // around them, not 1000 BCE – 3000 CE.
  const ranges = [];
  const fallbackTimes = [];
  for (const topic of state.topics) {
    const se = topic.selfEvent;
    if (se && se.kind === 'point') {
      ranges.push([se.tp - 15, se.tp + 15]);
    } else if (se && se.ta != null) {
      const b = se.open ? NOW : (se.tb ?? se.ta);
      const span = Math.max(1, b - se.ta);
      const pad = Math.min(50, Math.max(3, span * 0.5));
      ranges.push([se.ta - pad, b + pad]);
    } else {
      // No own timeframe (e.g. a concept article): fall back to the
      // percentile spread of its dated surroundings.
      for (const ev of visibleEvents(topic)) {
        if (ev.kind === 'point') fallbackTimes.push(ev.tp);
        else { fallbackTimes.push(ev.ta); fallbackTimes.push(ev.open ? NOW : ev.tb); }
      }
    }
  }
  if (fallbackTimes.length) {
    fallbackTimes.sort((a, b) => a - b);
    ranges.push([
      fallbackTimes[Math.floor(fallbackTimes.length * 0.08)],
      fallbackTimes[Math.ceil(fallbackTimes.length * 0.92) - 1],
    ]);
  }
  if (!ranges.length) return;
  const lo = Math.min(...ranges.map((r) => r[0]));
  const hi = Math.max(...ranges.map((r) => r[1]));
  setDomain(Math.floor(lo), Math.ceil(hi));
}

function setDomain(t0, t1) {
  spiral.setDomain(t0, t1);
  // The spiral snaps the domain to period boundaries — reflect that in the UI.
  $('#domFrom').value = Math.round(spiral.domain.t0);
  $('#domTo').value = Math.round(spiral.domain.t1);
  $('#periodBadge').textContent = `1 turn = ${periodName(spiral.period)}`;
  refresh(false);
}

// ---------------------------------------------------------------- refresh

function refresh(refit = false) {
  if (refit) fitDomain();
  const laneCount = Math.max(1, state.topics.length);
  spiral.setTopics(state.topics.map((topic, i) => ({
    id: topic.id, title: topic.title, color: topic.color,
    laneIndex: i, laneCount,
    selfEvent: topic.selfEvent,
    events: visibleEvents(topic),
  })));
  renderTopicChips();
  $('#empty').style.display = state.topics.length || state.loading || state.emptyDismissed ? 'none' : '';
}

function dismissEmpty() {
  state.emptyDismissed = true;
  $('#empty').style.display = 'none';
}

// ---------------------------------------------------------------- topics

async function addTopic(title) {
  if (state.loading) return;
  if (state.topics.length >= MAX_TOPICS) return toast(`Up to ${MAX_TOPICS} topics at once — remove one first.`);
  if (state.topics.some((t) => t.title.toLowerCase() === title.toLowerCase())) return toast('Topic already added.');
  state.loading = true;
  status(`Loading “${title}”…`);
  $('#empty').style.display = 'none';
  try {
    const raw = await loadTopic(title, status);
    const events = [];
    let selfEvent = null;
    for (const ent of raw.entities) {
      const ev = deriveEvent(ent);
      if (!ev) continue;
      if (ent.self) { ev.tier = 0; selfEvent = ev; }
      else events.push(ev);
    }
    if (!selfEvent && !events.length) {
      toast(`No dated events found around “${raw.title}”.`);
      return;
    }
    const color = PALETTE.find((c) => !state.topics.some((t) => t.color === c)) || PALETTE[0];
    state.topics.push({
      id: raw.qid, title: raw.title, qid: raw.qid, thumb: raw.thumb, color, selfEvent, events,
    });
    refresh(true);
    spiral.resetCamera();
    status(null);
    toast(`Added “${raw.title}” — ${events.length} dated items found.`, false);
  } catch (e) {
    console.error(e);
    toast(`Could not load “${title}”: ${e.message}`);
  } finally {
    state.loading = false;
    status(null);
    refresh(false);
  }
}

function removeTopic(id) {
  state.topics = state.topics.filter((t) => t.id !== id);
  closeDrawer();
  refresh(true);
}

function renderTopicChips() {
  const box = $('#topics');
  box.innerHTML = '';
  for (const t of state.topics) {
    const chip = document.createElement('button');
    chip.className = 'chip topic-chip';
    chip.style.setProperty('--c', t.color);
    chip.innerHTML = `<span class="dot"></span><span class="t"></span><span class="x" title="Remove">×</span>`;
    chip.querySelector('.t').textContent = t.title;
    chip.title = 'Click to fly to this topic';
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('x')) removeTopic(t.id);
      else if (t.selfEvent) spiral.focusTime(eventMid(t.selfEvent));
    });
    box.appendChild(chip);
  }
}

function updateFiltersToggle() {
  $('#filtersToggle').textContent = `Filters · ${state.enabledCats.size}`;
}

function renderFilterChips() {
  updateFiltersToggle();
  const box = $('#filters');
  box.innerHTML = '';
  for (const [key, def] of Object.entries(CATEGORIES)) {
    const chip = document.createElement('button');
    chip.className = 'chip filter-chip';
    chip.classList.toggle('off', !state.enabledCats.has(key));
    chip.innerHTML = `<span class="g"></span><span class="t"></span>`;
    chip.querySelector('.g').textContent = def.glyph;
    chip.querySelector('.t').textContent = def.label;
    chip.addEventListener('click', () => {
      if (state.enabledCats.has(key)) state.enabledCats.delete(key);
      else state.enabledCats.add(key);
      chip.classList.toggle('off', !state.enabledCats.has(key));
      updateFiltersToggle();
      refresh(false);
    });
    box.appendChild(chip);
  }
}

// ---------------------------------------------------------------- search UI

let searchTimer = null;
const searchInput = $('#search');
const sugBox = $('#suggestions');

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) { sugBox.innerHTML = ''; sugBox.style.display = 'none'; return; }
  searchTimer = setTimeout(async () => {
    try {
      const results = await searchTitles(q);
      sugBox.innerHTML = '';
      sugBox.style.display = results.length ? '' : 'none';
      for (const r of results) {
        const li = document.createElement('li');
        li.textContent = r.title;
        li.addEventListener('mousedown', (e) => { e.preventDefault(); pickSuggestion(r.title); });
        sugBox.appendChild(li);
      }
    } catch { /* transient search errors are non-fatal */ }
  }, 280);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = sugBox.querySelector('li');
    pickSuggestion(first ? first.textContent : searchInput.value.trim());
  }
  if (e.key === 'Escape') { sugBox.style.display = 'none'; }
});
searchInput.addEventListener('blur', () => setTimeout(() => { sugBox.style.display = 'none'; }, 150));

function pickSuggestion(title) {
  if (!title) return;
  sugBox.style.display = 'none';
  searchInput.value = '';
  addTopic(title);
}

// ---------------------------------------------------------------- drawer

async function openDrawer(ev, topic) {
  const d = $('#drawer');
  d.classList.add('open');
  $('#dTitle').textContent = ev.title;
  $('#dWhen').textContent = ev.whenText;
  const cat = CATEGORIES[ev.cat] || CATEGORIES.other;
  $('#dCat').textContent = `${cat.glyph} ${cat.label}`;
  const chip = $('#dTopic');
  chip.textContent = topic.title;
  chip.style.background = topic.color;
  $('#dDesc').textContent = '';
  $('#dExtract').textContent = 'Loading article summary…';
  $('#dMeta').textContent = ev.sitelinks ? `In ${ev.sitelinks} Wikipedia language editions` : '';
  const img = $('#dImg');
  img.style.display = ev.thumb ? '' : 'none';
  if (ev.thumb) img.src = ev.thumb;
  $('#dLink').href = `https://en.wikipedia.org/wiki/${encodeURIComponent(ev.title.replace(/ /g, '_'))}`;
  $('#dFocus').onclick = () => spiral.focusTime(eventMid(ev));

  try {
    const s = await fetchSummary(ev.title);
    if ($('#dTitle').textContent !== ev.title) return; // user opened something else meanwhile
    $('#dDesc').textContent = s.description;
    $('#dExtract').textContent = s.extract || 'No summary available.';
    if (s.thumb) { img.src = s.thumb; img.style.display = ''; }
    if (s.url) $('#dLink').href = s.url;
  } catch {
    $('#dExtract').textContent = 'Could not load the article summary.';
  }
}

function closeDrawer() { $('#drawer').classList.remove('open'); }
$('#dClose').addEventListener('click', closeDrawer);
$('#dHandle').addEventListener('click', closeDrawer);

// ---------------------------------------------------------------- tooltip

const tooltip = $('#tooltip');
function showTooltip(ev, topic, x, y) {
  if (!ev) { tooltip.style.display = 'none'; return; }
  const cat = CATEGORIES[ev.cat] || CATEGORIES.other;
  tooltip.style.display = '';
  $('#ttTitle').textContent = ev.title;
  $('#ttSub').textContent = `${ev.whenText} · ${cat.label}`;
  tooltip.style.borderColor = topic.color;
  const pad = 14;
  tooltip.style.left = `${Math.min(x + pad, window.innerWidth - tooltip.offsetWidth - 8)}px`;
  tooltip.style.top = `${Math.min(y + pad, window.innerHeight - tooltip.offsetHeight - 8)}px`;
}

// ---------------------------------------------------------------- misc UI

function status(text) {
  const el = $('#status');
  el.style.display = text ? '' : 'none';
  if (text) $('#statusText').textContent = text;
}

let toastTimer = null;
function toast(msg, isError = true) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.style.display = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 5000);
}

$('#emptyClose').addEventListener('click', dismissEmpty);
searchInput.addEventListener('focus', dismissEmpty);
$('#scene').addEventListener('pointerdown', dismissEmpty, { once: true });
$('#filtersToggle').addEventListener('click', () => {
  $('#filters').classList.toggle('open');
  $('#filtersToggle').classList.toggle('on', $('#filters').classList.contains('open'));
});

// Touch devices get touch wording in the hint bar.
if (navigator.maxTouchPoints > 0) {
  $('#hint').firstChild.textContent = 'One finger to move · Two fingers to tilt & zoom · Data: ';
}

$('#density').addEventListener('change', (e) => {
  state.density = parseInt(e.target.value, 10);
  refresh(false);
});
$('#domApply').addEventListener('click', () => {
  const a = parseInt($('#domFrom').value, 10);
  const b = parseInt($('#domTo').value, 10);
  if (Number.isFinite(a) && Number.isFinite(b) && b > a) setDomain(a, b);
});
$('#domFit').addEventListener('click', () => fitDomain());
$('#resetView').addEventListener('click', () => spiral.resetCamera());

// ---------------------------------------------------------------- boot

renderFilterChips();
setDomain(1900, 2030);
spiral.resetCamera();
if (MOCK) {
  $('#mockBadge').style.display = '';
  const hint = $('#empty .hints');
  if (hint) hint.textContent = 'Offline sample mode — try “French Revolution (mock)”, “Roman Empire (mock)” or “Ada Lovelace (mock)”.';
}
document.title = 'Timewarp — spiral timeline of anything';

// Debug/testing handle (also handy in the browser console).
window.timewarp = { spiral, state, addTopic };
