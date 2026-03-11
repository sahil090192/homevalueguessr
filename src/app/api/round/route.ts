import { NextResponse } from 'next/server';
import { getRandomLocation, getZhviLabel } from '@/lib/locationPool';
import { createRound } from '@/lib/roundStore';
import type { RoundPayload } from '@/types/game';

export async function GET() {
  try {
    const location = getRandomLocation();
    const round = createRound(location);
    const payload: RoundPayload = {
      roundId: round.id,
      heading: round.heading,
      location: {
        zip: location.zip,
        city: location.city,
        state: location.state,
        metro: location.metro,
        county: location.county,
        lat: location.lat,
        lng: location.lng,
        panoId: location.panoId,
        zhviLabel: getZhviLabel(),
      },
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('round endpoint error', error);
    return NextResponse.json({ error: 'Unable to fetch a round' }, { status: 500 });
  }
}
