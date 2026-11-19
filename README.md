# GTA VI Trophy Rarity Forecast — Week One

[![make.fun · gta6-trophy-rarity-forecast-01](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/rezimx-btc/gta6-trophy-rarity-forecast-01/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/rezimx-btc/gta6-trophy-rarity-forecast-01/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)

A count-consistent dilution forecaster for the make.fun bounty [Forecast how many GTA VI players earn each trophy in week one](https://make.fun/bounty/gta6-trophy-rarity-forecast-01).

It predicts, for every one of the 55 PlayStation 5 trophies of Grand Theft Auto VI, its earn rate on Exophase one week after launch, at 2026-11-26T00:00:00Z. For each trophy it outputs five quantiles (5%, 25%, 50%, 75%, 95%) of the earn rate at the target.

## Method

The forecast is built on counts, not on rates alone. For each trophy, the number of earners is recovered as the earn rate times the players tracked. Least-squares lines are then fitted to log earners and log players against log-time — ln(1 + hours since 2026-11-19T00:00:00Z) — and both lines are read at the target. The forecasted rate is earners over players, so the forecast is count-consistent by construction and it models the dilution that happens when Exophase refreshes its counts and the player denominator grows faster than the earners.

The spread on the logit scale combines three parts: a random-walk widening with the horizon, the residual of the fit, and extra widening for a refresh event not yet seen. A direct logit-rate line is blended in as a safeguard, so a trophy with a thin history still gets a sane forecast.

## Running it

The program is `main.ts` at the repository root. It runs on Node 22, uses only the standard library, and makes no network requests. Point it at the case files with `MAKEFUN_INPUT_DIR` and at an output directory with `MAKEFUN_OUTPUT_DIR`:

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

It reads every `*.in` file in the input directory and writes one `.out` file per case. Each run is deterministic — two runs produce byte-identical output — and each run takes well under the 8-second limit.
