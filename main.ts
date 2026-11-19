// GTA VI trophy rarity forecaster — make.fun gta6-trophy-rarity-forecast-01.
//
// Method (count-consistent dilution forecast in log-time):
//   Exophase prints each trophy's earn rate as a percent of the players it
//   tracks, and it refreshes those counts on its own schedule, not with
//   every player's trophy. A refresh that tracks many new players dilutes
//   every rate down, because the denominator grows faster than the earners.
//   So this program forecasts counts, not rates: for each trophy it recovers
//   earners E = rate * players / 100 from every read, fits a least-squares
//   line to ln E and to ln players against x = ln(1 + hours since the
//   2026-11-19T00:00Z launch), reads both lines at the target, and takes
//   the rate as earners over players. A direct least-squares line to the
//   logit rate in the same x is blended in (half and half in logit space)
//   as a guard against either count line extrapolating badly. The spread
//   on the logit scale combines a random-walk widening with horizon, the
//   fit's residual, and a refresh-shock term: when the whole history shows
//   a frozen display (players tracked never changes), the next refresh is
//   overdue and large, so the spread widens and the median shifts down to
//   anticipate dilution — the house's own launch-night record shows one
//   refresh taking players from 638 to 3,868 with every rate lower.
//   Everything is deterministic: no randomness, no clock, no network.
//
// Run: node main.ts (Node 22+). Reads every *.in file in $MAKEFUN_INPUT_DIR
// (else /input/) and writes one <id>.out per case to $MAKEFUN_OUTPUT_DIR
// (else /output/). Standard library only.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Standard-normal quantiles at the five scored levels.
const Z = [-1.6448536269514722, -0.6744897501960817, 0, 0.6744897501960817, 1.6448536269514722];

// Launch epoch: log-time is measured from the game's release day.
const T0_MS = Date.parse("2026-11-19T00:00:00Z");
const MS_PER_HOUR = 3600000;

// Tuning constants, fixed in advance (never tuned on the practice answers,
// which the kit does not carry — they were chosen from the rules' own
// description of the launch-night refresh and the pinball-loss geometry).
const RANDOM_WALK = 0.5; // house baseline's logit random-walk coefficient
const SHOCK_FROZEN = 1.2; // extra logit spread when the display is frozen
const SHOCK_BASE = 0.3; // background refresh noise when reads do move
const SHIFT_FROZEN = 0.9; // median logit shift down when the display is frozen
const RESIDUAL_FLOOR = 0.05; // smallest logit residual spread allowed
const MAX_PLAYERS_GROWTH = 50; // cap on forecast players vs last read
const RATE_MIN = 0.01; // logit clamp, matching the scorer's own clamp
const RATE_MAX = 99.99;

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

function logit(pct) {
  const p = clamp(pct, RATE_MIN, RATE_MAX) / 100;
  return Math.log(p / (1 - p));
}

function sigmoid(l) {
  if (l >= 0) {
    const e = Math.exp(-l);
    return 1 / (1 + e);
  }
  const e = Math.exp(l);
  return e / (1 + e);
}

// x-coordinate of a read: log-time since launch, in hours.
function logTime(ms) {
  const hours = (ms - T0_MS) / MS_PER_HOUR;
  return Math.log1p(Math.max(0, hours));
}

// Ordinary least squares on (xs, ys). Returns {a, b, residual} where
// y ~= a + b*x and residual is the RMS of the fit residuals. With fewer
// than two distinct x values the slope is 0 and the residual is 0.
function ols(xs, ys) {
  const n = xs.length;
  if (n === 0) return { a: 0, b: 0, residual: 0 };
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    sxx += dx * dx;
    sxy += dx * (ys[i] - my);
  }
  const b = sxx > 1e-12 ? sxy / sxx : 0;
  const a = my - b * mx;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (a + b * xs[i]);
    ss += r * r;
  }
  return { a, b, residual: Math.sqrt(ss / n) };
}

// Pick the reads a fit uses: the last 24 hours before the checkpoint when
// that window holds at least 3 reads, otherwise the whole history.
function fitWindow(history, atMs) {
  const day = 24 * MS_PER_HOUR;
  const recent = history.filter((r) => atMs - Date.parse(r.at) <= day);
  return recent.length >= 3 ? recent : history;
}

// Forecast one trophy's five quantiles. `series` is the trophy's reads:
// [{x, rate, players}] with rate possibly null (skipped by the fits).
// `playersFit` is the case-wide OLS fit of ln players against x.
// `horizonDays` is the case horizon in days; `frozen` says the display
// never moved during the case's history.
function forecastTrophy(series, playersFit, horizonDays, frozen, xTarget, lastRate) {
  const pts = series.filter((s) => s.rate !== null && s.rate !== undefined);
  if (pts.length === 0) {
    // No read ever named this trophy: centre low with a very wide spread.
    return quantilesFromLogit(logit(1), 2.0);
  }
  const xs = pts.map((s) => s.x);
  const lnE = pts.map((s) => Math.log(Math.max(1e-9, (s.rate / 100) * s.players)));
  const lg = pts.map((s) => logit(s.rate));
  const fitE = ols(xs, lnE);
  const fitL = ols(xs, lg);

  // Earners at the target, from the earners line; players at the target,
  // from the case-wide players line, capped so one wild extrapolation
  // cannot invent a player base fifty times the last read.
  let lnEStar = fitE.a + fitE.b * xTarget;
  let lnPStar = playersFit.a + playersFit.b * xTarget;
  const lastPlayers = pts[pts.length - 1].players;
  lnPStar = Math.min(lnPStar, Math.log(lastPlayers * MAX_PLAYERS_GROWTH));
  lnPStar = Math.max(lnPStar, Math.log(Math.max(1, lastPlayers * 0.5)));
  // Earners can never exceed players: cap the earners line the same way.
  lnEStar = Math.min(lnEStar, lnPStar);
  const rateCount = 100 * Math.exp(lnEStar - lnPStar);
  const rateLine = 100 * sigmoid(fitL.a + fitL.b * xTarget);

  // Median: half and half in logit space between the count forecast and
  // the direct logit-rate line. When the display is frozen, shift down:
  // the next refresh dilutes rates, and a frozen display hides how far
  // the true rates have already moved.
  let medianLogit = 0.5 * (logit(rateCount) + logit(rateLine));
  if (frozen) medianLogit -= SHIFT_FROZEN;

  // Spread: random walk with horizon, the logit fit's residual, and the
  // refresh shock. A frozen display earns the large shock; a moving one
  // earns only the background term.
  const base = RANDOM_WALK * Math.sqrt(horizonDays);
  const residual = Math.max(fitL.residual, RESIDUAL_FLOOR);
  const shock = frozen ? SHOCK_FROZEN : SHOCK_BASE;
  const sigma = Math.sqrt(base * base + residual * residual + shock * shock);
  return quantilesFromLogit(medianLogit, sigma);
}

// Turn a logit median and logit spread into the five percent quantiles,
// rounded to 4 decimals and non-decreasing (rounding can only tie).
function quantilesFromLogit(medianLogit, sigma) {
  const qs = Z.map((z) => {
    const pct = 100 * sigmoid(medianLogit + z * sigma);
    return Math.round(clamp(pct, 0, 100) * 10000) / 10000;
  });
  for (let i = 1; i < qs.length; i++) {
    if (qs[i] < qs[i - 1]) qs[i] = qs[i - 1];
  }
  return qs;
}

// Forecast every trophy of one case. Returns the output object.
function forecastCase(c) {
  const atMs = Date.parse(c.at);
  const targetMs = Date.parse(c.target);
  const horizonDays = Math.max(0, (targetMs - atMs) / (24 * MS_PER_HOUR));
  const xTarget = logTime(targetMs);
  const history = (c.history || []).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const window = fitWindow(history, atMs);

  // Case-wide players fit, from the window's reads.
  const px = window.map((r) => logTime(Date.parse(r.at)));
  const py = window.map((r) => Math.log(Math.max(1, r.players_tracked)));
  const playersFit = ols(px, py);

  // Frozen display: players tracked never changed across the whole history.
  let frozen = history.length > 1;
  for (let i = 1; i < history.length; i++) {
    if (history[i].players_tracked !== history[0].players_tracked) {
      frozen = false;
      break;
    }
  }

  const trophies = [];
  const n = c.trophies.length;
  for (let i = 0; i < n; i++) {
    const trophy = c.trophies[i];
    const series = window.map((r) => ({
      x: logTime(Date.parse(r.at)),
      rate: r.rates ? r.rates[i] : null,
      players: r.players_tracked,
    }));
    const last = history.length ? history[history.length - 1] : null;
    const lastRate = last && last.rates ? last.rates[i] : null;
    const q = forecastTrophy(series, playersFit, horizonDays, frozen, xTarget, lastRate);
    trophies.push({ id: trophy.id, q });
  }
  return { trophies };
}

function main() {
  const inputDir = process.env.MAKEFUN_INPUT_DIR || "/input";
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outputDir, { recursive: true });
  const names = readdirSync(inputDir)
    .filter((name) => name.endsWith(".in"))
    .sort();
  for (const name of names) {
    const text = readFileSync(join(inputDir, name), "utf8");
    const c = JSON.parse(text);
    const out = forecastCase(c);
    const base = name.slice(0, -".in".length);
    writeFileSync(join(outputDir, base + ".out"), JSON.stringify(out));
  }
}

main();
