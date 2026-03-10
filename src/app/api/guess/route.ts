import { NextRequest, NextResponse } from 'next/server';
import { resolveRound } from '@/lib/roundStore';
import { formatCurrency, scoreGuess } from '@/lib/scoring';
import type { GuessRequest, GuessResult } from '@/types/game';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<GuessRequest>;
    if (!body?.roundId || typeof body.guess !== 'number') {
      return NextResponse.json({ error: 'roundId and guess are required' }, { status: 400 });
    }

    const round = resolveRound(body.roundId);
    if (!round) {
      return NextResponse.json({ error: 'Round expired. Start a new one.' }, { status: 410 });
    }

    const actual = round.location.homeValue;
    const { score, difference, percentageError, safeGuess } = scoreGuess(body.guess, actual);

    const payload: GuessResult = {
      roundId: round.id,
      actualValue: actual,
      formattedActual: formatCurrency(actual),
      guess: safeGuess,
      formattedGuess: formatCurrency(safeGuess),
      score,
      percentageError,
      difference,
      city: round.location.city,
      state: round.location.state,
      zip: round.location.zip,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('guess endpoint error', error);
    return NextResponse.json({ error: 'Unable to score guess' }, { status: 500 });
  }
}
