import { Chess } from 'chess.js';

/** Convert a UCI move ("e2e4", "e7e8q") into SAN, given the FEN it's played from. */
export function uciToSan(fen, uci) {
  if (!fen || !uci) return null;
  const chess = new Chess(fen);
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4) : undefined;
  try {
    const move = chess.move({ from, to, promotion });
    return move.san;
  } catch {
    return null;
  }
}
