"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GuessResult, RoundPayload } from "@/types/game";
import { formatCurrency } from "@/lib/scoring";

const TOTAL_ROUNDS = 5;
const HEADING_OFFSETS = [0, 120];
const MIN_GUESS = 50000;
const MAX_GUESS = 2000000;
const DEFAULT_GUESS = 420000;
const PRAISE_QUOTES = [
  "You're pricing blocks like you siphoned Zillow’s API straight into your veins.",
  "That median read was so clean the county assessor just asked you for notes.",
  "Your gut just dunked on every Zestimate within a five-mile radius.",
  "Realtors hate how fast you spotted that neighborhood flex.",
];
const ROAST_QUOTES = [
  "You priced that ranch like it came bundled with its own tech IPO.",
  "Zillow just rage-quit and took a sabbatical after reading that guess.",
  "The assessor’s office printed your number, framed it, and labeled it “fiction.”",
  "Mortgage brokers are using your estimate as a cautionary bedtime story.",
  "That valuation missed so hard the MLS filed a missing-property report.",
  "You just tried to buy a cul-de-sac using Monopoly money and audacity.",
  "HOA group chats are roasting your estimate harder than rogue lawn flamingos.",
  "Even Zestimate’s confidence interval crawled under the couch to hide.",
  "Your gut apparently lives three states away from this neighborhood.",
  "Appraisers now cite your guess as the edge case for “absolutely not.”",
  "Realtors screenshotted that number for their private meme archives.",
  "You valued the driveway and forgot the house—bold minimalist move.",
  "That swing was so wild the Fed is considering new disclosure forms.",
  "Zillow’s API throttled itself just to avoid serving you again.",
  "You just tried to flip a double-wide with Park Avenue comps.",
  "County clerks whispered “bless their heart” when your score came in.",
  "Even Redfin is texting “you good?” after that pricing faceplant.",
  "You valued a cornfield like it had a helipad and valet parking.",
  "The neighborhood Nextdoor thread is subtweeting your gut instincts.",
  "This block hasn’t seen a whiff that far off since the housing bubble’s MySpace era.",
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

type PersonalBest = {
  score: number;
  averageError: number;
  rounds: number;
  recordedAt: number;
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
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const imageErrorCountRef = useRef(0);

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
  const latestBeatsBest = history.length >= TOTAL_ROUNDS && totalScore > (personalBest?.score ?? 0);
  const personalBestDisplay = personalBest ? personalBest.score.toLocaleString() : "—";
  const personalBestErrorDisplay = personalBest ? `${(personalBest.averageError * 100).toFixed(1)}%` : "—";
  const bestScoreForDisplay = latestBeatsBest ? totalScore.toLocaleString() : personalBestDisplay;
  const bestErrorForDisplay = latestBeatsBest ? `${(averageError * 100).toFixed(1)}%` : personalBestErrorDisplay;
  const personalBestRounds = personalBest?.rounds ?? TOTAL_ROUNDS;
  const isPlaying = stage === "guess" || stage === "reveal" || stage === "loading";

  const clampGuess = useCallback((raw: number) => {
    const clamped = Math.min(MAX_GUESS, Math.max(MIN_GUESS, raw));
    return Math.round(clamped / 1000) * 1000;
  }, []);

  const handleSliderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setGuessValue(clampGuess(Number(event.target.value)));
    },
    [clampGuess]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const numeric = Number(event.target.value.replace(/[^0-9]/g, ""));
      if (!Number.isNaN(numeric)) {
        setGuessValue(clampGuess(numeric));
      }
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
      persistPersonalBest();
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

  const guessDisabled = stage === "loading" || stage === "reveal" || imageryError;

  const displayRound =
    stage === "guess"
      ? Math.min(history.length + 1, TOTAL_ROUNDS)
      : Math.min(history.length, TOTAL_ROUNDS);
  const heading =
    stage === "intro"
      ? "homevalueguessr beta"
      : stage === "summary"
        ? "Full tally"
        : `Round ${displayRound || 1} of ${TOTAL_ROUNDS}`;

  const handleShare = async () => {
    const sharePayload = `I pulled ${totalScoreDisplay} pts with ${averageErrorDisplay} avg error on homevalueguessr. Think you can read a block better? https://homevalueguessr.com`;
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("homevalueguessr.personalBest");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as PersonalBest;
      if (typeof parsed.score === "number") {
        setPersonalBest(parsed);
      }
    } catch {
      // ignore corrupted payloads
    }
  }, []);

  const persistPersonalBest = useCallback(() => {
    if (history.length < TOTAL_ROUNDS) return;
    setPersonalBest((prev) => {
      if (prev && prev.score >= totalScore) {
        return prev;
      }
      const next: PersonalBest = {
        score: totalScore,
        averageError,
        rounds: history.length,
        recordedAt: Date.now(),
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem("homevalueguessr.personalBest", JSON.stringify(next));
      }
      return next;
    });
  }, [averageError, history.length, totalScore]);

  useEffect(() => {
    if (stage === "summary") {
      persistPersonalBest();
    }
  }, [stage, persistPersonalBest]);

  return (
    <div className="min-h-screen text-[var(--ink)]">
      {stage === "intro" && (
        <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-8 px-6 py-16 text-center lg:px-10">
          <p className="text-xs uppercase tracking-[0.6em] text-[var(--ink-muted)]">Zip median challenge</p>
          <h1 className="font-[family:var(--font-display)] text-6xl font-semibold tracking-tight sm:text-7xl">
            homevalueguessr
          </h1>
          <p className="max-w-2xl text-lg text-[var(--ink-muted)]">
            Two Street View snaps. One gut-priced guess. Real Zillow ZHVI.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            <span className="neo-chip">2 images</span>
            <span className="neo-chip">5 rounds</span>
            <span className="neo-chip">Roast finale</span>
          </div>
          <button
            onClick={handleStart}
            className="neo-button bg-[var(--accent)] px-12 py-4 text-base text-white"
          >
            Play now
          </button>
          <details className="neo-card border border-dashed border-[var(--border-soft)] bg-white/80 p-5 text-left text-sm text-[var(--ink)]">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.4em]">How scoring works</summary>
            <p className="mt-3 text-xs leading-relaxed">
              Score = max(0, 5000 − 2500 × |ln(guess / actual)|). Miss luxury, lose luxury points. High scores = tight reads.
            </p>
          </details>
        </section>
      )}

      {isPlaying && (
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.05fr,0.95fr]">
            <section className="space-y-6">
              <div className="neo-card neo-card--loud p-7">
                <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">
                  <span>{heading}</span>
                  <span>Round {Math.min(stage === "guess" ? history.length + 1 : history.length, TOTAL_ROUNDS)} / {TOTAL_ROUNDS}</span>
                  <span>{history.length}/{TOTAL_ROUNDS} streets</span>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Total Score</p>
                    <p className="text-2xl font-semibold">{totalScoreDisplay}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Avg Error</p>
                    <p className="text-2xl font-semibold">{averageErrorDisplay}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Personal best</p>
                    <p className="text-2xl font-semibold">{bestScoreForDisplay}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                      {latestBeatsBest
                        ? "Just set · " + bestErrorForDisplay
                        : personalBest
                          ? `${personalBestRounds} rounds · ${personalBestErrorDisplay}`
                          : "Play to set one"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">ZHVI period</p>
                    <p className="text-2xl font-semibold">{round?.location.zhviLabel ?? "Jan 2026"}</p>
                  </div>
                </div>
              </div>
              <div className="neo-card space-y-5 p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Your guess</label>
                  {round && (
                    <span className="neo-chip text-[10px]">
                      Median target · ZIP {round.location.zip}
                    </span>
                  )}
                </div>
                <div className="space-y-4 rounded-[28px] bg-[var(--sand)] px-6 py-5">
                  <div className="flex flex-wrap items-end gap-5">
                    <div>
                      <span className="text-[11px] uppercase tracking-[0.4em] text-[var(--ink-muted)]">Manual entry</span>
                      <div className="mt-2 flex items-center gap-3 rounded-[22px] bg-white px-5 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.08)]">
                        <span className="text-2xl font-semibold text-[var(--accent-dark)]">$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-40 bg-transparent text-4xl font-semibold tracking-tight text-[var(--ink)] outline-none"
                          value={guessValue.toLocaleString()}
                          onChange={handleInputChange}
                          aria-label="Manual guess entry"
                          disabled={guessDisabled}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                      Range {formatCurrency(MIN_GUESS)} – {formatCurrency(MAX_GUESS)}
                    </p>
                  </div>
                  <input
                    type="range"
                    min={MIN_GUESS}
                    max={MAX_GUESS}
                    step={1000}
                    value={guessValue}
                    onChange={handleSliderChange}
                    disabled={guessDisabled}
                    className="neo-slider cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {stage === "guess" && (
                    <button
                      onClick={handleGuessSubmit}
                      disabled={isSubmitting || guessDisabled}
                      className="neo-button flex-1 bg-[var(--accent)] px-8 py-4 text-base text-[var(--sand)] disabled:opacity-60"
                    >
                      {isSubmitting ? "Scoring..." : "Lock it in"}
                    </button>
                  )}
                  {stage === "reveal" && (
                    <button
                      onClick={handleNext}
                      className="neo-button flex-1 bg-[var(--ink)] px-8 py-4 text-base text-[var(--sand)]"
                    >
                      {history.length >= TOTAL_ROUNDS ? "Finish game" : "Next street"}
                    </button>
                  )}
                </div>
              </div>
              {statusMessage && <p className="text-sm font-semibold text-[var(--accent-dark)]">{statusMessage}</p>}
              {stage === "reveal" && activeResult && (
                <div className="rounded-[32px] border-[3px] border-[var(--border-strong)] bg-white px-6 py-5 shadow-[6px_6px_0_var(--border-strong)]">
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

            <aside className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {streetViewUrls.length
                  ? streetViewUrls.map((view) => (
                      <div
                        key={view.url}
                        className="neo-card relative overflow-hidden rounded-[30px] border-[3px] border-[var(--border-strong)] bg-black"
                      >
                        <Image
                          src={view.url}
                          alt={`Street view for ${round?.location.city ?? "current round"}, heading ${view.heading}°`}
                          width={640}
                          height={480}
                          className="h-[260px] w-full object-cover brightness-95 contrast-110 saturate-125 sm:h-[320px]"
                          priority
                          unoptimized
                          onError={flagImageryFailure}
                        />
                        <p className="bg-[var(--ink)] px-4 py-2 text-xs uppercase tracking-[0.4em] text-[var(--sand)]">
                          Heading {view.heading}°
                        </p>
                        <div className="pointer-events-none absolute -right-6 top-6 hidden rotate-3 border-2 border-[var(--border-strong)] bg-[var(--citrus)] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.4em] shadow-[6px_6px_0_var(--border-strong)] sm:block">
                          Street intel
                        </div>
                      </div>
                    ))
                  : (
                      <div className="rounded-[28px] border border-dashed border-[var(--border-strong)] bg-[#1d1d1d] p-8 text-center text-white shadow-[12px_12px_0_var(--border-strong)] lg:col-span-2">
                        Loading street imagery…
                      </div>
                    )}
              </div>
              {round && (
                <div className="neo-card px-6 py-6">
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
                <div className="rounded-[32px] border-2 border-dashed border-[var(--border-strong)] bg-white/80 px-5 py-4 shadow-[6px_6px_0_var(--border-strong)]">
                  <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Imagery bailed</p>
                  <p className="mt-2 text-sm text-[var(--ink)]">
                    Street View refused to render this ZIP. Swap in a fresh street so you’re not guessing blind.
                  </p>
                  <button
                    onClick={handleSwapRound}
                    className="neo-button mt-3 bg-[var(--ink)] px-6 py-3 text-xs text-[var(--sand)]"
                  >
                    Deal another street
                  </button>
                </div>
              )}
            </aside>
          </div>

          <section className="rounded-[36px] border-[3px] border-[var(--border-strong)] bg-white/80 px-6 py-5 shadow-[8px_8px_0_var(--border-strong)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-[family:var(--font-display)] text-2xl font-semibold">Round recap</h2>
              <p className="text-sm uppercase tracking-[0.4em] text-[var(--ink-muted)]">{history.length} logged</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
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
                    className={`rounded-full border-2 border-[var(--border-strong)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.4em] shadow-[4px_4px_0_var(--border-strong)] ${tone}`}
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
        <section className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.6em] text-[var(--ink-muted)]">homevalueguessr</p>
          <h2 className="font-[family:var(--font-display)] text-5xl font-semibold leading-tight">Final readout</h2>
          <div className="grid w-full gap-6 md:grid-cols-2">
            <div className="neo-card neo-card--loud text-left">
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Season report</p>
              <p className="mt-3 text-4xl font-semibold">{totalScoreDisplay} pts</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Average error {averageErrorDisplay} across {history.length} blocks.
              </p>
              <p className="mt-4 text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">
                Local high score · {personalBest || latestBeatsBest ? `${bestScoreForDisplay} pts · ${bestErrorForDisplay}` : "set yours next round"}
              </p>
            </div>
            {summaryComment && (
              <div className="score-flare neo-card text-left">
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">Neighborhood side-eye</p>
                <p className="mt-3 text-2xl font-semibold text-[var(--accent-dark)]">{summaryComment}</p>
              </div>
            )}
          </div>
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:justify-center sm:gap-6">
            <button
              onClick={handleShare}
              className="neo-button flex-1 bg-[var(--ink)] px-10 py-4 text-base text-[var(--sand)]"
            >
              Share the burn
            </button>
            <button
              onClick={handleStart}
              className="neo-button flex-1 bg-[var(--accent)] px-10 py-4 text-base text-[var(--sand)]"
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
