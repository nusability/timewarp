// Data access layer: Wikipedia (MediaWiki API + REST summaries) and Wikidata
// (SPARQL primary, wbgetentities fallback). All endpoints are public and
// CORS-enabled — the app is fully client-side, no keys, no AI.
//
// Add ?mock=1 to the URL to run against a bundled sample dataset (offline demo).

import { mockSearch, mockLoadTopic, mockSummary } from './mockdata.js';

export const MOCK = new URLSearchParams(location.search).has('mock');

const WIKI = 'https://en.wikipedia.org/w/api.php';
const WD_API = 'https://www.wikidata.org/w/api.php';
const SPARQL = 'https://query.wikidata.org/sparql';

const LINK_CAP = 1500;      // max linked articles harvested per topic
const SPARQL_CHUNK = 250;   // QIDs per SPARQL request
const WB_CHUNK = 50;        // QIDs per wbgetentities request (API max)

// Time properties we harvest, in Wikidata property order.
export const TIME_PROPS = {
  P580: 'start', P582: 'end', P585: 'point',
  P569: 'birth', P570: 'death', P571: 'inception', P576: 'dissolved',
};

async function mwApi(base, params) {
  const u = new URL(base);
  const all = { format: 'json', origin: '*', ...params };
  for (const [k, v] of Object.entries(all)) u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`API ${r.status} (${u.hostname})`);
  return r.json();
}

// ---------------------------------------------------------------- search

export async function searchTitles(query) {
  if (MOCK) return mockSearch(query);
  const j = await mwApi(WIKI, {
    action: 'query', list: 'search', srsearch: query, srlimit: 8, srnamespace: 0,
  });
  return (j.query?.search || []).map((s) => ({ title: s.title }));
}

// ---------------------------------------------------------------- summaries

const summaryCache = new Map();

export async function fetchSummary(title) {
  if (MOCK) return mockSummary(title);
  if (summaryCache.has(title)) return summaryCache.get(title);
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Summary ${r.status}`);
  const j = await r.json();
  const s = {
    title: j.title || title,
    description: j.description || '',
    extract: j.extract || '',
    thumb: j.thumbnail?.source || null,
    url: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
  summaryCache.set(title, s);
  return s;
}

// ---------------------------------------------------------------- topic load

// Loads a topic: the article itself plus every article it links to, with
// Wikidata dates, types and notability (sitelink counts).
// Returns { title, qid, thumb, entities: [{qid,title,thumb,sitelinks,types,times}] }
export async function loadTopic(title, onProgress = () => {}) {
  if (MOCK) return mockLoadTopic(title, onProgress);

  // 1. The article itself: canonical title, QID, thumbnail.
  onProgress('Resolving article…');
  const selfJ = await mwApi(WIKI, {
    action: 'query', titles: title, redirects: 1,
    prop: 'pageprops|pageimages', ppprop: 'wikibase_item',
    piprop: 'thumbnail', pithumbsize: 240,
  });
  const selfPage = Object.values(selfJ.query?.pages || {})[0];
  if (!selfPage || selfPage.missing !== undefined || !selfPage.pageprops?.wikibase_item) {
    throw new Error(`No Wikidata entity found for “${title}”`);
  }
  const canonical = selfPage.title;
  const selfQid = selfPage.pageprops.wikibase_item;

  // 2. Linked articles (paged), each with QID + small thumbnail.
  const byQid = new Map();
  byQid.set(selfQid, { qid: selfQid, title: canonical, thumb: selfPage.thumbnail?.source || null, self: true });
  let cont = {};
  while (byQid.size < LINK_CAP) {
    const j = await mwApi(WIKI, {
      action: 'query', generator: 'links', titles: canonical,
      gpllimit: 'max', gplnamespace: 0, redirects: 1,
      prop: 'pageprops|pageimages', ppprop: 'wikibase_item',
      piprop: 'thumbnail', pithumbsize: 128,
      ...cont,
    });
    for (const p of Object.values(j.query?.pages || {})) {
      const qid = p.pageprops?.wikibase_item;
      if (qid && !byQid.has(qid)) {
        byQid.set(qid, { qid, title: p.title, thumb: p.thumbnail?.source || null });
      }
    }
    onProgress(`Collecting linked articles… ${byQid.size}`);
    if (!j.continue) break;
    cont = j.continue;
  }

  // 3. Wikidata: dates + types + sitelink counts for every QID.
  const qids = [...byQid.keys()];
  const entities = [];
  for (let i = 0; i < qids.length; i += SPARQL_CHUNK) {
    const chunk = qids.slice(i, i + SPARQL_CHUNK);
    onProgress(`Analyzing dates… ${Math.min(i + SPARQL_CHUNK, qids.length)} / ${qids.length}`);
    let rows;
    try {
      rows = await sparqlDates(chunk);
    } catch (e) {
      console.warn('SPARQL failed, falling back to wbgetentities', e);
      rows = await wbDates(chunk);
    }
    for (const row of rows) {
      const meta = byQid.get(row.qid);
      if (meta) entities.push({ ...meta, ...row });
    }
  }

  return { title: canonical, qid: selfQid, thumb: selfPage.thumbnail?.source || null, entities };
}

// Primary path: one SPARQL request per chunk returns only dated entities,
// with sitelink counts and all P31 types, in a compact payload.
async function sparqlDates(qids) {
  const values = qids.map((q) => `wd:${q}`).join(' ');
  const opt = Object.entries(TIME_PROPS)
    .map(([p, name]) => `OPTIONAL { ?item wdt:${p} ?${name} . }`)
    .join('\n  ');
  const bound = Object.values(TIME_PROPS).map((n) => `BOUND(?${n})`).join('||');
  const samples = Object.values(TIME_PROPS).map((n) => `(SAMPLE(?${n}) AS ?${n}_)`).join(' ');
  const query = `SELECT ?item ?sl ${samples} (GROUP_CONCAT(DISTINCT STRAFTER(STR(?type),"entity/");separator=",") AS ?types) WHERE {
  VALUES ?item { ${values} }
  ?item wikibase:sitelinks ?sl .
  ${opt}
  OPTIONAL { ?item wdt:P31 ?type . }
  FILTER(${bound})
} GROUP BY ?item ?sl`;
  const u = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`;
  const r = await fetch(u, { headers: { Accept: 'application/sparql-results+json' } });
  if (!r.ok) throw new Error(`SPARQL ${r.status}`);
  const j = await r.json();
  return (j.results?.bindings || []).map((b) => {
    const times = {};
    for (const name of Object.values(TIME_PROPS)) {
      const v = b[`${name}_`]?.value;
      if (v) times[name] = v;
    }
    return {
      qid: b.item.value.split('/').pop(),
      sitelinks: parseInt(b.sl?.value || '0', 10),
      types: (b.types?.value || '').split(',').filter(Boolean),
      times,
    };
  });
}

// Fallback path: plain Wikidata API, heavier payloads but very robust.
async function wbDates(qids) {
  const out = [];
  for (let i = 0; i < qids.length; i += WB_CHUNK) {
    const chunk = qids.slice(i, i + WB_CHUNK);
    const j = await mwApi(WD_API, {
      action: 'wbgetentities', ids: chunk.join('|'), props: 'claims|sitelinks',
    });
    for (const ent of Object.values(j.entities || {})) {
      if (!ent.claims) continue;
      const times = {};
      for (const [p, name] of Object.entries(TIME_PROPS)) {
        const c = (ent.claims[p] || []).find((x) => x.mainsnak?.datavalue?.value?.time);
        if (c) times[name] = c.mainsnak.datavalue.value.time;
      }
      if (!Object.keys(times).length) continue;
      out.push({
        qid: ent.id,
        sitelinks: Object.keys(ent.sitelinks || {}).length,
        types: (ent.claims.P31 || [])
          .map((c) => c.mainsnak?.datavalue?.value?.id)
          .filter(Boolean),
        times,
      });
    }
  }
  return out;
}
