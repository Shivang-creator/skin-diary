# Skin Diary

**Every skin app scores you once. This one tells you what changed your skin.**

Skin Diary is a longitudinal skin journal built on the Perfect Corp **YouCam AI
Skin Analysis API**. You photograph your face on a schedule, log the boring
variables next to it — sleep, water, stress, alcohol, a product change — and
after a couple of weeks it reports which of those factors actually track with
your skin metrics over time.

The value is in the **series and the correlation**, not in any single call. The
API is called repeatedly, over weeks, and the product is the analysis of what
comes back.

---

## The honesty rule

A tool that makes claims about your body is easy to make dishonest and hard to
make trustworthy. Three constraints are enforced in code, not in copy:

1. **Every claim carries its sample size.** A finding over 9 observations and a
   finding over 40 do not get to look alike. Nothing is reported at all below 8
   paired observations, however large the coefficient.
2. **The multiple-comparison problem is confronted, not hidden.** 7 factors × 7
   metrics × 3 lags is **147 hypotheses**. At p < 0.05 about 7 of them would
   look significant from pure noise. Every p-value is Benjamini-Hochberg
   corrected across the family actually tested, and the family size is printed
   on screen.
3. **Misses are shown alongside hits.** The insights page carries a register of
   all 147 tests, including everything that found nothing. Showing only the hits
   is how a tool like this becomes a horoscope.

The analysis is **deterministic arithmetic — no LLM, no model, no randomness**.
The same diary always produces the same findings.

---

## Unit budget — read this first

YouCam meters everything in *units*. This project was built against a hard
budget of **1,500 units**.

| SKU (from `GET /s2s/v2.0/credit/feature-cost`) | Cost |
| --- | --- |
| AI Skin Analysis, SD, 1–4 concerns | **9 units** / result |
| AI Skin Analysis, SD, 5–7 concerns | **12 units** / result |

Skin Diary requests **7 SD concerns → 12 units per capture**, which is the top
of the second tier: the most information per unit spent. That makes the budget
**1,500 ÷ 12 = 125 captures**.

Units are charged **only on a successful result**. A photo the engine rejects —
no face, too dark, face too small — costs nothing.

**Fixture mode is why that budget survived the build.** With no API key set, the
app runs entirely on a stored response in the exact shape of the real endpoint,
parsed by the exact same code (`parseSkinAnalysis`). The live and fixture paths
diverge only at the network call. Captures made this way are labelled
`SIMULATED` everywhere they appear and spend nothing.

```bash
npm run check:units      # balance + live price list. Spends nothing.
```

---

## The API integration

Skin Diary uses four YouCam endpoints. The analysis pipeline is asynchronous —
submit a task, poll for the result.

| Step | Endpoint |
| --- | --- |
| 1. Register the file | `POST /s2s/v2.0/file` → `file_id` + presigned PUT URL |
| 2. Upload the bytes | `PUT <presigned URL>` |
| 3. Start the task | `POST /s2s/v2.0/task/skin-analysis` → `task_id` |
| 4. Poll | `GET /s2s/v2.0/task/skin-analysis/{task_id}` until `success`/`error` |
| Balance | `GET /s2s/v1.0/client/credit` |
| Price list | `GET /s2s/v2.0/credit/feature-cost` |

Implementation notes that cost real debugging time to learn:

- **Calling the File API does not upload the file.** You must additionally `PUT`
  the bytes to the returned presigned URL. Skipping it fails later with an
  opaque 500. This is the single most common integration mistake and the docs
  warn about it in bold.
- **`format: "json"`** returns scores inline. The default `zip` returns a
  download URL for an archive containing `score_info.json` plus every mask PNG —
  more bytes and an extra round trip for data we would throw away.
- **HD and SD concerns cannot be mixed** in one `dst_actions` array; doing so
  returns `InvalidParameters`.
- **Store `raw_score`, not `ui_score`.** YouCam's own documentation says
  `ui_score` is adjusted upward for "beauty psychology". A diary trying to detect
  a 4-point change over six weeks needs the unmassaged number. Skin Diary keeps
  both but analyses only `raw_score`.
- **Polling must not be abandoned.** The docs warn a dropped task can expire and
  still be charged, so the client polls patiently with capped backoff.

### Which 7 of the 16 SD concerns, and why

`acne`, `redness`, `oiliness`, `moisture`, `radiance`, `texture`,
`dark_circle_v2`.

The other nine — wrinkles, firmness, age spots, eyelid droop, eye bags, tear
trough, skin type — are structural. They do not meaningfully move in six weeks,
so tracking them daily would add noise and cost units without adding
information.

All scores are 1–100 where **higher is better** (a redness score of 90 means
very little redness). Every generated sentence is phrased in terms of the
*score* rather than the *concern*, so the direction never inverts.

---

## The analysis

| Technique | Where it is used |
| --- | --- |
| **Spearman's ρ** | Numeric factors. Robust to one catastrophic day; catches monotone-but-nonlinear relationships. |
| **Welch's t-test** | Yes/no factors and product change-points. Unequal variance, because real diary groups never match. |
| **Lag search (0, 1, 2 days)** | Skin does not respond same-day. Last night's sleep is matched to this morning's face. |
| **Benjamini-Hochberg FDR** | Across all 147 tests. The corrected `q` is what drives the verdict, not raw `p`. |
| **Partial correlation on photo brightness** | Every surviving correlation is re-run holding measured photo brightness constant. If it collapses, the app says it was the lighting. |
| **Change-point test with washout** | A product change splits the diary; 14 days before vs 14 days after a 7-day washout, because nothing works on day one. |

### The lighting confound

The biggest validity threat to any photo diary is that you changed lamps, not
skin. Skin Diary measures **mean luma, contrast and warmth from the pixels in
your browser before upload**, stores them next to the reading, and then:

- warns when today's photo is >25 points off your usual brightness,
- warns when a metric correlates with photo brightness at |ρ| ≥ 0.5 — "those
  readings may be measuring your lighting, not your skin",
- re-runs every surviving finding with brightness partialled out and reports
  whether it survived.

---

## Demo data

A judge or a first-time visitor has zero history, and an empty product cannot
demonstrate a longitudinal one. The app therefore ships a **deterministic
synthetic six-week diary** (42 entries over a 46-day span, including 4
deliberately missed days) that loads on first visit and is labelled
`DEMO DATA` everywhere it appears. It is generated, never persisted, and never
mixed into a real diary. A one-click toggle switches to your own.

The demo is built from **documented planted relationships** and — importantly —
**two factors given no effect at all** (`dairy`, `sunscreen`). The test suite
asserts the engine recovers the real ones *and reports nothing for the null
ones*. On the shipped seed it finds 6 of 7 planted signals plus the product
change-point, and **zero false positives across the 42 hypotheses involving the
two null factors**.

The 7th planted signal (alcohol → redness) is genuinely underpowered at n=37 and
is correctly reported as "no clear signal". That is the system working.

---

## Running it

```bash
npm install
npm run dev            # http://localhost:3000 — fully usable with no API key
npm test               # 93 tests
npm run build
```

### With a real API key

```bash
cp .env.example .env.local
# paste your key from https://yce.perfectcorp.com/api-console/en/api-keys/
```

```
YOUCAM_API_KEY=...
YOUCAM_MODE=            # set to "fixture" to force fixture mode even with a key
```

The key is **server-side only**. It is read in `/api/analyze` and `/api/units`
and never reaches the browser. `.env*` is gitignored.

### Capture a real fixture

```bash
YOUCAM_API_KEY=... npm run capture:fixture -- ./selfie.jpg
```

Runs the real pipeline **once** (12 units), prints the balance before and after
so the true cost is observed rather than assumed, and freezes the response into
`src/lib/youcam/fixtures/skin-analysis-response.json` with a provenance block.
Everything else in the project then runs against that file.

The photo must be front-facing, short side ≥ 480px, under 10MB, with the face
filling more than 60% of the frame.

---

## Tests

```
npm test     # 93 tests, 3 files
```

- `src/lib/stats/stats.test.ts` — the distribution and correlation core.
  The incomplete beta is checked against the closed forms `I_x(1,1) = x` and
  `I_x(½,½) = (2/π)·asin(√x)`; Student's t is checked against the exact df=1
  (Cauchy), df=2 and df=3 closed forms to 11 decimal places, and against an
  independently written Python reference using Simpson integration rather than
  the continued fraction the implementation uses. Benjamini-Hochberg is checked
  against the textbook 10-hypothesis example.
- `src/lib/analysis/engine.test.ts` — ground-truth tests against the planted
  demo signals, the null-factor assertions, gap handling, and degenerate diaries.
- `src/lib/youcam/client.test.ts` — the polymorphic response parser, fixture
  integrity, and unit pricing.

---

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Vitest.

No database, no login, no analytics, no cookies. Entries live in
`localStorage`; photos are sent to YouCam for analysis and are never stored by
Skin Diary. No charting library — the plots are hand-drawn SVG, because the
factor-overlay form does not exist off the shelf and a library would have
shipped 100KB to draw seven polylines.

### Charting rules held throughout

- **One y-axis per plot.** A logged factor is never drawn on a second scale
  against a metric; it gets its own aligned strip sharing only the date axis.
  Two scales on one plot invent correlations that are not in the data.
- **Colour identifies a metric and nothing else** — never magnitude, rank or
  goodness. Status colours are reserved and always paired with a word.
- The categorical palette is validated for colour-vision deficiency
  (adjacent-pair ΔE ≥ 8 in both light and dark), with dark steps chosen for the
  dark surface rather than flipped.

---

## Limits

Surfaced in the product itself, on `/method` and on the insights page — not
buried in a README:

- **Correlation is not causation**, and no amount of self-tracking makes it so.
  The nights you sleep well are also the nights you drank less and ate earlier.
- **The camera is a confound.** Lighting, distance, lens and time of day move
  these scores, sometimes more than a genuinely good week does.
- **Small samples lie**, and two weeks is a small sample.
- **Self-reported logs are approximate**, which flattens real relationships and
  makes null results weaker evidence than they look.
- **The scores are a vendor's model, not ground truth** — estimates from one
  photograph, with their own error. A change of a point or two is inside it.
- **Not medical or dermatological advice.** Skin Diary does not diagnose
  anything and is not a substitute for a dermatologist.

---

Built for the YouCam API Skin AI & Apparel VTO Hackathon.
