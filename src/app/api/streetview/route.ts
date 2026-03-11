import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';

const IMAGE_CACHE_TTL_MS = Number(process.env.STREETVIEW_IMAGE_CACHE_TTL_MS ?? 1000 * 60 * 60 * 12);
const imageCache = new Map<string, { buffer: Buffer; expiresAt: number }>();

export async function GET(request: NextRequest) {
  const key = process.env.GOOGLE_STREETVIEW_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Missing Street View key' }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const panoId = searchParams.get('pano');
  if (!panoId && (!lat || !lng)) {
    return NextResponse.json({ error: 'pano or lat/lng required' }, { status: 400 });
  }

  const heading = searchParams.get('heading') ?? '0';
  const pitch = searchParams.get('pitch') ?? '-5';
  const fov = searchParams.get('fov') ?? '90';
  const cacheKey = JSON.stringify({ panoId: panoId ?? null, lat, lng, heading, pitch, fov });
  const cached = imageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return new NextResponse(cached.buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=21600',
        'X-Cache': 'HIT',
      },
    });
  }
  if (cached && cached.expiresAt <= Date.now()) {
    imageCache.delete(cacheKey);
  }

  const params = new URLSearchParams({
    size: '640x640',
    source: 'outdoor',
    key,
    heading,
    pitch,
    fov,
  });
  if (panoId) {
    params.set('pano', panoId);
  } else if (lat && lng) {
    params.set('location', `${lat},${lng}`);
  }

  const response = await fetch(`https://maps.googleapis.com/maps/api/streetview?${params.toString()}`);
  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch Street View' }, { status: 502 });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  imageCache.set(cacheKey, { buffer, expiresAt: Date.now() + IMAGE_CACHE_TTL_MS });
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Cache': 'MISS',
    },
  });
}
