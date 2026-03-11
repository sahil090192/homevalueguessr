# Home Value Guesser

Home Value Guesser is a bite-sized GeoGuessr riff: we drop you on a random U.S. block, you eyeball two Street View angles, and you guess the ZIP’s median home value. Five frenetic rounds later you either bask in smug glory or get roasted by the app.

- **Framework**: Next.js App Router + Tailwind CSS v4 preview
- **Data**: Zillow ZHVI “typical home value” filtered to the largest ZIPs (or a hand-picked list)
- **Imagery**: Google Street View Static API with pano IDs cached locally

## What’s inside

| Layer | Highlights |
| --- | --- |
| **Frontend** | Components tuned for quick play, a scoring ribbon, and a share-ready summary card. |
| **Gameplay loop** | 5 rounds, logarithmic scoring, two Street View frames per round, sarcastic post-game roasts. |
| **Data tooling** | Scripts to parse Zillow ZHVI, geocode ZIPs, harvest Street View metadata, and cache panoramas. |

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

Create `.env.local`:

```
GOOGLE_STREETVIEW_KEY=your-static-street-view-key
ROUND_SECRET=long-random-string # optional but keeps round tokens valid across deploys
```

## Data workflow

1. **Download Zillow ZHVI**  
   Grab `Zip_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv` from [Zillow Research](https://www.zillow.com/research/data/) and place it in `data/raw/`.
2. **Select ZIP coverage**  
   Edit `config/sample_zips.json` to list explicit ZIPs or set `limit` (default: 5,000 highest-pop ZIPs via SizeRank).
3. **Transform + geocode**  
   ```bash
   npm run data:prepare   # -> data/processed/sample_zip_values.json
   npm run data:coords    # -> data/processed/sample_zip_coords.json
   ```
4. **Harvest Street View metadata & build the pool**  
   ```bash
   # example: stop once we keep ~4000 locations and limit new Google calls
   POOL_TARGET_COUNT=4000 \
   STREETVIEW_MAX_NEW_FETCHES=600 \
   npm run data:pool      # -> public/data/sample_pool.json
   ```
   This step reuses cached pano metadata from `data/processed/pano_metadata.json` (gitignored), fetches new pano IDs only for uncached ZIPs, filters out obvious highways/ramps, and throttles Google requests.

Re-running `npm run data:pool` later tops up the pool while touching only expired/missing ZIPs. Watch the summary log for “reused cache / new lookups / skipped by cap” counts to keep credits in check.

## Street View budgeting knobs

| Variable | Default | Why it exists |
| --- | --- | --- |
| `POOL_TARGET_COUNT` | ∞ | Stop once that many playable ZIPs are captured. |
| `STREETVIEW_MAX_NEW_FETCHES` | ∞ | Hard cap on *new* metadata lookups per run so you can stay within daily or credit budgets. Cached entries don’t count. |
| `STREETVIEW_CACHE_TTL_MS` | 30 days | Revalidate pano metadata after this window; keeps coverage fresh without hammering Google. |
| `STREETVIEW_THROTTLE_MS` | 150 ms | Delay between metadata requests (be nice to the API). |
| `STREETVIEW_IMAGE_CACHE_TTL_MS` | 12 h | Server-side cache duration for rendered Street View frames. |

Gameplay itself requests two static images per round. With Google’s current $7/1k pricing, the inaugural $200 credit covers roughly 28,000 image calls—about 2,800 full five-round games. Building the dataset costs at most one metadata API call per new ZIP.

## Current dataset snapshot (Mar 11, 2026)

- `public/data/sample_pool.json` → **3,500** unique ZIPs with pano IDs and ZHVI values
- `data/processed/pano_metadata.json` → 3,500 good panoramas cached, 527 ZIPs flagged as “missing imagery”
- Runtime draws from a shuffled deck, so repeats only happen once the full pool cycles or you restart the server.

To scale further, run `npm run data:pool` with a higher `POOL_TARGET_COUNT` or `STREETVIEW_MAX_NEW_FETCHES` once you’re ready to spend more of the free credits.

## Development scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Launch the Next.js dev server. |
| `npm run lint` | ESLint (Next.js rules). |
| `npm run data:prepare` | Parse the Zillow CSV into normalized JSON. |
| `npm run data:coords` | Resolve ZIP → lat/lon/label using `us-zips` + `zipcodes`. |
| `npm run data:pool` | Merge values + coords, reuse pano cache, fetch new Street View metadata, and emit the playable pool. |

## Troubleshooting

- **“Round expired.”** Set a `ROUND_SECRET` so signed round tokens survive across serverless instances; we no longer rely on in-memory state.
- **“Street View ghosted this block.”** If both frames fail, the UI shows “Deal another street.” Still, run `npm run data:pool` occasionally to refresh pano metadata for stubborn ZIPs.
- **Game repeats quickly.** The loader shuffles a full deck; restarts re-shuffle. For even more variety, grow the pool with additional ZIPs.
- **Giant diffs.** `data/processed/pano_metadata.json` can be >1 MB; it stays untracked so repo history remains slim.

## Deploying

Vercel-ready: set `GOOGLE_STREETVIEW_KEY`, `ROUND_SECRET`, and deploy. For self-hosting, run `npm run build && npm start`; everything the client needs (ZHVI values, pano IDs, etc.) ships inside `public/data/sample_pool.json`.
