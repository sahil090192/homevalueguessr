import fs from 'node:fs';
import path from 'node:path';

const VALUES_PATH = path.join(process.cwd(), 'data', 'processed', 'sample_zip_values.json');
const COORDS_PATH = path.join(process.cwd(), 'data', 'processed', 'sample_zip_coords.json');
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'data', 'sample_pool.json');
const PANO_CACHE_PATH = path.join(process.cwd(), 'data', 'processed', 'pano_metadata.json');

type StreetViewMeta = {
  lat: number;
  lng: number;
  description?: string;
  panoId?: string;
};

type PanoCacheRecord =
  | { status: 'ok'; lat: number; lng: number; description?: string; panoId?: string; checkedAt: string }
  | { status: 'missing'; checkedAt: string };

const DISCOURAGED_KEYWORDS = ['highway', 'freeway', 'expressway', 'interstate', 'toll road', 'bridge', 'ramp'];
const CACHE_TTL_MS = Number(process.env.STREETVIEW_CACHE_TTL_MS ?? 1000 * 60 * 60 * 24 * 30);
const THROTTLE_MS = Number(process.env.STREETVIEW_THROTTLE_MS ?? 150);
const MAX_NEW_FETCHES = (() => {
  if (!process.env.STREETVIEW_MAX_NEW_FETCHES) return Infinity;
  const parsed = Number(process.env.STREETVIEW_MAX_NEW_FETCHES);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Infinity;
})();

async function fetchStreetViewMetadata(lat: number, lon: number): Promise<StreetViewMeta | null> {
  const key = process.env.GOOGLE_STREETVIEW_KEY;
  if (!key) {
    throw new Error('GOOGLE_STREETVIEW_KEY missing from environment');
  }
  for (const radius of [50, 150, 400]) {
    const params = new URLSearchParams({
      location: `${lat},${lon}`,
      source: 'outdoor',
      radius: radius.toString(),
      key,
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`);
    if (!res.ok) {
      console.warn('Street View metadata request failed', res.status, res.statusText);
      continue;
    }
    const data = (await res.json()) as {
      status: string;
      location?: { lat: number; lng: number; description?: string };
      copyright?: string;
      pano_id?: string;
    };
    if (data.status !== 'OK' || !data.location) continue;
    const description = data.location.description?.toLowerCase() ?? '';
    const looksHighway = DISCOURAGED_KEYWORDS.some((keyword) => description.includes(keyword));
    if (looksHighway) {
      continue;
    }
    return {
      lat: data.location.lat,
      lng: data.location.lng,
      description: data.location.description,
      panoId: data.pano_id,
    };
  }
  return null;
}

async function main() {
  const values = JSON.parse(fs.readFileSync(VALUES_PATH, 'utf8')) as {
    period: string;
    generatedAt: string;
    zips: Array<{
      zip: string;
      city: string;
      state: string;
      metro: string;
      county: string;
      latestValue: number;
    }>;
  };
  const coords = JSON.parse(fs.readFileSync(COORDS_PATH, 'utf8')) as {
    coords: Record<string, { lat: number; lon: number; label: string }>;
  };
  const panoCache: Record<string, PanoCacheRecord> = fs.existsSync(PANO_CACHE_PATH)
    ? (JSON.parse(fs.readFileSync(PANO_CACHE_PATH, 'utf8')) as Record<string, PanoCacheRecord>)
    : {};
  const now = Date.now();
  const targetCountEnv = process.env.POOL_TARGET_COUNT ? Number(process.env.POOL_TARGET_COUNT) : Infinity;
  const targetCount = Number.isFinite(targetCountEnv) && targetCountEnv > 0 ? targetCountEnv : Infinity;

  const locations = [] as Array<{
    zip: string;
    city: string;
    state: string;
    metro: string;
    county: string;
    lat: number;
    lng: number;
    homeValue: number;
    panoId?: string;
  }>;

  let reusedCache = 0;
  let missingCount = 0;
  let newFetches = 0;
  let skippedByCap = 0;

  for (const [index, zipRow] of values.zips.entries()) {
    const coord = coords.coords[zipRow.zip];
    if (!coord) {
      console.warn(`Missing coordinates for ${zipRow.zip}, skipping`);
      continue;
    }
    const cacheRecord = panoCache[zipRow.zip];
    const cacheFresh =
      cacheRecord && now - new Date(cacheRecord.checkedAt).getTime() < CACHE_TTL_MS ? cacheRecord : null;

    let metadata: StreetViewMeta | null = null;
    if (cacheFresh && cacheFresh.status === 'ok') {
      reusedCache += 1;
      metadata = {
        lat: cacheFresh.lat,
        lng: cacheFresh.lng,
        description: cacheFresh.description,
        panoId: cacheFresh.panoId,
      };
    } else if (cacheFresh && cacheFresh.status === 'missing') {
      missingCount += 1;
      metadata = null;
    } else {
      if (newFetches >= MAX_NEW_FETCHES) {
        skippedByCap += 1;
        if (skippedByCap === 1 && MAX_NEW_FETCHES !== Infinity) {
          console.warn(
            `Reached Street View lookup cap of ${MAX_NEW_FETCHES}. Remaining uncached ZIPs will be skipped this run.`
          );
        }
        continue;
      }
      metadata = await fetchStreetViewMetadata(coord.lat, coord.lon);
      panoCache[zipRow.zip] = metadata
        ? { status: 'ok', ...metadata, checkedAt: new Date().toISOString() }
        : { status: 'missing', checkedAt: new Date().toISOString() };
      newFetches += 1;
      await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
      if (!metadata) {
        missingCount += 1;
      }
    }

    if (!metadata) {
      if (!cacheFresh || cacheFresh.status !== 'missing') {
        console.warn(`No suitable Street View pano for ${zipRow.zip}, skipping`);
      }
      continue;
    }
    locations.push({
      zip: zipRow.zip,
      city: zipRow.city,
      state: zipRow.state,
      metro: zipRow.metro,
      county: zipRow.county,
      lat: metadata.lat,
      lng: metadata.lng,
      homeValue: zipRow.latestValue,
      panoId: metadata.panoId,
    });
    if (targetCount !== Infinity && locations.length >= targetCount) {
      console.log(`Reached target of ${targetCount} locations after processing ${index + 1} ZIPs.`);
      break;
    }
    if ((index + 1) % 100 === 0) {
      console.log(`Processed ${index + 1} ZIPs — kept ${locations.length} locations so far.`);
    }
  }

  if (!locations.length) {
    throw new Error('No usable locations for sample pool');
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    zhviPeriod: values.period,
    count: locations.length,
    locations,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${locations.length} sample locations to ${OUTPUT_PATH}`);
  fs.mkdirSync(path.dirname(PANO_CACHE_PATH), { recursive: true });
  fs.writeFileSync(PANO_CACHE_PATH, JSON.stringify(panoCache, null, 2));
  console.log(`Updated pano metadata cache at ${PANO_CACHE_PATH}`);
  console.log(
    `Street View metadata stats → reused cache: ${reusedCache}, new lookups: ${newFetches}, marked missing: ${missingCount}, skipped by cap: ${skippedByCap}`
  );
  if (MAX_NEW_FETCHES !== Infinity) {
    console.log(`New lookup cap was ${MAX_NEW_FETCHES}. Run again to keep filling once credits allow.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
