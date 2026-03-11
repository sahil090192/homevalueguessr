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
let deck: LocationRecord[] | null = null;
let deckIndex = 0;

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

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
  const shouldReset = !deck || deckIndex >= deck.length;
  if (shouldReset) {
    deck = shuffle([...pool.locations]);
    deckIndex = 0;
  }
  const next = deck![deckIndex];
  deckIndex += 1;
  return next;
}

export function getZhviLabel(): string {
  const pool = getPool();
  const period = pool.zhviPeriod ?? 'Unknown';
  const dt = new Date(period);
  if (Number.isNaN(dt.getTime())) return period;
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
