import { classifyBlunderType, classifyMove } from '../engine/evaluation.js';

// Fixed order used both when training the model and when running inference
// in the browser — the model's weight vector is positional, so this order
// must never change without retraining.
export const FEATURE_KEYS = [
  'acpl',
  'blunderRate',
  'mistakeRate',
  'inaccuracyRate',
  'bestMoveRate',
  'hangingPieceRate',
  'missedTacticRate',
  'positionalErrorRate',
  'lossVolatility',
  'openingAcpl',
  'restAcpl',
];

const OPENING_WINDOW = 10;

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

/**
 * Derive one move-quality feature vector for a single side from a fully
 * analyzed game. `moves` is the app's move list ({ san, uci, fen, color }),
 * `evals` is the ply-indexed eval cache (0 = starting position) — the same
 * shapes `App.jsx` already holds in state, and what the Node training script
 * reproduces offline. Returns `null` if the side made no moves.
 */
export function extractPlayerFeatures({ moves, evals, color }) {
  const losses = [];
  const openingLosses = [];
  const restLosses = [];
  let ownMoveIndex = 0;
  let bestMoveCount = 0;
  let blunderCount = 0;
  let mistakeCount = 0;
  let inaccuracyCount = 0;
  let hangingPieceCount = 0;
  let missedTacticCount = 0;
  let positionalErrorCount = 0;

  moves.forEach((move, idx) => {
    if (move.color !== color) return;

    const before = evals[idx];
    const after = evals[idx + 1];
    if (!before || !after) return;

    ownMoveIndex += 1;

    const classification = classifyMove({
      whitePovCpBefore: before.whitePovCp,
      whitePovCpAfter: after.whitePovCp,
      moverColor: move.color,
      playedUci: move.uci,
      bestMoveUci: before.bestMove,
    });

    losses.push(classification.loss);
    if (ownMoveIndex <= OPENING_WINDOW) {
      openingLosses.push(classification.loss);
    } else {
      restLosses.push(classification.loss);
    }

    if (classification.key === 'best') bestMoveCount += 1;
    if (classification.key === 'inaccuracy') inaccuracyCount += 1;
    if (classification.key === 'mistake') mistakeCount += 1;
    if (classification.key === 'blunder') blunderCount += 1;

    if (classification.key === 'mistake' || classification.key === 'blunder') {
      const blunderType = classifyBlunderType({
        fenAfter: move.fen,
        moverColor: move.color,
        opponentBestUci: after.bestMove,
      });
      if (blunderType?.key === 'hanging-piece') hangingPieceCount += 1;
      else if (blunderType?.key === 'missed-tactic') missedTacticCount += 1;
      else if (blunderType?.key === 'positional') positionalErrorCount += 1;
    }
  });

  if (ownMoveIndex === 0) return null;

  return {
    acpl: mean(losses),
    blunderRate: blunderCount / ownMoveIndex,
    mistakeRate: mistakeCount / ownMoveIndex,
    inaccuracyRate: inaccuracyCount / ownMoveIndex,
    bestMoveRate: bestMoveCount / ownMoveIndex,
    hangingPieceRate: hangingPieceCount / ownMoveIndex,
    missedTacticRate: missedTacticCount / ownMoveIndex,
    positionalErrorRate: positionalErrorCount / ownMoveIndex,
    lossVolatility: stdev(losses),
    openingAcpl: mean(openingLosses),
    restAcpl: mean(restLosses),
    numMoves: ownMoveIndex,
  };
}

/** Convenience wrapper returning features for both sides in one call. */
export function extractGameFeatures({ moves, evals }) {
  return {
    white: extractPlayerFeatures({ moves, evals, color: 'w' }),
    black: extractPlayerFeatures({ moves, evals, color: 'b' }),
  };
}
