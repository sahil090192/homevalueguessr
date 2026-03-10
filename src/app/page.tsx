"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { GuessResult, RoundPayload } from "@/types/game";
import { formatCurrency } from "@/lib/scoring";

const TOTAL_ROUNDS = 5;
const QUICK_CHOICES = [180000, 320000, 550000, 850000, 1200000, 2000000];

type Stage = "intro" | "loading" | "guess" | "reveal" | "summary";

type HistoryEntry = {
  result: GuessResult;
};

async function fetchRound(): Promise<RoundPayload> {
  const res = await fetch("/api/round", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load round");
  return res.json();
}

async function submitGuess(roundId: string, guess: number): Promise<GuessResult> {
  const res = await fetch("/api/guess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roundId, guess }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? "Could not score guess");
  }
  return res.json();
}

export default function HomePage() {
  const [stage, setStage] = useState<Stage>("intro");
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeResult, setActiveResult] = useState<GuessResult | null>(null);
  const [guessInput, setGuessInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const progress = (history.length / TOTAL_ROUNDS) * 100;

  const totalScore = useMemo(() => history.reduce((sum, entry) => sum + entry.result.score, 0), [history]);

  const averageError = useMemo(() => {
    if (!history.length) return 0;
    const total = history.reduce((sum, entry) => sum + entry.result.percentageError, 0);
    return total / history.length;
  }, [history]);
  const totalScoreDisplay = history.length ? totalScore.toLocaleString() : "0";
  const averageErrorDisplay = history.length ? `${(averageError * 100).toFixed(1)}%` : "—";

  const streetViewUrl = round
    ? `/api/streetview?lat=${round.location.lat}&lng=${round.location.lng}&heading=${round.heading}&ts=${round.roundId}`
    : "";

  const handleStart = async () => {
    try {
      setStage("loading");
      setHistory([]);
      setActiveResult(null);
      setStatusMessage(null);
      const payload = await fetchRound();
      setRound(payload);
      setGuessInput("");
      setStage("guess");
    } catch (error) {
      setStatusMessage((error as Error).message);
      setStage("intro");
    }
  };

  const handleGuessSubmit = async () => {
    if (!round) return;
    const numeric = Number(guessInput.replace(/[^0-9]/g, ""));
    if (!numeric || numeric < 1000) {
      setStatusMessage("Enter at least $1,000 for your guess");
      return;
    }
    try {
      setIsSubmitting(true);
      setStatusMessage(null);
      const result = await submitGuess(round.roundId, numeric);
      setActiveResult(result);
      setHistory((prev) => [...prev, { result }]);
      setStage("reveal");
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (history.length >= TOTAL_ROUNDS) {
      setStage("summary");
      return;
    }
    try {
      setStage("loading");
      const payload = await fetchRound();
      setRound(payload);
      setActiveResult(null);
      setGuessInput("");
      setStatusMessage(null);
      setStage("guess");
    } catch (error) {
      setStatusMessage((error as Error).message);
      setStage("summary");
    }
  };

  const handleChip = (value: number) => {
    setGuessInput(String(value));
  };

  const displayRound =
    stage === "guess"
      ? Math.min(history.length + 1, TOTAL_ROUNDS)
      : Math.min(history.length, TOTAL_ROUNDS);
  const heading =
    stage === "intro"
      ? "StreetWorth beta"
      : stage === "summary"
        ? "Full tally"
        : `Round ${displayRound || 1} of ${TOTAL_ROUNDS}`;

  return (
    <div className="min-h-screen bg-[var(--sand)] text-[var(--ink)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 lg:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.1fr,0.9fr]">
          <section className="space-y-10">
            <div>
              <p className="text-sm uppercase tracking-[0.4em] text-[var(--ink-muted)]">homevalueguessr.com</p>
              <h1 className="mt-4 font-[family:var(--font-display)] text-4xl font-semibold leading-tight sm:text-5xl">
                Guess the street. Trust your housing gut.
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-[var(--ink-muted)]">
                We drop you somewhere residential in the United States. Use the curb appeal, rooflines, and gut feel to
                estimate the typical home value for that ZIP code. Accuracy earns points; hubris gets humbled.
              </p>
            </div>

            <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[8px_8px_0_var(--border-strong)]">
              <div className="flex items-center justify-between text-xs uppercase tracking-widest text-[var(--ink-muted)]">
                <span>{heading}</span>
                <span>{history.length} / {TOTAL_ROUNDS} streets</span>
              </div>
              <div className="mt-4 h-3 rounded-full bg-[#ddcdb6]">
                <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Total Score</p>
                  <p className="text-2xl font-semibold">{totalScoreDisplay}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Avg Error</p>
                  <p className="text-2xl font-semibold">{averageErrorDisplay}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">ZHVI period</p>
                  <p className="text-2xl font-semibold">{round?.location.zhviLabel ?? "Jan 2026"}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {stage === "intro" && (
                <button
                  onClick={handleStart}
                  className="w-full rounded-full border-2 border-[var(--border-strong)] bg-[var(--ink)] px-6 py-4 text-xl font-semibold uppercase tracking-wider text-[var(--sand)] shadow-[6px_6px_0_var(--border-strong)] transition hover:translate-x-1 hover:-translate-y-1"
                >
                  Start guessing
                </button>
              )}

              {stage !== "intro" && stage !== "summary" && (
                <div className="space-y-4">
                  <label className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Your guess</label>
                  <div className="flex items-center gap-4 rounded-2xl border border-[var(--border-strong)] bg-white px-5 py-4 shadow-[4px_4px_0_var(--border-strong)]">
                    <span className="text-lg font-semibold text-[var(--accent-dark)]">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full bg-transparent text-3xl font-semibold tracking-wide text-[var(--ink)] outline-none"
                      value={guessInput ? Number(guessInput).toLocaleString() : ""}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/[^0-9]/g, "");
                        setGuessInput(digits);
                      }}
                      placeholder="000,000"
                      disabled={stage === "loading" || stage === "reveal"}
                    />
                    <button
                      className="rounded-full border border-[var(--border-strong)] px-4 py-2 text-xs uppercase tracking-widest text-[var(--ink)]"
                      onClick={() => setGuessInput("")}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_CHOICES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className="rounded-full border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold tracking-wide text-[var(--ink-muted)] transition hover:bg-[var(--ink)] hover:text-[var(--sand)]"
                        onClick={() => handleChip(value)}
                      >
                        {formatCurrency(value)}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-4">
                    {stage === "guess" && (
                      <button
                        onClick={handleGuessSubmit}
                        disabled={isSubmitting}
                        className="flex-1 rounded-full border-2 border-[var(--border-strong)] bg-[var(--accent)] px-6 py-3 text-lg font-semibold uppercase tracking-wide text-white shadow-[4px_4px_0_var(--border-strong)] transition hover:-translate-y-0.5"
                      >
                        {isSubmitting ? "Scoring..." : "Lock it in"}
                      </button>
                    )}
                    {stage === "reveal" && (
                      <button
                        onClick={handleNext}
                        className="flex-1 rounded-full border-2 border-[var(--border-strong)] bg-[var(--ink)] px-6 py-3 text-lg font-semibold uppercase tracking-wide text-[var(--sand)] shadow-[4px_4px_0_var(--border-strong)] transition hover:-translate-y-0.5"
                      >
                        {history.length >= TOTAL_ROUNDS ? "See results" : "Next street"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {stage === "summary" && (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-[var(--border-strong)] bg-white px-6 py-5 shadow-[6px_6px_0_var(--border-strong)]">
                    <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Season report</p>
                    <p className="mt-3 text-4xl font-semibold">{totalScoreDisplay} pts</p>
                    <p className="mt-1 text-sm text-[var(--ink-muted)]">
                      Average error {averageErrorDisplay} over {history.length} streets.
                    </p>
                  </div>
                  <button
                    onClick={handleStart}
                    className="w-full rounded-full border-2 border-[var(--border-strong)] bg-[var(--accent)] px-6 py-4 text-lg font-semibold uppercase tracking-wider text-white shadow-[6px_6px_0_var(--border-strong)]"
                  >
                    Play again
                  </button>
                </div>
              )}

              {statusMessage && (
                <p className="text-sm font-semibold text-[var(--accent-dark)]">{statusMessage}</p>
              )}

              {stage === "reveal" && activeResult && (
                <div className="rounded-3xl border border-[var(--border-strong)] bg-white px-6 py-5 shadow-[4px_4px_0_var(--border-strong)]">
                  <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Reveal</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {activeResult.formattedActual} in {activeResult.city}, {activeResult.state} {activeResult.zip}
                  </p>
                  <p className="mt-1 text-lg text-[var(--ink-muted)]">
                    You guessed {activeResult.formattedGuess}. Error {(activeResult.percentageError * 100).toFixed(1)}%.
                  </p>
                  <p className="mt-3 text-sm uppercase tracking-wide text-[var(--ink-muted)]">Score</p>
                  <p className="text-4xl font-semibold text-[var(--jade)]">+{activeResult.score}</p>
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="overflow-hidden rounded-[28px] border border-[var(--border-strong)] bg-black shadow-[12px_12px_0_var(--border-strong)]">
              {round ? (
                <Image
                  src={streetViewUrl}
                  alt={`Street view for ${round.location.city}`}
                  width={800}
                  height={600}
                  className="h-[360px] w-full object-cover sm:h-[440px]"
                  priority
                  unoptimized
                />
              ) : (
                <div className="flex h-[360px] items-center justify-center bg-[#1d1d1d] text-white sm:h-[440px]">
                  Loading street imagery…
                </div>
              )}
            </div>
            {round && (
              <div className="rounded-3xl border border-[var(--border-strong)] bg-white px-5 py-4 shadow-[6px_6px_0_var(--border-strong)]">
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Locale dossier</p>
                <p className="mt-2 text-2xl font-semibold">
                  {round.location.city}, {round.location.state}
                </p>
                <p className="text-sm text-[var(--ink-muted)]">ZIP {round.location.zip} · {round.location.metro}</p>
                <p className="mt-3 text-xs uppercase tracking-widest text-[var(--ink-muted)]">County</p>
                <p className="text-lg font-medium">{round.location.county}</p>
              </div>
            )}
          </aside>
        </div>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-[family:var(--font-display)] text-2xl font-semibold">Round journal</h2>
            <p className="text-sm text-[var(--ink-muted)]">{history.length} completed</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {history.map(({ result }, index) => (
              <div
                key={result.roundId}
                className="rounded-2xl border border-[var(--border-strong)] bg-white px-5 py-4 shadow-[4px_4px_0_var(--border-strong)]"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-widest text-[var(--ink-muted)]">
                  <span>Round {index + 1}</span>
                  <span>+{result.score} pts</span>
                </div>
                <p className="mt-2 text-xl font-semibold">
                  {result.city}, {result.state} {result.zip}
                </p>
                <p className="text-sm text-[var(--ink-muted)]">
                  Actual {result.formattedActual} · You {result.formattedGuess}
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--jade)]">
                  Error {(result.percentageError * 100).toFixed(1)}%
                </p>
              </div>
            ))}
            {!history.length && (
              <p className="rounded-2xl border border-dashed border-[var(--border-strong)] px-5 py-6 text-sm text-[var(--ink-muted)]">
                Your guesses will collect here once you finish a street.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
