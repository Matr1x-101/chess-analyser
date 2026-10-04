#!/usr/bin/env node
/**
 * Pulls a real sample of rated games from a Lichess monthly database dump
 * (https://database.lichess.org) without downloading the whole (multi-GB)
 * file: it range-requests just the first slice of bytes, decompresses that
 * slice with the system `zstd` binary (streaming, so the truncated tail is
 * simply an error we ignore), and keeps whichever complete games fall
 * inside that slice.
 *
 * Usage: node training/fetch-sample-games.mjs [--month=2026-06] [--bytes=8000000] [--count=250] [--out=training/data/sample-games.pgn]
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);

const MONTH = args.month ?? '2026-06';
const RANGE_BYTES = Number(args.bytes ?? 8_000_000);
const TARGET_COUNT = Number(args.count ?? 250);
const OUT_PATH = args.out ?? new URL('data/sample-games.pgn', import.meta.url);

const MIN_PLIES = 16;
// Bullet games (<3min base) produce noisy, rushed move quality that isn't
// representative of a player's "real" strength — excluded like the rest of
// the pipeline excludes correspondence.
const MIN_BASE_SECONDS = 180;

const dumpUrl = `https://database.lichess.org/standard/lichess_db_standard_rated_${MONTH}.pgn.zst`;

console.log(`Fetching first ${RANGE_BYTES.toLocaleString()} bytes of ${dumpUrl}`);
const res = await fetch(dumpUrl, { headers: { Range: `bytes=0-${RANGE_BYTES - 1}` } });
if (!res.ok && res.status !== 206) {
  throw new Error(`Failed to fetch dump: HTTP ${res.status}`);
}
const compressed = Buffer.from(await res.arrayBuffer());
console.log(`Downloaded ${compressed.length.toLocaleString()} compressed bytes, decompressing...`);

const decompressed = spawnSync('zstd', ['-d', '-c'], { input: compressed, maxBuffer: 1024 * 1024 * 1024 });
// A non-zero exit here is expected: we truncated the stream mid-frame, so
// zstd reports "premature end" after emitting everything it could decode.
const pgnText = decompressed.stdout.toString('utf8');
if (!pgnText) {
  throw new Error(`zstd produced no output: ${decompressed.stderr}`);
}

const blocks = pgnText.split(/\n(?=\[Event )/).filter(Boolean);
// The final block is almost certainly cut off mid-game (or mid-header) —
// drop it rather than risk feeding a corrupt game into the next stage.
blocks.pop();
console.log(`Decompressed ${blocks.length} complete games from the sampled range.`);

function parseHeaders(block) {
  const headers = {};
  for (const match of block.matchAll(/^\[(\w+) "(.*)"\]$/gm)) {
    headers[match[1]] = match[2];
  }
  return headers;
}

function baseSeconds(timeControl) {
  if (!timeControl || timeControl === '-') return null;
  const [base] = timeControl.split('+');
  const n = Number(base);
  return Number.isFinite(n) ? n : null;
}

const kept = [];
for (const block of blocks) {
  if (kept.length >= TARGET_COUNT) break;

  const headers = parseHeaders(block);
  if (!headers.Event?.startsWith('Rated')) continue;

  const whiteElo = Number(headers.WhiteElo);
  const blackElo = Number(headers.BlackElo);
  if (!Number.isFinite(whiteElo) || !Number.isFinite(blackElo)) continue;

  const base = baseSeconds(headers.TimeControl);
  if (base === null || base < MIN_BASE_SECONDS) continue;

  // chess.js also acts as a validity check: a genuinely truncated or
  // malformed block will throw or yield a suspiciously short history.
  try {
    const chess = new Chess();
    chess.loadPgn(block, { strict: false });
    if (chess.history().length < MIN_PLIES) continue;
  } catch {
    continue;
  }

  kept.push(block);
}

if (kept.length === 0) {
  throw new Error('No games passed the filters — try a larger --bytes range.');
}
if (kept.length < TARGET_COUNT) {
  console.warn(`Only found ${kept.length}/${TARGET_COUNT} games in this range — increase --bytes for more.`);
}

const outPath = typeof OUT_PATH === 'string' ? OUT_PATH : fileURLToPath(OUT_PATH);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, kept.join('\n\n') + '\n');
console.log(`Wrote ${kept.length} filtered games to ${outPath}`);
