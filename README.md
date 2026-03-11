# Home Value Guesser

Home Value Guesser is a bite-sized GeoGuessr riff: we drop you on a random U.S. block, you eyeball two Street View angles, and you guess the ZIP’s median home value. Five frenetic rounds later, you either bask in smug glory or get roasted by the app.

## What’s inside

| Layer | Highlights |
| --- | --- |
| **Frontend** | Next.js App Router, Tailwind CSS v4 preview, street imagery served via a tiny proxy for caching. |
| **Gameplay loop** | 5 rounds, logarithmic scoring, two Street View frames per round, summary card with sarcastic share text. |
| **Data** | Zillow ZHVI “typical home value” CSV → curated ZIP sample + Google Street View pano IDs cached locally. |

## Quick start

```bash
npm install
npm run dev
# http://localhost:3000
```

Create `.env.local`:

```
GOOGLE_STREETVIEW_KEY=your-static-street-view-key
ROUND_SECRET=long-random-string # optional but keeps round tokens stable across deploys
```

## Data workflow at a glance

1. **Download Zillow ZHVI**  
   Grab `Zip_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv` from [Zillow Research](https://www.zillow.com/research/data/) and place it in `data/raw/`.
2. **Select ZIP coverage**  
   Edit `config/sample_zips.json` to pin an explicit list or just set `limit` (default: 5,000 largest ZIPs by size rank).
3. **Transform + geocode**  
   ```bash
   npm run data:prepare   # builds data/processed/sample_zip_values.json
   npm run data:coords    # builds data/processed/sample_zip_coords.json
   ```
4. **Harvest Street View metadata & build the playable pool**  
   ```bash
   POOL_TARGET_COUNT=4000 \
   STREETVIEW_MAX_NEW_FETCHES=600 \
   npm run data:pool      # writes public/data/sample_pool.json
   ```

`data/processed/pano_metadata.json` (gitignored) stores pano IDs, coordinates, and freshness timestamps so subsequent runs only hit Google for uncached or expired ZIPs.

## Street View budgeting knobs

| Variable | Default | Why it matters |
| --- | --- | --- |
| `POOL_TARGET_COUNT` | ∞ | Stop the builder once you keep this many ZIPs. |
| `STREETVIEW_MAX_NEW_FETCHES` | ∞ | Caps *new* metadata calls per run so you control Google credit burn. Cached entries don’t count. |
| `STREETVIEW_CACHE_TTL_MS` | 30 days | Revalidate stale pano metadata without hammering locations every build. |
| `STREETVIEW_THROTTLE_MS` | 150 ms | Soft rate-limit between metadata calls. |
| `STREETVIEW_IMAGE_CACHE_TTL_MS` | 12 h | Server-side cache window for rendered static images. |

Gameplay itself requests 2 static images per round. At Google’s $7/1k static-image pricing, the free $200 credit covers roughly 28,000 image calls (≈2,800 full five-round games). The builder issues at most one metadata request per new ZIP.

## Development scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run lint` | ESLint check. |
| `npm run data:prepare` | Parse the Zillow CSV into normalized JSON. |
| `npm run data:coords` | Resolve ZIP → lat/lon/label via `us-zips` + `zipcodes`. |
| `npm run data:pool` | Merge values + coords, re-use pano cache, fetch new Street View metadata, and emit the playable pool. |

## Troubleshooting

- **“Round expired.”** Ensure `ROUND_SECRET` is set and consistent across serverless deployments; rounds are signed tokens rather than in-memory handles.
- **“Street View ghosted this block.”** When both imagery frames fail, the UI now surfaces a “Deal another street” button. Re-run `npm run data:pool` later to refresh pano metadata for stubborn ZIPs.
- **Huge repo diffs.** The pano metadata cache can be megabytes—keep it local by leaving `data/processed/pano_metadata.json` untracked.

## Deploying

The app is Vercel-ready: set `GOOGLE_STREETVIEW_KEY`, `ROUND_SECRET`, and ship. For self-hosting, run `npm run build && npm start` behind your platform of choice; everything the experience needs lives in `public/data/sample_pool.json`.
