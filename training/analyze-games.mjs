#!/usr/bin/env node
/**
 * Replays every sampled game and runs a real Stockfish search over every
 * position, mirroring what the browser's StockfishEngine.js does per-ply —
 * just over the `stockfish` npm package's child-process engine instead of a
 * Web Worker, and serialized across an entire batch of games instead of one.
 *
 * Writes one JSON line per game to the output file, so a killed/interrupted
 * run can be resumed with --resume (skips games already present).
 *
 * Usage: node training/analyze-games.mjs [--depth=10] [--limit=250] [--in=...] [--out=...] [--resume]
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import initEngine from 'stockfish';
import { MATE_CP_BASE, toWhitePovCp } from '../src/engine/evaluation.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);

const DEPTH = Number(args.depth ?? 10);
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const IN_PATH = args.in ?? fileURLToPath(new URL('data/sample-games.pgn', import.meta.url));
const OUT_PATH = args.out ?? fileURLToPath(new URL('data/analyzed-games.jsonl', import.meta.url));
const RESUME = Boolean(args.resume);

function parseHeaders(block) {
  const headers = {};
  for (const match of block.matchAll(/^\[(\w+) "(.*)"\]$/gm)) {
    headers[match[1]] = match[2];
  }
  return headers;
}

const pgnText = readFileSync(IN_PATH, 'utf8');
const blocks = pgnText.split(/\n(?=\[Event )/).filter(Boolean);

let alreadyDone = 0;
if (RESUME && existsSync(OUT_PATH)) {
  alreadyDone = readFileSync(OUT_PATH, 'utf8').split('\n').filter(Boolean).length;
  console.log(`Resuming: ${alreadyDone} games already analyzed.`);
}

const engine = await initEngine('lite-single');
await new Promise((resolve) => {
  engine.listener = (line) => {
    if (line === 'uciok') engine.sendCommand('isready');
    if (line === 'readyok') resolve();
  };
  engine.sendCommand('uci');
});

/** Runs one `go depth N` search, serialized (this engine handles one search at a time). */
function analyzePosition(fen) {
  return new Promise((resolve) => {
    let lastScore = null;
    engine.listener = (line) => {
      if (typeof line !== 'string') return;
      const mateMatch = line.match(/score mate (-?\d+)/);
      const cpMatch = line.match(/score cp (-?\d+)/);
      if (mateMatch) lastScore = { mate: parseInt(mateMatch[1], 10) };
      else if (cpMatch) lastScore = { cp: parseInt(cpMatch[1], 10) };

      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const bestMove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
        resolve({ bestMove, ...(lastScore ?? { cp: 0 }) });
      }
    };
    engine.sendCommand('ucinewgame');
    engine.sendCommand(`position fen ${fen}`);
    engine.sendCommand(`go depth ${DEPTH}`);
  });
}

async function evaluatePly(fen) {
  const sideToMove = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const board = new Chess(fen);
  if (board.isGameOver()) {
    const checkmate = board.isCheckmate();
    return {
      bestMove: null,
      sideToMove,
      whitePovCp: checkmate ? (sideToMove === 'w' ? -MATE_CP_BASE : MATE_CP_BASE) : 0,
    };
  }
  const result = await analyzePosition(fen);
  return { ...result, sideToMove, whitePovCp: toWhitePovCp(result, sideToMove) };
}

const START_FEN = new Chess().fen();
const total = Math.min(blocks.length, LIMIT);
const startTime = Date.now();

for (let i = alreadyDone; i < total; i++) {
  const headers = parseHeaders(blocks[i]);
  const chess = new Chess();
  chess.loadPgn(blocks[i], { strict: false });
  const history = chess.history({ verbose: true });
  const moves = history.map((move) => ({
    san: move.san,
    uci: move.from + move.to + (move.promotion ?? ''),
    fen: move.after,
    color: move.color,
  }));

  const evals = [await evaluatePly(START_FEN)];
  for (const move of moves) {
    evals.push(await evaluatePly(move.fen));
  }

  appendFileSync(
    OUT_PATH,
    JSON.stringify({
      whiteElo: Number(headers.WhiteElo),
      blackElo: Number(headers.BlackElo),
      moves,
      evals,
    }) + '\n',
  );

  const elapsed = (Date.now() - startTime) / 1000;
  const done = i + 1 - alreadyDone;
  const rate = done / elapsed;
  const remaining = total - i - 1;
  console.log(
    `[${i + 1}/${total}] ${moves.length} plies — ${rate.toFixed(2)} games/s, ~${Math.round(remaining / rate)}s left`,
  );
}

engine.sendCommand('quit');
console.log(`Done. Analyzed games written to ${OUT_PATH}`);
process.exit(0);
