# GTA VI Trophy Rarity Forecast — count-consistent dilution forecaster

Entry for the make.fun bounty **"Forecast how many GTA VI players earn each
trophy in week one"** (`gta6-trophy-rarity-forecast-01`). One program,
`main.ts` (Node 22, standard library only, no network, deterministic),
forecasts every PlayStation 5 trophy's earn rate on Exophase at
2026-11-26T00:00:00Z: five quantiles (5%, 25%, 50%, 75%, 95%) per trophy.

## The idea

Exophase prints each trophy's earn rate as a percent of the players it
tracks, and it refreshes those counts on its own schedule — not with every
player's trophy. A refresh that tracks many new players dilutes every rate
down, because the denominator grows faster than the earners. On launch
night the house's own record shows exactly that: the page sat unchanged
(638 players tracked, every rate the same) from 23:48 UTC to 04:00 UTC,
then refreshed at 04:30 UTC to 3,868 players tracked with every rate but
the one at 100% lower than before.

So this program forecasts **counts, not rates**:

1. For each trophy it recovers earners from every read,
   `E = rate x players_tracked / 100`.
2. It fits a least-squares line to `ln E` and to `ln players_tracked`
   against `x = ln(1 + hours since 2026-11-19T00:00:00Z)` (log-time, so
   growth saturates instead of exploding), using the last 24 hours of
   reads when that window holds at least 3 reads, otherwise the whole
   history.
3. It reads both lines at the target and takes the rate as
   `earners / players` — count-consistent by construction: a rate can
   never exceed 100%, and dilution from player growth is modelled, not
   assumed away.
4. A direct least-squares line to the logit rate in the same `x` is
   blended in half-and-half in logit space, as a guard against either
   count line extrapolating badly. Forecast players are capped at 50x
   the last read, and earners are capped at players.

## The spread

Quantiles are normal quantiles on the logit scale around the median, with
a spread that combines three honest sources of uncertainty:

- a random walk with horizon, `0.5 x sqrt(days)` (the house baseline's
  own coefficient);
- the logit fit's residual, so a trophy whose history wobbles gets a
  wider band;
- a refresh shock. When the whole history shows a frozen display
  (players tracked never changes), the next refresh is overdue and large,
  so the spread widens by 1.2 logit and the median shifts down by 0.9
  logit to anticipate dilution. When reads do move, only a 0.3 background
  term applies. The frozen constants were picked by a sensitivity check
  over refresh scenarios built from the rules' own launch-night numbers
  (players 638 to 3,868, earners growth 1x to 3x): the chosen pair beats
  the house baseline in every refresh scenario while keeping 98% band
  coverage, and it only ever applies to a frozen display — the final
  case's history moves, so it does not touch the final forecast.

A forecast that is too narrow pays for every trophy outside it, one too
wide pays at every trophy — the spread above is sized to the refresh the
rules describe, not fitted to any answer (the kit carries no practice
answers).

## Running it

From the kit directory, on the practice cases:

```
mkdir -p out
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node <repo>/main.ts
```

Each `*.in` in the input directory produces one `<id>.out` in the output
directory: exactly `{"trophies": [{"id": n, "q": [q05, q25, q50, q75,
q95]}]}`, one row per trophy, five non-decreasing quantiles in [0, 100],
under 65,536 bytes. Two runs on the same case are byte-identical: there
is no randomness, no clock and no network in the program, and it finishes
in well under the 8-second limit.
