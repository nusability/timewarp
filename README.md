# 🌀 Timewarp

A timeline that isn't a line: a **colorful spiral floating through space**, onto
which the history of *any* Wikipedia topic is projected.

Search for an article — the article and everything it links to are analyzed
through **Wikidata's structured dates** (no AI involved), and every dated
person, war, event, place, organization, work or period lands in the right spot
on the spiral. Date ranges become arcs, one-time events become markers, top
events carry their Wikipedia thumbnail. Add several topics to compare them side
by side in parallel lanes. Click anything to open a detail drawer with the
article summary.

## Features

- **3D spiral band** — zoomable, rollable, viewable from any angle (drag to
  orbit, scroll to zoom, right-drag to pan)
- **Works for (mostly) everything** — no hardcoded topics; dates come from
  Wikidata claims: start/end, point in time, birth/death, inception/dissolution
- **Event-type filters** — People, Wars & conflicts, Events, Disasters,
  Places & polities, Organizations, Works, Periods, Calendar years, Other —
  derived from Wikidata "instance of" claims via a curated mapping
- **Notability ranking** — events are ranked by how many Wikipedia language
  editions cover them; a density control caps how many are shown
- **Multi-topic comparison** — up to 6 topics, each with its own colored lane
- **Detail drawer** — Wikipedia summary, image, dates and a link to the article
- **BCE support** — negative years welcome; try "Roman Empire"
- **No backend, no keys, no AI** — a fully static site talking directly to the
  public Wikipedia/Wikidata APIs from your browser

## Running

It's a static site — serve the repo root with any web server:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Append `?mock=1` to run against a bundled offline sample dataset (used for
tests and demos; no network needed).

## Deployment

Pushes to the main development branch deploy automatically to **GitHub Pages**
via `.github/workflows/deploy.yml`.

## How it works

1. **Search** — MediaWiki search API suggests articles.
2. **Harvest** — the chosen article's outgoing links are collected (up to
   1500), each with its Wikidata QID and thumbnail.
3. **Analyze** — a Wikidata SPARQL query (with a plain-API fallback) returns,
   for every linked entity that has any date claim: its dates, its "instance
   of" types and its sitelink count.
4. **Categorize & rank** — types map to filter categories; sitelink counts
   rank notability; the top events get labels and thumbnails.
5. **Render** — a Three.js helix maps `time → (angle, height, radius)`;
   ranges become ribbon arcs in the topic's lane, points become markers.

Data: [Wikipedia](https://www.wikipedia.org) & [Wikidata](https://www.wikidata.org).
Rendering: [three.js](https://threejs.org) (vendored, MIT).
