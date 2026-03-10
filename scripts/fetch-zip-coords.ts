import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_PATH = path.join(process.cwd(), 'config', 'sample_zips.json');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'processed', 'sample_zip_coords.json');
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

async function fetchCoord(zip: string) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    countrycodes: 'us',
    postalcode: zip,
    limit: '1',
  });

  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': 'homevalueguessr/0.1 (contact: streetworth.dev@example)',
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim request failed for ${zip}: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>; 
  if (!data.length) {
    throw new Error(`No coordinate result for ZIP ${zip}`);
  }

  const { lat, lon, display_name } = data[0];
  return { lat: Number(lat), lon: Number(lon), label: display_name };
}

async function main() {
  const sampleConfig = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8')) as { zips: string[] };
  const coords: Record<string, { lat: number; lon: number; label: string }> = fs.existsSync(OUTPUT_PATH)
    ? (JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')).coords as Record<string, { lat: number; lon: number; label: string }>)
    : {};

  for (const zip of sampleConfig.zips) {
    const padded = zip.padStart(5, '0');
    if (coords[padded]) {
      console.log(`Using cached coords for ${padded}`);
      continue;
    }
    console.log(`Fetching coords for ${padded}...`);
    const coord = await fetchCoord(padded);
    coords[padded] = coord;
    await new Promise((resolve) => setTimeout(resolve, 1100)); // be nice to Nominatim
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        coords,
      },
      null,
      2
    )
  );
  console.log(`Wrote coordinates for ${Object.keys(coords).length} ZIPs to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
