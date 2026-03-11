import crypto from 'node:crypto';
import { LocationRecord, RoundHandle } from '@/types/game';

const TTL_MS = 10 * 60 * 1000;
const TOKEN_VERSION = 1;
const SECRET = process.env.ROUND_SECRET ?? 'homevalueguessr-dev-secret';

type RoundTokenPayload = {
  v: number;
  issuedAt: number;
  expiresAt: number;
  heading: number;
  location: LocationRecord;
};

function encodeHandle(payload: RoundTokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function decodeHandle(token: string): RoundTokenPayload | null {
  const [data, rawSignature] = token.split('.');
  if (!data || !rawSignature) return null;
  let payloadJson: string;
  try {
    payloadJson = Buffer.from(data, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(rawSignature, 'base64url');
  } catch {
    return null;
  }
  const expectedSignature = crypto.createHmac('sha256', SECRET).update(data).digest();
  if (
    providedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(payloadJson) as RoundTokenPayload;
    if (payload.v !== TOKEN_VERSION) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createRound(location: LocationRecord): RoundHandle {
  const issuedAt = Date.now();
  const payload: RoundTokenPayload = {
    v: TOKEN_VERSION,
    issuedAt,
    expiresAt: issuedAt + TTL_MS,
    heading: Math.floor(Math.random() * 360),
    location,
  };
  const id = encodeHandle(payload);
  return {
    id,
    location,
    createdAt: issuedAt,
    heading: payload.heading,
  };
}

export function resolveRound(roundId: string): RoundHandle | null {
  const payload = decodeHandle(roundId);
  if (!payload) return null;
  if (Date.now() > payload.expiresAt) {
    return null;
  }
  return {
    id: roundId,
    location: payload.location,
    createdAt: payload.issuedAt,
    heading: payload.heading,
  };
}
