import crypto from 'node:crypto';
import { LocationRecord, RoundHandle } from '@/types/game';

const TTL_MS = 10 * 60 * 1000;
const rounds = new Map<string, RoundHandle>();

function pruneExpired() {
  const now = Date.now();
  for (const [id, handle] of rounds.entries()) {
    if (now - handle.createdAt > TTL_MS) {
      rounds.delete(id);
    }
  }
}

export function createRound(location: LocationRecord): RoundHandle {
  pruneExpired();
  const handle: RoundHandle = {
    id: crypto.randomUUID(),
    location,
    createdAt: Date.now(),
    heading: Math.floor(Math.random() * 360),
  };
  rounds.set(handle.id, handle);
  return handle;
}

export function resolveRound(roundId: string): RoundHandle | null {
  const handle = rounds.get(roundId);
  if (!handle) return null;
  if (Date.now() - handle.createdAt > TTL_MS) {
    rounds.delete(roundId);
    return null;
  }
  rounds.delete(roundId);
  return handle;
}
