import fs from 'node:fs';
import path from 'node:path';
import { LocationRecord } from '@/types/game';

export type PoolData = {
  generatedAt: string;
  zhviPeriod: string;
  count: number;
  locations: LocationRecord[];
};

let cache: PoolData | null = null;

function loadPool(): PoolData {
  const poolPath = path.join(process.cwd(), 'public', 'data', 'sample_pool.json');
  if (!fs.existsSync(poolPath)) {
    throw new Error(`Sample pool missing at ${poolPath}. Run npm run data:pool.`);
  }
  const payload = JSON.parse(fs.readFileSync(poolPath, 'utf8')) as PoolData;
  if (!payload.locations?.length) {
    throw new Error('Pool has no locations. Did the build step filter everything out?');
  }
  cache = payload;
  return payload;
}

export function getPool(): PoolData {
  return cache ?? loadPool();
}

export function getRandomLocation(): LocationRecord {
  const pool = getPool();
  return pool.locations[Math.floor(Math.random() * pool.locations.length)];
}

export function getZhviLabel(): string {
  const pool = getPool();
  const period = pool.zhviPeriod ?? 'Unknown';
  const dt = new Date(period);
  if (Number.isNaN(dt.getTime())) return period;
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
