import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';

const RAW_FILENAME = 'Zip_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv';
const RAW_PATH = path.join(process.cwd(), 'data', 'raw', RAW_FILENAME);
const SAMPLE_PATH = path.join(process.cwd(), 'config', 'sample_zips.json');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'processed', 'sample_zip_values.json');

async function main() {
  if (!fs.existsSync(RAW_PATH)) {
    throw new Error(`Raw Zillow file missing at ${RAW_PATH}`);
  }

  const sampleConfig = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8')) as { zips: string[] };
  const targetZips = new Set(sampleConfig.zips.map((zip) => zip.padStart(5, '0')));

  const stats = { seen: 0, matched: 0 };
  const rows: Array<{
    zip: string;
    city: string;
    state: string;
    metro: string;
    county: string;
    latestValue: number;
  }> = [];
  let latestColumn: string | null = null;

  const parser = fs
    .createReadStream(RAW_PATH)
    .pipe(
      parse({
        columns: true,
        trim: true,
        skip_empty_lines: true,
      })
    );

  for await (const record of parser) {
    stats.seen += 1;

    if (!latestColumn) {
      const dateColumns = Object.keys(record).filter((key) => /\d{4}-\d{2}-\d{2}/.test(key));
      latestColumn = dateColumns.at(-1) ?? null;
      if (!latestColumn) {
        throw new Error('Could not determine latest month column in ZHVI file');
      }
    }

    const zip = String(record.RegionName ?? '').padStart(5, '0');
    if (!targetZips.has(zip)) continue;

    const rawValue = record[latestColumn];
    const latestValue = rawValue ? Number(rawValue) : NaN;
    if (Number.isNaN(latestValue)) continue;

    rows.push({
      zip,
      city: String(record.City ?? ''),
      state: String(record.State ?? record.StateName ?? ''),
      metro: String(record.Metro ?? ''),
      county: String(record.CountyName ?? ''),
      latestValue,
    });
    stats.matched += 1;
  }

  if (!rows.length) {
    throw new Error('No rows matched configured ZIP list. Did the ZIP codes change?');
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const payload = {
    period: latestColumn,
    generatedAt: new Date().toISOString(),
    zips: rows,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${rows.length} ZIP rows (${stats.matched}/${stats.seen}) to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
