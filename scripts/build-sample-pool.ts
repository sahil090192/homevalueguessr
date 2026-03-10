import fs from 'node:fs';
import path from 'node:path';

const VALUES_PATH = path.join(process.cwd(), 'data', 'processed', 'sample_zip_values.json');
const COORDS_PATH = path.join(process.cwd(), 'data', 'processed', 'sample_zip_coords.json');
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'data', 'sample_pool.json');

async function ensureStreetView(lat: number, lon: number): Promise<boolean> {
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
    const data = (await res.json()) as { status: string };
    if (data.status === 'OK') return true;
  }
  return false;
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

  const locations = [] as Array<{
    zip: string;
    city: string;
    state: string;
    metro: string;
    county: string;
    lat: number;
    lng: number;
    homeValue: number;
  }>;

  for (const zipRow of values.zips) {
    const coord = coords.coords[zipRow.zip];
    if (!coord) {
      console.warn(`Missing coordinates for ${zipRow.zip}, skipping`);
      continue;
    }
    const hasStreetView = await ensureStreetView(coord.lat, coord.lon);
    if (!hasStreetView) {
      console.warn(`No Street View coverage for ${zipRow.zip}, skipping`);
      continue;
    }
    locations.push({
      zip: zipRow.zip,
      city: zipRow.city,
      state: zipRow.state,
      metro: zipRow.metro,
      county: zipRow.county,
      lat: coord.lat,
      lng: coord.lon,
      homeValue: zipRow.latestValue,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
