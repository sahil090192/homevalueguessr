Here’s a tight product spec you could hand to an engineer or use as a starter brief.

## Zestimate Guesser — Mini Spec

### Overview

A lightweight web game where players see a US residential street view and guess the median home value for that location. The game reveals the true answer and scores the guess based on closeness.

### Core Loop

1. Show a random residential location in the US using street-level imagery.
2. Player enters a home value guess in dollars.
3. System reveals the actual value for that area.
4. Player receives a score for the round.
5. Repeat for 5–10 rounds, then show total score and shareable results.

### Objective

Create a fast, addictive, GeoGuessr-like game that is fun, intuitive, and highly shareable, using visual inference plus public housing data.

### Target User Experience

* Simple to understand within 5 seconds
* One round takes under 20 seconds
* Feels surprising, educational, and slightly humbling
* Encourages “one more game” behavior

### Game Rules

* Each round uses a random US residential location
* Player guesses the home value for that area
* Ground truth is based on a predefined geographic unit, such as ZIP code, census tract, or county
* Score is based on percentage error, not raw dollar error, so expensive areas do not dominate scoring unfairly

### Recommended Ground Truth

Use **median home value by ZIP code or census tract**.

Preferred options:

* **Zillow ZHVI / typical home value**
* Backup: **ACS median home value**

ZIP code is easier to explain to users. Census tract is often more precise.

### Scoring

Use a logarithmic or percentage-based scoring model.

Example:

* Exact guess: 5000 points
* Within 10%: excellent
* Within 25%: good
* Within 50%: decent
* Large miss: low score

A good formula:
`score = max(0, 5000 - k * abs(log(guess / actual)))`

This makes a $300k vs $600k miss feel meaningfully wrong, without breaking the curve at high prices.

### MVP Features

* Home screen with “Start Game”
* 5-round game mode
* Street view image/panorama
* Dollar input field with optional slider or quick buttons
* Reveal screen with:

  * actual value
  * player guess
  * score for round
  * short location metadata like city/state
* End screen with:

  * total score
  * average error %
  * shareable result card

### Nice-to-Have Features

* Difficulty modes:

  * Easy: broad price buckets
  * Hard: exact dollar guess
* Map mode after reveal
* Leaderboard
* Daily challenge
* Streaks
* “AI guessed this too” comparison
* Category packs:

  * suburbs only
  * expensive neighborhoods
  * small-town America
  * Sun Belt sprawl
  * Midwest modest

### Data Sources

* **Street imagery**: Google Street View API
* **Random residential points**: OpenStreetMap road and land-use data
* **Home values**:

  * Zillow ZHVI if license/use allows your implementation
  * US Census ACS median home value as fully public fallback
* **Location boundaries**:

  * Census TIGER/Line shapefiles
  * ZIP/census tract crosswalks

### Location Selection Logic

To keep rounds fair and visually meaningful:

* sample only residential streets
* avoid highways, industrial zones, downtown cores, and empty rural roads
* prefer streets with visible homes
* optionally filter for image quality and recency

### Core Technical Architecture

Frontend:

* React / Next.js

Backend:

* simple API to serve random locations and correct answers
* scoring service
* optional cached location pool

Storage:

* precomputed table of candidate lat/lon points mapped to geographic unit and home value

### Key Risks

* Street view coverage or image quality inconsistency
* Licensing restrictions if relying too heavily on Zillow-branded data
* Some streets may not visually match area-level median values well
* Rural areas may be less fun than suburban/urban ones

### MVP Success Criteria

* Users understand gameplay without tutorial
* Median session length > 3 minutes
* At least 3 completed games per engaged user
* Strong replayability and shareability
* Players feel they are learning to “read” neighborhoods

### One-line Pitch

**Guess the home value from a street view, then find out how good your housing-market instincts really are.**

Tiny naming ideas:

* Zestimate Guesser
* PricePeek
* CurbValue
* StreetWorth
* HousePrice Guessr

My favorite non-boring name is **StreetWorth**. It sounds cleaner and avoids leaning too hard on Zillow branding.
