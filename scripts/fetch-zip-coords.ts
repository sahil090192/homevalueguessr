import fs from 'node:fs';
import path from 'node:path';
import zipcodes from 'zipcodes';
import usZips from 'us-zips';

const VALUES_PATH = path.join(process.cwd(), 'data', 'processed', 'sample_zip_values.json');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'processed', 'sample_zip_coords.json');

function lookupZip(zip: string) {
  const coord = (usZips as Record<string, { latitude: number; longitude: number }>)[zip];
  if (!coord) {
    throw new Error(`No coordinate result for ZIP ${zip}`);
  }
  const labelRow = zipcodes.lookup(zip);
  const label = labelRow ? `${labelRow.city}, ${labelRow.state}` : `ZIP ${zip}`;
  return {
    lat: coord.latitude,
    lon: coord.longitude,
    label,
  };
}

async function main() {
  if (!fs.existsSync(VALUES_PATH)) {
    throw new Error(`Run npm run data:prepare first to generate ${VALUES_PATH}`);
  }
  const values = JSON.parse(fs.readFileSync(VALUES_PATH, 'utf8')) as { zips: Array<{ zip: string }> };
  const coords: Record<string, { lat: number; lon: number; label: string }> = fs.existsSync(OUTPUT_PATH)
    ? (JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')).coords as Record<string, { lat: number; lon: number; label: string }>)
    : {};

  for (const { zip } of values.zips) {
    const padded = zip.padStart(5, '0');
    if (coords[padded]) {
      console.log(`Using cached coords for ${padded}`);
      continue;
    }
    console.log(`Resolving coords for ${padded}...`);
    const coord = lookupZip(padded);
    coords[padded] = coord;
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
