"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GuessResult, RoundPayload } from "@/types/game";
import { formatCurrency } from "@/lib/scoring";

const TOTAL_ROUNDS = 5;
const QUICK_CHOICES = [180000, 320000, 550000, 850000, 1200000, 2000000];
const HEADING_OFFSETS = [0, 120];
const MIN_GUESS = 50000;
const MAX_GUESS = 2000000;
const DEFAULT_GUESS = 420000;
const DIAL_SWEEP_DEG = 300;
const SCORE_BANDS = [
  { label: "Laser accurate", error: "0 – 10% error", points: "≈ 4.5k – 5k pts" },
  { label: "Dialed in", error: "10 – 25%", points: "≈ 3k – 4.5k pts" },
  { label: "Close-ish", error: "25 – 50%", points: "≈ 1k – 3k pts" },
  { label: "Wild swing", error: "50%+", points: "0 – 1k pts" },
];
const PRAISE_QUOTES = [
  "You're pricing blocks like you siphoned Zillow’s API straight into your veins.",
  "That median read was so clean the county assessor just asked you for notes.",
  "Your gut just dunked on every Zestimate within a five-mile radius.",
  "Realtors hate how fast you spotted that neighborhood flex.",
];
const ROAST_QUOTES = [
  "You priced that cul-de-sac like every ranch came with a private helipad.",
  "That guess missed so wide the MLS opened a missing-property case.",
  "Zillow spit out its latte and asked if you were okay.",
  "Mortgage bankers just added you to the entertainment column in their dashboards.",
];

const errorTier = (percentageError: number) => {
  if (percentageError <= 0.1) return "elite";
  if (percentageError <= 0.25) return "solid";
  if (percentageError <= 0.5) return "meh";
  return "miss";
};

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
  const [guessValue, setGuessValue] = useState(DEFAULT_GUESS);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [imageryError, setImageryError] = useState(false);
  const imageErrorCountRef = useRef(0);
  const dialRef = useRef<HTMLDivElement>(null);
  const [isDialDragging, setIsDialDragging] = useState(false);

  const progress = (history.length / TOTAL_ROUNDS) * 100;

  const totalScore = useMemo(() => history.reduce((sum, entry) => sum + entry.result.score, 0), [history]);

  const averageError = useMemo(() => {
    if (!history.length) return 0;
    const total = history.reduce((sum, entry) => sum + entry.result.percentageError, 0);
    return total / history.length;
  }, [history]);
  const summaryComment = useMemo(() => {
    if (!history.length) return "";
    const pool = averageError < 0.2 ? PRAISE_QUOTES : ROAST_QUOTES;
    const seed = (totalScore + history.length) % pool.length;
    return pool[seed];
  }, [averageError, history.length, totalScore]);
  const totalScoreDisplay = history.length ? totalScore.toLocaleString() : "0";
  const averageErrorDisplay = history.length ? `${(averageError * 100).toFixed(1)}%` : "—";
  const isPlaying = stage === "guess" || stage === "reveal" || stage === "loading";

  const clampGuess = useCallback((raw: number) => {
    const clamped = Math.min(MAX_GUESS, Math.max(MIN_GUESS, raw));
    return Math.round(clamped / 1000) * 1000;
  }, []);

  const dialAngle = useMemo(() => {
    const pct = (guessValue - MIN_GUESS) / (MAX_GUESS - MIN_GUESS);
    return pct * DIAL_SWEEP_DEG - DIAL_SWEEP_DEG / 2;
  }, [guessValue]);

  const dialTicks = useMemo(() => {
    const stops = [MIN_GUESS, 250000, 500000, 750000, 1000000, 1500000, MAX_GUESS];
    return stops.map((value) => {
      const pct = (value - MIN_GUESS) / (MAX_GUESS - MIN_GUESS);
      const angle = pct * DIAL_SWEEP_DEG - DIAL_SWEEP_DEG / 2;
      return { value, angle };
    });
  }, []);

  const pointerToGuessValue = useCallback(
    (clientX: number, clientY: number) => {
      if (!dialRef.current) return null;
      const rect = dialRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angleRad = Math.atan2(clientY - centerY, clientX - centerX);
      const rawDeg = (angleRad * 180) / Math.PI + 90; // 0° at top
      let normalizedDeg = ((rawDeg + 540) % 360) - 180; // map to [-180, 180]
      const halfSweep = DIAL_SWEEP_DEG / 2;
      normalizedDeg = Math.min(Math.max(normalizedDeg, -halfSweep), halfSweep);
      const pct = (normalizedDeg + halfSweep) / DIAL_SWEEP_DEG;
      const rawValue = MIN_GUESS + pct * (MAX_GUESS - MIN_GUESS);
      return clampGuess(rawValue);
    },
    [clampGuess]
  );

  const updateDialFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const next = pointerToGuessValue(clientX, clientY);
      if (next !== null) {
        setGuessValue(next);
      }
    },
    [pointerToGuessValue]
  );

  const handleDialPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDialDragging(true);
      updateDialFromPointer(event.clientX, event.clientY);
    },
    [updateDialFromPointer]
  );

  const handleDialPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDialDragging) return;
      updateDialFromPointer(event.clientX, event.clientY);
    },
    [isDialDragging, updateDialFromPointer]
  );

  const handleDialPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDialDragging(false);
  }, []);

  const nudgeGuess = useCallback(
    (delta: number) => {
      setGuessValue((prev) => clampGuess(prev + delta));
    },
    [clampGuess]
  );

  const streetViewUrls = useMemo(() => {
    if (!round) return [];
    return HEADING_OFFSETS.map((offset) => {
      const heading = (round.heading + offset + 360) % 360;
      const params = new URLSearchParams({
        lat: String(round.location.lat),
        lng: String(round.location.lng),
        heading: heading.toString(),
      });
      if (round.location.panoId) {
        params.set("pano", round.location.panoId);
      }
      return {
        heading,
        url: `/api/streetview?${params.toString()}`,
      };
    });
  }, [round]);
  useEffect(() => {
    setImageryError(false);
    imageErrorCountRef.current = 0;
  }, [round?.roundId]);

  const flagImageryFailure = useCallback(() => {
    const next = imageErrorCountRef.current + 1;
    imageErrorCountRef.current = next;
    if (next >= HEADING_OFFSETS.length) {
      setImageryError(true);
      setStatusMessage("Street View ghosted this block. Swap in another street.");
    }
  }, []);

  const handleSwapRound = useCallback(async () => {
    try {
      setStage("loading");
      setStatusMessage("Grabbing a new block with actual imagery…");
      const payload = await fetchRound();
      setRound(payload);
      setActiveResult(null);
      setGuessValue(DEFAULT_GUESS);
      setImageryError(false);
      imageErrorCountRef.current = 0;
      setStatusMessage(null);
      setStage("guess");
    } catch (error) {
      setStatusMessage((error as Error).message);
      setStage("guess");
    }
  }, []);

  const handleStart = async () => {
    try {
      setStage("loading");
      setHistory([]);
      setActiveResult(null);
      setStatusMessage(null);
      setShareFeedback(null);
      setGuessValue(DEFAULT_GUESS);
      const payload = await fetchRound();
      setRound(payload);
      setStage("guess");
    } catch (error) {
      setStatusMessage((error as Error).message);
      setStage("intro");
    }
  };

  const handleGuessSubmit = async () => {
    if (!round) return;
    const numeric = guessValue;
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
      setGuessValue(DEFAULT_GUESS);
      setStatusMessage(null);
      setStage("guess");
    } catch (error) {
      setStatusMessage((error as Error).message);
      setStage("summary");
    }
  };

  const handleChip = (value: number) => {
    setGuessValue(clampGuess(value));
  };
  const guessDisabled = stage === "loading" || stage === "reveal" || imageryError;

  const displayRound =
    stage === "guess"
      ? Math.min(history.length + 1, TOTAL_ROUNDS)
      : Math.min(history.length, TOTAL_ROUNDS);
  const heading =
    stage === "intro"
      ? "Home Value Guesser beta"
      : stage === "summary"
        ? "Full tally"
        : `Round ${displayRound || 1} of ${TOTAL_ROUNDS}`;

  const progressTrail = useMemo(
    () =>
      Array.from({ length: TOTAL_ROUNDS }, (_, index) => {
        const entry = history[index];
        if (entry) {
          return {
            state: "done" as const,
            tier: errorTier(entry.result.percentageError),
            score: entry.result.score,
          };
        }
        if (index === history.length && stage !== "summary") {
          return { state: "active" as const };
        }
        return { state: "pending" as const };
      }),
    [history, stage]
  );

  const handleShare = async () => {
    const sharePayload = `I pulled ${totalScoreDisplay} pts with ${averageErrorDisplay} avg error on Home Value Guesser. Think you can read a block better? https://homevalueguesser.com`;
    try {
      if (navigator.share) {
        await navigator.share({ text: sharePayload });
        setShareFeedback("Sent. Enjoy their indignation.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(sharePayload);
        setShareFeedback("Copied share text—drop it wherever you lurk.");
      } else {
        setShareFeedback(sharePayload);
      }
    } catch (error) {
      console.error(error);
      setShareFeedback("Share canceled. Roast remains private… for now.");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--sand)] text-[var(--ink)]">
      {stage === "intro" && (
        <section className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-xs uppercase tracking-[0.6em] text-[var(--ink-muted)]">Home Value Guesser</p>
          <h1 className="font-[family:var(--font-display)] text-5xl font-semibold leading-tight sm:text-6xl">
            Two glances. One gut call. Guess the ZIP’s typical home value.
          </h1>
          <p className="max-w-2xl text-lg text-[var(--ink-muted)]">
            We drop you on a random U.S. block with two crisp Street View frames. You channel your inner housing nerd and
            estimate the ZIP’s median home value. Five rounds later, you’re either smug or humbled.
          </p>
          <button
            onClick={handleStart}
            className="rounded-full border-4 border-[var(--border-strong)] bg-gradient-to-r from-[#f26b38] to-[#f24976] px-12 py-5 text-2xl font-semibold uppercase tracking-[0.4em] text-white shadow-[10px_10px_0_var(--border-strong)] transition hover:-translate-y-1 hover:translate-x-1"
          >
            Play Home Value Guesser
          </button>
          <p className="text-sm uppercase tracking-[0.4em] text-[var(--ink-muted)]">5 rounds · 2 glimpses each · roast included</p>
          <details className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-white/70 p-4 text-left text-sm text-[var(--ink-muted)]">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.4em]">Scoring, if you’re curious</summary>
            <div className="mt-3 space-y-2 text-xs leading-relaxed">
              <p>
                Score = max(0, 5000 − 2500 × |ln(guess / actual)|). Translation: missing an expensive ZIP hurts just as much as
                butchering a modest one.
              </p>
              <ul className="space-y-1">
                {SCORE_BANDS.map((band) => (
                  <li key={band.label} className="flex justify-between">
                    <span className="font-semibold">{band.label}</span>
                    <span>{band.points}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </section>
      )}

      {isPlaying && (
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
            <section className="space-y-6">
              <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[8px_8px_0_var(--border-strong)]">
                <div className="flex items-center justify-between text-xs uppercase tracking-widest text-[var(--ink-muted)]">
                  <span>{heading}</span>
                  <span>
                    {history.length}/{TOTAL_ROUNDS} streets
                  </span>
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
                <div className="mt-6 flex gap-2">
                  {progressTrail.map((item, index) => {
                    if (item.state === "done") {
                      const tone =
                        item.tier === "elite"
                          ? "bg-[var(--jade)]"
                          : item.tier === "solid"
                            ? "bg-[var(--accent)]"
                            : item.tier === "meh"
                              ? "bg-[#c5a05a]"
                              : "bg-[#a05151]";
                      return (
                        <div
                          key={`round-${index}`}
                          aria-label={`Round ${index + 1} complete`}
                          className={`h-6 flex-1 rounded-full border border-[var(--border-strong)] ${tone}`}
                        />
                      );
                    }
                    if (item.state === "active") {
                      return (
                        <div
                          key={`round-${index}`}
                          aria-label={`Round ${index + 1} in progress`}
                          className="h-6 flex-1 rounded-full border border-dashed border-[var(--border-strong)] bg-white"
                          style={{ opacity: 0.8 }}
                        />
                      );
                    }
                    return (
                      <div
                        key={`round-${index}`}
                        aria-label={`Round ${index + 1} pending`}
                        className="h-6 flex-1 rounded-full border border-[var(--border-soft)] bg-white/60"
                      />
                    );
                  })}
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Your guess</label>
                  {round && (
                    <span className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-[10px] uppercase tracking-[0.4em] text-[var(--ink-muted)]">
                      Median target · ZIP {round.location.zip}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                  <div className="flex flex-col items-center gap-4">
                    <div className="text-center">
                      <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Dialed-in guess</p>
                      <p className="mt-1 text-4xl font-semibold tracking-tight">{formatCurrency(guessValue)}</p>
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">drag the bezel or tap nudges</p>
                    </div>
                    <div
                      ref={dialRef}
                      role="slider"
                      aria-valuemin={MIN_GUESS}
                      aria-valuemax={MAX_GUESS}
                      aria-valuenow={guessValue}
                      aria-valuetext={formatCurrency(guessValue)}
                      aria-label="Guess dial"
                      className="relative h-64 w-64 rounded-full border-[6px] border-[var(--border-strong)] bg-gradient-to-br from-[#fff9f0] via-[#fff2e3] to-[#ffe3cc] shadow-[0_20px_60px_rgba(36,8,0,0.18)] transition-transform duration-300 ease-out"
                      onPointerDown={handleDialPointerDown}
                      onPointerMove={handleDialPointerMove}
                      onPointerUp={handleDialPointerUp}
                      onPointerLeave={handleDialPointerUp}
                    >
                      <div className="absolute inset-5 rounded-full border border-[var(--border-soft)] bg-white/40 backdrop-blur-[2px]" />
                      {dialTicks.map((tick) => (
                        <div
                          key={tick.value}
                          className="pointer-events-none absolute left-1/2 top-1/2"
                          style={{ transform: `rotate(${tick.angle}deg)` }}
                        >
                          <div className="flex flex-col items-center" style={{ transform: "translate(-50%, -130px)" }}>
                            <span className="block h-6 w-[2px] rounded-full bg-[var(--border-strong)]" />
                            <span
                              className="mt-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--ink-muted)]"
                              style={{ transform: `rotate(${-tick.angle}deg)` }}
                            >
                              {tick.value >= 1000000 ? `${(tick.value / 1000000).toFixed(1)}M` : `${Math.round(tick.value / 1000)}k`}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div
                          className="h-[45%] w-1 origin-bottom rounded-full bg-[var(--accent-dark)] shadow-[0_0_30px_rgba(0,0,0,0.2)]"
                          style={{ transform: `rotate(${dialAngle}deg)` }}
                        />
                      </div>
                      <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60 bg-[var(--ink)] shadow-[0_10px_30px_rgba(0,0,0,0.25)]" />
                      <div className="pointer-events-none absolute inset-10 flex flex-col items-center justify-center text-center">
                        <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--ink-muted)]">swirl to roam</p>
                        <p className="font-semibold text-[var(--accent-dark)]">{isDialDragging ? "Adjusting…" : "Locked"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {[-50000, -10000, 10000, 50000].map((delta) => (
                        <button
                          key={delta}
                          type="button"
                          className="rounded-full border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--ink)] transition hover:bg-[var(--ink)] hover:text-[var(--sand)]"
                          onClick={() => nudgeGuess(delta)}
                          disabled={guessDisabled}
                        >
                          {delta > 0 ? `+${(delta / 1000).toFixed(0)}k` : `${(delta / 1000).toFixed(0)}k`}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="rounded-full border border-dashed border-[var(--border-strong)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--ink-muted)]"
                        onClick={() => setGuessValue(DEFAULT_GUESS)}
                        disabled={guessDisabled}
                      >
                        Reset dial
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-3">
                    <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Quick drops</p>
                    <div className="grid grid-cols-2 gap-2">
                      {QUICK_CHOICES.map((value) => (
                        <button
                          key={value}
                          type="button"
                          className="rounded-2xl border border-[var(--border-strong)] bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.3em] text-[var(--ink)] shadow-[3px_3px_0_var(--border-strong)] transition hover:-translate-y-0.5 hover:bg-[var(--ink)] hover:text-[var(--sand)]"
                          onClick={() => handleChip(value)}
                          disabled={guessDisabled}
                        >
                          {formatCurrency(value)}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--ink-muted)]">
                      Range {formatCurrency(MIN_GUESS)} – {formatCurrency(MAX_GUESS)} · increments of $1k for tactile control.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  {stage === "guess" && (
                    <button
                      onClick={handleGuessSubmit}
                      disabled={isSubmitting || guessDisabled}
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
                      {history.length >= TOTAL_ROUNDS ? "Finish game" : "Next street"}
                    </button>
                  )}
                </div>
              </div>
              {statusMessage && <p className="text-sm font-semibold text-[var(--accent-dark)]">{statusMessage}</p>}
              {stage === "reveal" && activeResult && (
                <div className="rounded-3xl border border-[var(--border-strong)] bg-white px-6 py-5 shadow-[4px_4px_0_var(--border-strong)]">
                  <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Neighborhood verdict</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {activeResult.formattedActual} · {activeResult.city}, {activeResult.state} {activeResult.zip}
                  </p>
                  <p className="mt-1 text-lg text-[var(--ink-muted)]">
                    You guessed {activeResult.formattedGuess}. Error {(activeResult.percentageError * 100).toFixed(1)}%.
                  </p>
                  <p className="mt-3 text-sm uppercase tracking-wide text-[var(--ink-muted)]">Score</p>
                  <p className="text-4xl font-semibold text-[var(--jade)]">+{activeResult.score}</p>
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {streetViewUrls.length
                  ? streetViewUrls.map((view) => (
                      <div
                        key={view.url}
                        className="overflow-hidden rounded-[28px] border border-[var(--border-strong)] bg-black shadow-[12px_12px_0_var(--border-strong)]"
                      >
                        <Image
                          src={view.url}
                          alt={`Street view for ${round?.location.city ?? "current round"}, heading ${view.heading}°`}
                          width={640}
                          height={480}
                          className="h-[260px] w-full object-cover sm:h-[320px]"
                          priority
                          unoptimized
                          onError={flagImageryFailure}
                        />
                        <p className="bg-[var(--ink)] px-4 py-2 text-xs uppercase tracking-[0.4em] text-[var(--sand)]">
                          Heading {view.heading}°
                        </p>
                      </div>
                    ))
                  : (
                      <div className="rounded-[28px] border border-dashed border-[var(--border-strong)] bg-[#1d1d1d] p-8 text-center text-white shadow-[12px_12px_0_var(--border-strong)] lg:col-span-2">
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
              {imageryError && (
                <div className="rounded-3xl border border-dashed border-[var(--border-strong)] bg-white/80 px-5 py-4 shadow-[6px_6px_0_var(--border-strong)]">
                  <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Imagery bailed</p>
                  <p className="mt-2 text-sm text-[var(--ink)]">
                    Street View refused to render this ZIP. Swap in a fresh street so you’re not guessing blind.
                  </p>
                  <button
                    onClick={handleSwapRound}
                    className="mt-3 rounded-full border border-[var(--border-strong)] bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--sand)] shadow-[3px_3px_0_var(--border-strong)]"
                  >
                    Deal another street
                  </button>
                </div>
              )}
            </aside>
          </div>

          <section>
            <div className="flex items center justify-between">
              <h2 className="font-[family:var(--font-display)] text-2xl font-semibold">Round recap</h2>
              <p className="text-sm text-[var(--ink-muted)]">{history.length} logged</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {history.length === 0 && (
                <p className="rounded-full border border-dashed border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--ink-muted)]">
                  Finish a round to see the receipts here.
                </p>
              )}
              {history.map(({ result }, index) => {
                const tier = errorTier(result.percentageError);
                const tone =
                  tier === "elite"
                    ? "bg-[var(--jade)] text-white"
                    : tier === "solid"
                      ? "bg-[var(--accent)] text-white"
                      : tier === "meh"
                        ? "bg-[#f3d9a7] text-[var(--ink)]"
                        : "bg-[#f7c6bf] text-[var(--ink)]";
                return (
                  <div
                    key={result.roundId}
                    className={`rounded-full border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold uppercase tracking-wide ${tone}`}
                  >
                    R{index + 1} · +{result.score} pts · {(result.percentageError * 100).toFixed(1)}% err
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {stage === "summary" && (
        <section className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-xs uppercase tracking-[0.6em] text-[var(--ink-muted)]">Home Value Guesser</p>
          <h2 className="font-[family:var(--font-display)] text-4xl font-semibold">Final readout</h2>
          <div className="w-full rounded-3xl border border-[var(--border-strong)] bg-white px-6 py-6 text-left shadow-[8px_8px_0_var(--border-strong)]">
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Season report</p>
            <p className="mt-3 text-4xl font-semibold">{totalScoreDisplay} pts</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Average error {averageErrorDisplay} across {history.length} blocks.
            </p>
          </div>
          {summaryComment && (
            <div className="score-flare w-full rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-5 text-left shadow-[6px_6px_0_var(--border-strong)]">
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Snarky appraisal</p>
              <p className="mt-2 text-xl font-semibold text-[var(--accent-dark)]">{summaryComment}</p>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleShare}
              className="flex-1 rounded-full border-2 border-[var(--border-strong)] bg-[var(--ink)] px-8 py-3 text-lg font-semibold uppercase tracking-wide text-[var(--sand)] shadow-[5px_5px_0_var(--border-strong)] transition hover:-translate-y-0.5"
            >
              Share the burn
            </button>
            <button
              onClick={handleStart}
              className="flex-1 rounded-full border-2 border-[var(--border-strong)] bg-[var(--accent)] px-8 py-3 text-lg font-semibold uppercase tracking-wide text-white shadow-[5px_5px_0_var(--border-strong)] transition hover:-translate-y-0.5"
            >
              Run it back
            </button>
          </div>
          {shareFeedback && <p className="text-sm text-[var(--ink-muted)]">{shareFeedback}</p>}
        </section>
      )}
    </div>
  );

}
