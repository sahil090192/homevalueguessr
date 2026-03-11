# Home Value Guesser

Guess the median home value for a U.S. ZIP code by eyeballing two Google Street View snapshots. Five rounds later you get roasted (or crowned) based on how tight your estimates were.

- **Framework**: Next.js App Router + Tailwind 4 preview
- **Data**: Zillow ZHVI (typical home value) filtered to the largest ZIPs
- **Imagery**: Google Street View Static API (pano IDs cached locally)

## Running the game locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

Add your Street View key to `.env.local`:

```
GOOGLE_STREETVIEW_KEY=your-google-key
```

## Building the data set

1. **Download ZHVI**: Grab `Zip_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv` from [Zillow’s data page](https://www.zillow.com/research/data/) and drop it in `data/raw/`.
2. **Pick ZIP coverage**: Edit `config/sample_zips.json` to list explicit ZIPs or set a `limit`. Default picks the top 5,000 ZIPs by Zillow size rank.
3. **Prepare values & coords**:
   ```bash
   npm run data:prepare   # parses the CSV into data/processed/sample_zip_values.json
   npm run data:coords    # resolves lat/lon for every ZIP in the sample
   ```
4. **Build the playable pool**:
   ```bash
   # example: cap new Google lookups per run + stop when we keep ~4k ZIPs
   POOL_TARGET_COUNT=4000 STREETVIEW_MAX_NEW_FETCHES=600 npm run data:pool
   ```
   This step:
   - reuses cached pano metadata from `data/processed/pano_metadata.json` (git‑ignored)
   - fetches fresh Street View metadata only for uncached ZIPs
   - skips locations whose metadata mentions obvious highways/ramps
   - writes the final pool to `public/data/sample_pool.json`

### Street View budgeting knobs

| Env var | Default | Purpose |
| --- | --- | --- |
| `POOL_TARGET_COUNT` | ∞ | Stop once we have this many playable ZIPs. |
| `STREETVIEW_MAX_NEW_FETCHES` | ∞ | Hard cap on *new* metadata lookups per run so you can stay under daily/credit thresholds. Cached ZIPs still work. |
| `STREETVIEW_CACHE_TTL_MS` | 30 days | How long to trust cached pano metadata before re-checking. |
| `STREETVIEW_THROTTLE_MS` | 150 ms | Delay between Google metadata calls to stay polite. |
| `STREETVIEW_IMAGE_CACHE_TTL_MS` | 12 h | Server-side cache for rendered Street View frames. |

Re-running `npm run data:pool` later will top up the playable set while only issuing Google requests for ZIPs whose cache expired or does not exist. Keep an eye on the terminal summary that reports how many lookups were reused, skipped, or newly billed that run.

## Current sample snapshot (Mar 11, 2026)

- `public/data/sample_pool.json` → **3,500** unique ZIPs with pano IDs
- Metadata cache → 3,500 valid panoramas, 527 ZIPs flagged as missing imagery
- Gameplay now draws from a shuffled “deck”, so you’ll only see repeats after the full pool cycles.

To scale further, run another `npm run data:pool` with a larger fetch cap (e.g., `STREETVIEW_MAX_NEW_FETCHES=800`). Each additional playable ZIP requires at most one metadata lookup plus the two runtime images that players request when a round actually surfaces that location.

## Troubleshooting

- **Images fail for certain ZIPs**: Most failures come from flaky Street View lat/lng lookups. Each round now ships the precise pano ID gathered during data prep; if Google still responds with an error we cache the failure for the TTL so it can be retried later rather than hammered repeatedly.
- **Rounds repeat quickly**: The pool loader now shuffles the entire list and deals locations sequentially. Restarting the server reshuffles.
- **Large data files**: The pano metadata cache lives in `data/processed/pano_metadata.json` and is ignored by git so you can grow it locally without bloating the repo.
