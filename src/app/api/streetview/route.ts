import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const key = process.env.GOOGLE_STREETVIEW_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Missing Street View key' }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  const params = new URLSearchParams({
    size: '640x640',
    location: `${lat},${lng}`,
    source: 'outdoor',
    key,
    heading: searchParams.get('heading') ?? '0',
    pitch: searchParams.get('pitch') ?? '-5',
    fov: searchParams.get('fov') ?? '90',
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/streetview?${params.toString()}`);
  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch Street View' }, { status: 502 });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-store',
    },
  });
}
