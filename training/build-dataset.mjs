#!/usr/bin/env node
/**
 * Turns analyzed games (raw per-ply Stockfish evals) into a labeled feature
 * dataset — one row per player per game — using the exact same
 * extractGameFeatures() the browser app runs client-side, so training and
 * inference can never drift apart.
 *
 * Usage: node training/build-dataset.mjs [--in=...] [--out=...] [--min-moves=8]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractGameFeatures } from '../src/ml/features.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);

const IN_PATH = args.in ?? fileURLToPath(new URL('data/analyzed-games.jsonl', import.meta.url));
const OUT_PATH = args.out ?? fileURLToPath(new URL('data/dataset.json', import.meta.url));
const MIN_MOVES = Number(args['min-moves'] ?? 8);

const lines = readFileSync(IN_PATH, 'utf8').split('\n').filter(Boolean);
const rows = [];

for (const line of lines) {
  const game = JSON.parse(line);
  const { white, black } = extractGameFeatures(game);

  if (white && white.numMoves >= MIN_MOVES && Number.isFinite(game.whiteElo)) {
    const { numMoves: _numMoves, ...features } = white;
    rows.push({ ...features, rating: game.whiteElo });
  }
  if (black && black.numMoves >= MIN_MOVES && Number.isFinite(game.blackElo)) {
    const { numMoves: _numMoves, ...features } = black;
    rows.push({ ...features, rating: game.blackElo });
  }
}

writeFileSync(OUT_PATH, JSON.stringify(rows));

const ratings = rows.map((r) => r.rating).sort((a, b) => a - b);
console.log(`Built ${rows.length} training rows from ${lines.length} games.`);
console.log(
  `Rating range: ${ratings[0]}–${ratings[ratings.length - 1]}, median ${ratings[Math.floor(ratings.length / 2)]}`,
);
console.log(`Wrote ${OUT_PATH}`);
