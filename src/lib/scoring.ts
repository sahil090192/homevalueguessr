export function scoreGuess(guess: number, actual: number) {
  const safeGuess = Math.max(guess, 1000);
  const ratio = safeGuess / actual;
  const logError = Math.abs(Math.log(ratio));
  const rawScore = 5000 - 2500 * logError;
  const score = Math.max(0, Math.round(rawScore));
  const difference = safeGuess - actual;
  const percentageError = Math.abs(difference) / actual;
  return { score, difference, percentageError, safeGuess };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
