# PayPal AI Hackathon 2026 — WorldLens

**Pitch.** WorldLens is a temporal world-intelligence globe: _understand_ what is happening and what led to it, _verify_ who is reporting it and how, then _act_ — with an AI assistant that operates the globe and a PayPal checkout that only a human can approve.

## What existed before vs. what was built during the hackathon

| Period                                                       | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before (commit `81f30a7`, 14 Oct 2026)                       | Repository created on GitHub with a two-line `README.md` (`# 3D_Globe`) and `.gitattributes`. No code.                                                                                                                                                                                                                                                                                                                                                                  |
| After 1 October 2026 (14 Oct 2026, commits `c211173` onward) | Everything else: the monorepo, shared temporal model and schemas, curated historical dataset and knowledge graph, news pipeline (GDELT ingestion, clustering, categorisation, geolocation), Worker API, AI agent and tool layer, PayPal v6 sandbox integration with webhooks, PostgreSQL/PostGIS migrations for Neon, the React/Cesium web app, adaptive performance manager, test suites (unit, integration, database, end-to-end, performance) and all documentation. |

Run `git log --stat` for the exact history. The application code was written with **Claude Code** (Anthropic's coding agent); commits carry a `Co-Authored-By: Claude` trailer.

## PayPal integration

| PayPal tool                                        | Used for                                                                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JavaScript SDK v6** (`@paypal/paypal-js/sdk-v6`) | `createInstance` → `findEligibleMethods` → `createPayPalOneTimePaymentSession` → `session.start({presentationMode:'auto'}, orderPromise)` behind PayPal's `<paypal-button>`             |
| **Orders API v2**                                  | server-side create (`intent: CAPTURE`, `NO_SHIPPING`, `PAY_NOW`), capture and get, all idempotent with `PayPal-Request-Id`                                                              |
| **OAuth 2.0 client credentials**                   | server-side access tokens, cached until expiry                                                                                                                                          |
| **Webhooks + verify-webhook-signature**            | order/capture lifecycle events, verified with PayPal before use, de-duplicated by event id once processed (a delivery whose processing failed is handled again on PayPal's retry)       |
| Agent Toolkit / MCP (evaluated)                    | not embedded at runtime — WorldLens deliberately gives the model no money-moving tools (see PROVIDERS.md); PayPal's MCP server is documented for developer inspection of sandbox orders |

**The Take Action flow** — on a humanitarian (DEMO) event, or when the user asks the assistant “I have $20. How can I help?”:

1. The assistant may call `find_action_options` (read-only) and `open_take_action`, which only **opens the review screen** with a suggested amount.
2. The review screen shows beneficiary, purpose, amount, and a **SANDBOX DEMO — NO REAL MONEY TRANSFERRED** banner. The user must tick an acknowledgement that the recipient is a demo merchant, not a charity.
3. The browser asks the API to create the order; the API re-validates the option, the amount, the reviewed terms and the sandbox environment. The client ID is public; the **secret never leaves the server**.
4. The user approves in PayPal's own window. The API captures the order and records the result from **PayPal's capture response** (status, capture id, amount). Only `CAPTURED` from PayPal produces a receipt; cancel and error paths say plainly that no payment was made.
5. Webhooks (when configured) reconcile later state changes (`PENDING`, `DENIED`, `REFUNDED`, `REVERSED`) through a strict state machine with compare-and-set updates, so a webhook racing the capture cannot overwrite a newer state.

Live mode is refused by this build (`PAYPAL_ENVIRONMENT` must be `sandbox`).

## AI integration

| AI use                                              | Model (configurable)                                   | Notes                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Assistant that operates the globe                   | `claude-opus-5-5` (`AI_MODEL_STRONG`), effort `medium` | Manual tool loop (≤6 iterations) over 11 read-only data tools and 8 globe tools, all Zod-validated twice (server, then browser) |
| Framing comparison (“how sources frame this event”) | strong model, effort `low`                             | Labels fact / claim / allegation / assessment per publisher, from headlines and snippets only; cached                           |
| Cluster summaries for live news                     | `claude-haiku-5-5` (`AI_MODEL_FAST`), effort `low`     | From headlines only; labelled with the model name and “may be incomplete”                                                       |

Tools are listed in `packages/shared/src/tools.ts`: data tools such as `search_events`, `get_event_sources`, `get_historical_context`, `get_border_at_date`, `compare_dates`, `find_action_options`, `get_payment_status`; globe tools such as `fly_to`, `set_time`, `return_to_live`, `highlight_region`, `open_event`, `toggle_layer`, `open_take_action`. **No tool can create, approve or capture a payment.** Nothing a model returns is executed as code.

Cost control: per-model price table, daily spend cap, per-client rate limit, prompt caching of the tool list and system prompt, output caching, usage at `GET /api/ai/usage`. **Without an API key** the app keeps working with a rule-based offline assistant that uses the same globe tools (try the prompts below).

## Demo instructions (≈ 3 minutes)

Setup: `pnpm install && pnpm dev:node`, open http://127.0.0.1:5173 (credentials optional — see MANUAL_SETUP.md).

1. **Understand · LIVE (0:00–0:40).** Point out the LIVE badge and UTC clock. Ask the assistant _“What is happening near Taiwan?”_ — it flies there and opens the (clearly labelled **DEMO**) Taiwan Strait event. Show source coverage and **Coverage Perspectives** (publishers mostly `UNRATED`; demo outlets carry an _illustrative_ rating with methodology).
2. **Verify (0:40–1:10).** Open “How sources frame this event” to compare claims, allegations and assessments. Open **Historical context · Then ↔ Now** and jump to a linked earlier event.
3. **Time travel (1:10–1:55).** Search _“Waterloo”_ → HISTORICAL MODE, 18 Jun 1815. Drag the navigator back to 1800 and show _Before 1800 — Coming Soon_. Ask _“Show me Germany's territorial changes between 1933 and 1945”_ — the assistant runs a guided tour with dated, **APPROXIMATE** border snapshots and cites the dataset. Press **Return to Live**.
4. **Act (1:55–2:50).** Ask _“I have $20. How can I help?”_ → the assistant proposes a sandbox option and opens the review screen. Tick the acknowledgement, press the PayPal button, log in with a **sandbox personal** account and approve. Show the receipt with PayPal's capture id, then the same payment in the sandbox merchant's activity. Mention: the AI cannot pay, only you can.
5. **Close (2:50–3:00).** Shift+D diagnostics (tier, FPS, decisions) — performance adapts to the device.

## Submission checklist

- [x] Functional application with PayPal and AI as meaningful parts of the flow
- [x] Open-source licence (MIT for code; data licences in CONTENT_LICENSING.md)
- [x] Clear setup instructions (README.md, MANUAL_SETUP.md, `.env.example`)
- [x] Explanation of AI tools used (this file, PROVIDERS.md, ARCHITECTURE.md)
- [x] Explanation of PayPal tools used (this file, PROVIDERS.md)
- [x] Automated tests for critical flows (`pnpm test`, `pnpm test:e2e`, `pnpm test:db`)
- [ ] Make the GitHub repository **public**
- [ ] Add PayPal **sandbox** credentials and complete one real sandbox payment end-to-end (until now verified only against PayPal test doubles — the build environment had no network access to PayPal)
- [ ] Register the webhook and confirm one verified delivery (simulator or real payment)
- [ ] Add `ANTHROPIC_API_KEY` and run the demo prompts against the real model; set a spend limit
- [ ] Optional: `VITE_MAPTILER_API_KEY` for satellite imagery and terrain; enable `GDELT_ENABLED` and confirm live ingestion
- [ ] Optional persistence on Neon (MANUAL_SETUP.md): create a Neon project, create the `worldlens_app` role with SQL (`create role worldlens_app with login;` + `\password worldlens_app` in psql), put the owner's direct connection string in `apps/api/.dev.vars` as `MIGRATION_DATABASE_URL` and run `pnpm db:migrate`, set the pooled `*.neon.tech` connection string for `worldlens_app` with `wrangler secret put DATABASE_URL`, and confirm `GET /api/health` reports `repository: "neon+memory"` and the `database` provider `ok` after the app has loaded events once; `repository: "memory"` with `database` `down` means the URL was rejected (see its `lastError`). Until now tested only against a local PostgreSQL 16 + PostGIS 3 — the build environment could not reach Neon
- [ ] Deploy (DEPLOYMENT.md) and put the **hosted URL** in README.md
- [ ] Record the **YouTube demo (< 3 minutes)** following the script above and link it in README.md
- [ ] Measure performance on a real GPU (`PW_GPU=1`, see PERFORMANCE.md) before quoting any FPS figure
