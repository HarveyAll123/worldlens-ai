# Content and licensing

The WorldLens **code** is MIT-licensed. Data, text and media come from third parties under their own terms. This file records what is used, how, and what WorldLens does to respect each licence.

## News

- WorldLens stores and shows **headline, publisher, canonical URL, publication time, source country, language** and at most a short (≤600 character) provider snippet. It **never** stores or republishes full articles, never bypasses paywalls and never renders publisher HTML.
- Summaries are short and **derived** (written by WorldLens's AI tier from headlines, labelled as AI-generated), not copied.
- Publisher images (`og:image`/GDELT `socialimage`) are **hotlinked, never cached** (`cachingPermitted: false`), credited to the publisher, and link back to the article. Remove them if a publisher objects.
- GDELT is used as a discovery index under its open-data terms; it is not treated as ground truth.

## DEMO dataset

All demo current events, outlets, headlines and snippets are **fictional and written for this project** (MIT). They are titled `DEMO:`, use `.invalid` URLs, and must never be presented as real reporting.

## Curated historical events

Event titles, dates, coordinates and the short summaries / “why it mattered” texts in `packages/shared/src/data/historical-events.ts` are written by the WorldLens project (MIT) from general historical knowledge, cross-checked against the linked English Wikipedia articles. They are facts restated in our own words, not copied text.

## Wikipedia and Wikimedia Commons

- Wikipedia is linked as “Learn more”. When the summary API is reachable, up to ~420 characters of the article extract are shown with the attribution “From Wikipedia, CC BY-SA 4.0” and a link to the article.
- Lead images are shown **only** if they are hosted on Wikimedia Commons and Commons returns licence metadata. WorldLens displays creator/credit, licence name (+ licence URL when given) and links to the Commons file page. Images are hotlinked (`cachingPermitted: false`). Non-free (“fair use”) images hosted only on en.wikipedia are never displayed.
- Requests identify WorldLens with a User-Agent per the Wikimedia API policy.

## Natural Earth

Country outlines and the populated-places gazetteer are derived from Natural Earth (public domain), pinned to commit `ca96624a56bd078437bca8184e78163e5039ad19`. Modern boundaries are shown as depicted by Natural Earth (de facto); entities with disputed status/recognition are styled DISPUTED.

## historical-basemaps (GPL-3.0)

Historical border snapshots come from [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0), pinned to commit `da7a4b735ecef70aebdc9c73e409d8a2500d50f3`. To keep licences separate, the data is **not vendored** in this repository: the API fetches the pinned files at runtime (jsDelivr) and may cache simplified derivatives (optionally in R2). Derivatives remain GPL-3.0. The UI cites the dataset and snapshot year for every border view. The maps are explicitly work-in-progress, so WorldLens labels them APPROXIMATE.

`pnpm data:fetch-basemaps` downloads them into the git-ignored `apps/web/public/vendor/` for offline development, with a licence notice.

## Imagery and terrain

- MapTiler satellite imagery and terrain: shown with “© MapTiler © OpenStreetMap contributors” attribution in the globe credits; use is governed by your MapTiler plan.
- Natural Earth II raster (bundled with CesiumJS) is public domain.
- CesiumJS is Apache-2.0; its credit display is kept.

## Political-orientation ratings

No third-party rating dataset is bundled. Real publishers are `UNRATED`. If you import ratings (e.g. from a media-bias organisation), store their methodology, source URL, confidence and review date in `source_profiles` and comply with that provider's licence.

## Humanitarian organisations

Organisations such as IFRC, UNICEF and ReliefWeb (UN OCHA) are **linked for information only**. WorldLens does not process donations to them, is not affiliated with them and does not use their logos. The PayPal payee in this build is a **sandbox demo merchant**, not a charity.
