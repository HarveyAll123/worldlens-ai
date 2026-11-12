# Content and licensing

The WorldLens **code** is MIT-licensed. Data, text and media come from third parties under their own terms. This file records what is used, how, and what WorldLens does to respect each licence.

## News

- WorldLens stores and shows **headline, publisher, canonical URL, publication time, source country, language** and at most a short (≤600 character) provider snippet. It **never** stores or republishes full articles, never bypasses paywalls and never renders publisher HTML.
- Summaries are short and **derived** (written by WorldLens's AI tier from headlines, labelled as AI-generated), not copied.
- Publisher images (`og:image`/GDELT `socialimage`) are **hotlinked, never cached** (`cachingPermitted: false`), credited to the publisher, and link back to the article. Remove them if a publisher objects.
- GDELT is used as a discovery index under its open-data terms; it is not treated as ground truth.
- Where outlets are based (for outlets outside WorldLens's own publisher list) comes from Wikidata where it knows the outlet's website, else from GDELT's open list of news outlets by country (May 2018), credited on the event card where it is used. GDELT's list is a 2018 snapshot and can be out of date or wrong for an outlet; it says nothing about an outlet's politics.
- Outlet names, kinds, owners and left–right ratings for outlets outside the registry come from Wikidata (CC0; `pnpm data:publishers`). Ratings are Wikidata's community-edited "political alignment" statements, shown with their own words, a link to the item and low (or, with a cited source, medium) confidence. Commercial rating services were not used: AllSides' ratings are licensed for non-commercial use only (CC BY-NC 4.0), and Media Bias/Fact Check and Ad Fontes Media are proprietary.
- RSS: WorldLens fetches a fixed list of publisher feeds and stores only the headline, a ≤300-character snippet, the canonical URL, the publisher and the publication time. Links point to the publisher; nothing is republished, no images are copied from RSS, and no feed content is rendered as HTML. Each feed remains the publisher's content under its own terms; those terms were **not** reviewed individually for this build, and a feed can be removed on request.

## DEMO dataset

All demo current events, outlets, headlines and snippets are **fictional and written for this project** (MIT). They are titled `DEMO:`, use `.invalid` URLs, and must never be presented as real reporting.

## Curated historical events

Event titles, dates, coordinates and the short summaries / “why it mattered” texts in `packages/shared/src/data/historical-events.ts` are written by the WorldLens project (MIT) from general historical knowledge, cross-checked against the linked English Wikipedia articles. They are facts restated in our own words, not copied text.

## Wikipedia and Wikimedia Commons

- Wikipedia is linked as “Learn more”. When the summary API is reachable, up to ~420 characters of the article extract are shown with the attribution “From Wikipedia, CC BY-SA 4.0” and a link to the article.
- Lead images are shown **only** if they are hosted on Wikimedia Commons and Commons returns licence metadata. WorldLens displays creator/credit, licence name (+ licence URL when given) and links to the Commons file page. Images are hotlinked (`cachingPermitted: false`). Non-free (“fair use”) images hosted only on en.wikipedia are never displayed.
- Requests identify WorldLens with a User-Agent per the Wikimedia API policy.

## Natural Earth

Country outlines and the populated-places gazetteer are derived from Natural Earth (public domain), pinned to commit `ca96624a56bd078437bca8184e78163e5039ad19`. So are the place names on the globe and the shapes used to mark a place (`apps/web/public/data/places/`, `pnpm data:places`): cities, oceans and seas, lakes, rivers (joined across Natural Earth's numbered stretches and lake centrelines), mountain ranges and peaks, deserts and other landforms, with Natural Earth's own label zoom levels. Modern boundaries are drawn from Natural Earth's land boundary lines at 1:110m, 1:50m and 1:10m (picked by camera altitude) as depicted by Natural Earth (de facto); disputed lines and lines of control are styled DISPUTED.

The present-day ceasefire / control lines in the frontline layer (Korea, Kashmir, Golan, Cyprus, Western Sahara) are Natural Earth's "Line of control" boundary lines. Natural Earth gives only the geometry; their names, start dates and sides are WorldLens metadata in `packages/shared/src/data/frontlines.ts`.

## Front lines of past wars (WorldLens reconstruction)

The fronts that move with the timeline (Eastern Front 1941–45, the Western Front of both world wars, the Sino-Japanese front, Korea and others — `scripts/fronts/`) are **reconstructions computed by WorldLens**, not a dataset of surveyed lines: none exists under an open licence. Each is worked out from a list of places and the dates they changed hands (`packages/shared/src/fronts.ts` explains how). The dates are historical facts compiled for WorldLens from general reference works; each theatre lists Wikipedia articles where they can be checked. They have not been verified one by one against a single source: treat them as accurate to a few days, and the line between places as an interpolation (labelled RECONSTRUCTED in the data and "approximate" in the app and by the assistant). Coordinates come from Wikidata (CC0). The Vichy demarcation line is placed the same way, between towns known to lie on either side of it (about 20 km). Corrections are welcome: a wrong date is one line in a place list.

Where a theatre gives a front's course as a line (the limits of the German advance in Russia, the Rhine, the Alamein line …), the coordinates were sketched for WorldLens from general reference maps and are good to some ten or twenty kilometres; only the demarcation line in France, below, is a surveyed dataset.

Occupations of whole countries with no front worth drawing (Denmark 1940–45, the Channel Islands, Kuwait 1990–91 — `packages/shared/src/data/fronts/occupations.ts`) are WorldLens's own list of dates, each with the Wikipedia article where they can be checked.

The demarcation line between occupied and Vichy France (1940–42) follows the course published by the **Département de l'Ain** as open data — « Ligne de démarcation », data.gouv.fr/datasets/ligne-de-demarcation, **Licence Ouverte / Open Licence 2.0 (Etalab)** — stored in `scripts/fronts/data/demarcation-line.json` (retrieved 2026-11-12). The licence asks for the source and the date of the data to be named, as here.

The land mask that clips these lines to land is Natural Earth's land at 1:10m (public domain): `packages/shared/src/data/fronts/land-mask.json` (`pnpm data:land-mask`).

## OpenStreetMap coastline (ODbL)

The Territories layer keeps countries' colours on land with the world's coastline from **OpenStreetMap** — the "simplified land polygons" published by osmdata.openstreetmap.de (© OpenStreetMap contributors, **Open Database License 1.0**), retrieved 2026-11-12. `pnpm data:land` (`scripts/build-land.ts`) simplifies them further and cuts them into the files in `apps/web/public/data/land/` (`low.json` for the whole world, `c<x>_<y>.json` for cells of 5.625° loaded when the view is close). Those files are a database derived from OpenStreetMap and are offered under the same ODbL 1.0; the map credits "© OpenStreetMap contributors" in the Territories layer's description and with the map's other credits. Large lakes (1,000 km² and more) are cut out with Natural Earth's 1:10m lakes (public domain).

## OpenHistoricalMap (CC0)

In historical mode the globe draws dated country borders from OpenHistoricalMap (`apps/web/public/data/ohm/`, built by `pnpm data:ohm`): every `admin_level=2` boundary — states, colonies, protectorates, occupation regimes — that existed at some point since 1800, with OHM's `start_date` / `end_date`, so borders change on the exact day recorded. OHM data is CC0 1.0. Only borders on land are drawn — coastlines and maritime limits are left to the imagery, using a land mask built from Natural Earth's 1:10m land polygons (public domain) at build time. `pnpm data:audit-borders` checks every date OHM records a change on (1,691 dates since 1800) for border lines that stop inland. Historical lines are OHM contributors' reconstructions, often traced from modern data; coverage is uneven (for example, the General Government of occupied Poland and the 2014/2022 Russian-occupied areas of Ukraine are not in the snapshot). A few corrections are applied after download (`scripts/lib/ohm-patches.ts`, listed in `polities.json` → `patches`): year-only dates that drew an occupation regime months early (Reichskommissariat Ostland, Bezirk Bialystok), countries missing for a time (France and Belgium after their liberation in 1944, Romania in 1944–45), and gaps where a country ends and nothing covers its ground until a successor begins within three years — it is kept until then. The Territories layer fills these countries with colours chosen by WorldLens (`apps/web/src/globe/territoryColors.ts`); the shapes are OHM's. LIVE mode keeps Natural Earth's present-day lines; the AI's `get_border_at_date` tool still describes the historical-basemaps snapshots below.

**Corrections.** OpenHistoricalMap stays the source, but drawn day by day its record has holes: countries ended on a renaming with nothing mapped after, year-only dates, whole territories missing for decades (Egypt 1881–1914, the Soviet zone of Germany, Greenland 1945–53). `pnpm data:ohm-patch` (`scripts/lib/ohm-patches.ts`, run by `pnpm data:ohm`) applies WorldLens's corrections to the built files and lists every one in `polities.json`: `patches` (dates corrected, rows that are not countries removed, countries added with the outline of a neighbouring version of the same territory) and `carriedNotes` (ground painted with the outline of whoever holds it next or held it last, where the source maps nobody for up to five years, or as listed by hand — no border or label is drawn for it). These are WorldLens's editorial additions, released like the rest of the snapshot under CC0; they are not OpenHistoricalMap's data and should be reported upstream rather than relied on.

### Flags of historical countries

Clicking or searching a country shows the flag Wikidata records as in use on the selected date (property P41 with its start/end qualifiers, or the years in the flag's file name when a statement has none; when the item is a period of a state — "Fascist Italy" — the flag of the state it is part of, replaces or follows, named as such; an undated flag is never shown for a date before its dated flags end; with nothing in use that day, the nearest flag within five years is shown with its own dates, otherwise none), with the country's description, capital and English Wikipedia article (`apps/web/public/data/ohm/flags.json`, built by `pnpm data:flags`; Wikidata is CC0). The flag images are hotlinked from Wikimedia Commons — most are public domain — and each links to its Commons file page. Historical flags, including those of Nazi Germany and the Soviet Union, are shown unaltered as historical documentation. Which country a selection moves to when the date changes (predecessors, successors, the same country under another name) comes from Wikidata succession statements (`apps/web/public/data/ohm/succession.json`, `pnpm data:succession`; CC0).

## Wikidata (CC0)

The battle layer (`packages/shared/src/data/battles.json`, built by `pnpm data:battles`) holds battles, sieges, naval battles and offensives since 1800 from Wikidata: labels, descriptions, dates, coordinates, participants, locations and "part of" links. Wikidata's structured data is CC0 1.0, so no attribution is legally required; every record still links its Wikidata item, and to the English Wikipedia article when one exists (shown under that article's CC BY-SA 4.0 terms, as above). The records are Wikidata's statements, not curated by WorldLens, and are labelled with `provenance.provider = 'wikidata'`.

## historical-basemaps (GPL-3.0)

Historical border snapshots come from [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0), pinned to commit `da7a4b735ecef70aebdc9c73e409d8a2500d50f3`. To keep licences separate, the data is **not vendored** in this repository: the API fetches the pinned files at runtime (jsDelivr) and may cache simplified derivatives (optionally in R2). Derivatives remain GPL-3.0. The UI cites the dataset and snapshot year for every border view. The maps are explicitly work-in-progress, so WorldLens labels them APPROXIMATE.

`pnpm data:fetch-basemaps` downloads them into the git-ignored `apps/web/public/vendor/` for offline development, with a licence notice.

## Imagery and terrain

- MapTiler satellite imagery and terrain: shown with “© MapTiler © OpenStreetMap contributors” attribution in the globe credits; use is governed by your MapTiler plan.
- Natural Earth II raster (bundled with CesiumJS) is public domain.
- City lights on the night side: NASA GIBS “VIIRS_Night_Lights” (Suomi NPP VIIRS, 2016 composite), loaded at runtime from `gibs.earthdata.nasa.gov` with no key. NASA imagery is not copyrighted; GIBS asks for acknowledgement, given in the globe credits (“Night lights: NASA GIBS / VIIRS (2016)”). The app recolours the grey tiles to a warm lamp colour and, for past dates, thins them out (none before 1880) — it is an illustration of when electric lighting spread, not historical data.
- CesiumJS is Apache-2.0; its credit display is kept.

## Political-orientation ratings

No third-party rating dataset is bundled. Real publishers are `UNRATED`. If you import ratings (e.g. from a media-bias organisation), store their methodology, source URL, confidence and review date in `source_profiles` and comply with that provider's licence.

## Humanitarian organisations

Organisations such as IFRC, UNICEF and ReliefWeb (UN OCHA) are **linked for information only**. WorldLens does not process donations to them, is not affiliated with them and does not use their logos. The PayPal payee in this build is a **sandbox demo merchant**, not a charity.
