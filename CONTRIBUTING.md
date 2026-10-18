# Contributing

Ashen Ascent is plain HTML, CSS and JavaScript (ES modules, Canvas 2D). There is no build step and no npm dependency.

## Setup

```
git clone <repo url>
cd <repo>
python serve.py
```

Open http://localhost:8000/. Node 18 or newer is needed only for the checks.

## Before you open a pull request

```
npm test
```

All five checks must print their "all clear" or PASS line.

## Ground rules

- The simulation (`js/sim`, `js/gen`) is deterministic. Do not use `Math.random` or the clock there; use the seeded `Rng`.
- Gameplay numbers and text live in `js/data`. Presentation lives in `js/game` and `js/ui`.
- Art on disk is never recoloured. Lighting is applied at draw time.
- Do not commit original art packs or zips. Read `CREDITS.md` first.
- Player-facing text and docs avoid em dashes and en dashes.
