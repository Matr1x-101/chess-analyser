import { Chess } from 'chess.js';

// Mate scores are represented internally as a centipawn-equivalent far outside
// any real evaluation, scaled so that a closer mate is (correctly) "more extreme".
export const MATE_CP_BASE = 100000;

/**
 * Convert a raw engine score (relative to the side to move in `fen`) into a
 * single signed number from White's perspective, in centipawns. Mate scores
 * are mapped to a very large magnitude so comparisons/sorting behave sanely.
 */
export function toWhitePovCp(score, sideToMove) {
  const sign = sideToMove === 'w' ? 1 : -1;
  if (score.mate !== undefined) {
    // mate 0 has no sign of its own; it only occurs when the side to move
    // has no legal moves left, i.e. is already checkmated, which is as bad
    // as it gets for that side.
    const mateSign = score.mate === 0 ? -1 : Math.sign(score.mate);
    const magnitude = MATE_CP_BASE - Math.abs(score.mate) * 100;
    return sign * mateSign * magnitude;
  }
  return sign * score.cp;
}

export function isMateScore(score) {
  return score.mate !== undefined;
}

/**
 * Winning-chances style transform (0-100, White's share) used to size the
 * eval bar. Uses the same logistic curve popularized by Lichess.
 */
export function evalToBarPercent(whitePovCp) {
  if (Math.abs(whitePovCp) >= MATE_CP_BASE - 10000) {
    return whitePovCp > 0 ? 100 : 0;
  }
  const winning = 2 / (1 + Math.exp(-0.00368208 * whitePovCp)) - 1;
  return 50 + 50 * winning;
}

/** Human readable "+1.4" / "-0.8" / "M3" / "-M2" style label. */
export function formatScore(score, sideToMove) {
  if (score.isCheckmate) return 'Checkmate';
  if (score.isDraw) return 'Draw';
  if (score.mate !== undefined) {
    const mateFromWhite = sideToMove === 'w' ? score.mate : -score.mate;
    return `M${Math.abs(mateFromWhite)}${mateFromWhite < 0 ? ' (Black)' : ''}`;
  }
  const whiteCp = sideToMove === 'w' ? score.cp : -score.cp;
  const pawns = whiteCp / 100;
  const sign = pawns > 0 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

/** Compact score label for the narrow eval bar (full words don't fit there). */
export function formatBarLabel(score, sideToMove) {
  if (score.isCheckmate) return sideToMove === 'w' ? '0-1' : '1-0';
  if (score.isDraw) return '½';
  return formatScore(score, sideToMove);
}

/** Coarse "Equal / Slight edge / Advantage / Winning / Decisive" advantage label. */
export function advantageLabel(whitePovCp) {
  const abs = Math.abs(whitePovCp);
  const side = whitePovCp >= 0 ? 'White' : 'Black';

  if (abs >= MATE_CP_BASE - 10000) {
    return `${side} has a forced mate`;
  }
  if (abs < 50) return 'Equal position';
  if (abs < 150) return `${side} is slightly better`;
  if (abs < 300) return `${side} is better`;
  if (abs < 600) return `${side} is winning`;
  return `${side} has a decisive advantage`;
}

const CLASSIFICATIONS = {
  BEST: { key: 'best', label: 'Best', color: '#2f9e44' },
  GOOD: { key: 'good', label: 'Good', color: '#66a80f' },
  INACCURACY: { key: 'inaccuracy', label: 'Inaccuracy', color: '#f0b400' },
  MISTAKE: { key: 'mistake', label: 'Mistake', color: '#e8590c' },
  BLUNDER: { key: 'blunder', label: 'Blunder', color: '#e03131' },
};

/**
 * Classify a played move by comparing the position's evaluation (from the
 * mover's perspective) before and after the move, plus whether it matched
 * the engine's top choice.
 */
export function classifyMove({ whitePovCpBefore, whitePovCpAfter, moverColor, playedUci, bestMoveUci }) {
  const sign = moverColor === 'w' ? 1 : -1;
  // Capped so a single already-lost/mate-adjacent position doesn't dominate
  // aggregate stats (ACPL, volatility) computed over many moves.
  const loss = Math.min(1000, Math.max(0, sign * (whitePovCpBefore - whitePovCpAfter)));

  if (bestMoveUci && playedUci === bestMoveUci) {
    return { ...CLASSIFICATIONS.BEST, loss };
  }

  if (loss < 10) return { ...CLASSIFICATIONS.BEST, loss };
  if (loss < 25) return { ...CLASSIFICATIONS.GOOD, loss };
  if (loss < 50) return { ...CLASSIFICATIONS.INACCURACY, loss };
  if (loss < 100) return { ...CLASSIFICATIONS.MISTAKE, loss };
  return { ...CLASSIFICATIONS.BLUNDER, loss };
}

const BLUNDER_TYPES = {
  HANGING_PIECE: { key: 'hanging-piece', label: 'Hanging piece' },
  MISSED_TACTIC: { key: 'missed-tactic', label: 'Missed tactic' },
  POSITIONAL: { key: 'positional', label: 'Positional error' },
};

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Only meaningful for moves already classified Mistake/Blunder. Uses the
 * opponent's engine-best reply in the resulting position (already fetched
 * for every ply as `evals[ply].bestMove`, so this needs no extra engine
 * calls) to distinguish a simple hung piece from a deeper missed tactic or
 * a slower positional slide.
 */
export function classifyBlunderType({ fenAfter, moverColor, opponentBestUci }) {
  if (!fenAfter || !opponentBestUci) return null;

  const chess = new Chess(fenAfter);
  const toSquare = opponentBestUci.slice(2, 4);
  const targetPiece = chess.get(toSquare);

  if (!targetPiece || targetPiece.color !== moverColor) {
    return BLUNDER_TYPES.POSITIONAL;
  }

  const value = PIECE_VALUES[targetPiece.type] ?? 0;
  if (value < 3) return BLUNDER_TYPES.POSITIONAL;

  const defenders = chess.attackers(toSquare, moverColor);
  return defenders.length === 0 ? BLUNDER_TYPES.HANGING_PIECE : BLUNDER_TYPES.MISSED_TACTIC;
}

export { CLASSIFICATIONS, BLUNDER_TYPES };
