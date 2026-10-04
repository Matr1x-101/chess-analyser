import { Chess } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StockfishEngine } from '../engine/StockfishEngine.js';
import { MATE_CP_BASE, toWhitePovCp } from '../engine/evaluation.js';

/**
 * Owns the Stockfish worker and a per-ply evaluation cache keyed by move
 * index (0 = starting position). Requests are submitted in the order the
 * caller wants them processed; the engine itself serializes searches.
 */
export function useEngineAnalysis() {
  const engineRef = useRef(null);
  const pendingRef = useRef(new Set());
  const evaluatedRef = useRef(new Set());
  const [evals, setEvals] = useState({});
  const [engineReady, setEngineReady] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    engine.ready.then(() => setEngineReady(true));
    return () => engine.terminate();
  }, []);

  const requestEval = useCallback((ply, fen) => {
    if (pendingRef.current.has(ply) || evaluatedRef.current.has(ply)) return;

    const sideToMove = fen.split(' ')[1] === 'b' ? 'b' : 'w';

    // Positions with no legal moves (checkmate/stalemate) aren't meaningful
    // "go depth N" searches — resolve them directly instead of asking the
    // engine, whose mate-0 edge case is otherwise ambiguous.
    const board = new Chess(fen);
    if (board.isGameOver()) {
      evaluatedRef.current.add(ply);
      const checkmate = board.isCheckmate();
      setEvals((prev) => ({
        ...prev,
        [ply]: {
          bestMove: null,
          isCheckmate: checkmate,
          isDraw: !checkmate,
          sideToMove,
          whitePovCp: checkmate ? (sideToMove === 'w' ? -MATE_CP_BASE : MATE_CP_BASE) : 0,
        },
      }));
      return;
    }

    const engine = engineRef.current;
    if (!engine) return;

    pendingRef.current.add(ply);
    setPendingCount(pendingRef.current.size);

    engine.analyze(fen).then((result) => {
      pendingRef.current.delete(ply);
      evaluatedRef.current.add(ply);
      setPendingCount(pendingRef.current.size);
      setEvals((prev) => ({
        ...prev,
        [ply]: {
          ...result,
          sideToMove,
          whitePovCp: toWhitePovCp(result, sideToMove),
        },
      }));
    });
  }, []);

  const reset = useCallback(() => {
    pendingRef.current.clear();
    evaluatedRef.current.clear();
    setPendingCount(0);
    setEvals({});
  }, []);

  return { evals, engineReady, pendingCount, requestEval, reset };
}
