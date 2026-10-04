import { Chess } from 'chess.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { AccuracyChart } from './components/AccuracyChart.jsx';
import { AnalysisPanel } from './components/AnalysisPanel.jsx';
import { EvalBar } from './components/EvalBar.jsx';
import { MoveList } from './components/MoveList.jsx';
import { PgnLoader } from './components/PgnLoader.jsx';
import { RatingEstimate } from './components/RatingEstimate.jsx';
import { classifyMove } from './engine/evaluation.js';
import { useEngineAnalysis } from './hooks/useEngineAnalysis.js';
import { extractGameFeatures } from './ml/features.js';
import './App.css';

const START_FEN = new Chess().fen();

function App() {
  const [moves, setMoves] = useState([]); // { san, uci, fen, color }
  const [currentPly, setCurrentPly] = useState(0);
  const [pgnError, setPgnError] = useState(null);

  const { evals, engineReady, pendingCount, requestEval, reset } = useEngineAnalysis();

  const displayFen = currentPly === 0 ? START_FEN : moves[currentPly - 1].fen;

  // Queue analysis for every position in the game whenever the move list changes.
  useEffect(() => {
    if (!engineReady) return;
    requestEval(0, START_FEN);
    moves.forEach((move, idx) => requestEval(idx + 1, move.fen));
  }, [engineReady, moves, requestEval]);

  const classifications = useMemo(() => {
    return moves.map((move, idx) => {
      const before = evals[idx];
      const after = evals[idx + 1];
      if (!before || !after) return null;
      return classifyMove({
        whitePovCpBefore: before.whitePovCp,
        whitePovCpAfter: after.whitePovCp,
        moverColor: move.color,
        playedUci: move.uci,
        bestMoveUci: before.bestMove,
      });
    });
  }, [moves, evals]);

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }) => {
      if (!targetSquare) return false;

      const baseFen = currentPly === 0 ? START_FEN : moves[currentPly - 1].fen;
      const chess = new Chess(baseFen);

      let result;
      try {
        result = chess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      } catch {
        return false;
      }
      if (!result) return false;

      const newMove = {
        san: result.san,
        uci: result.from + result.to + (result.promotion ?? ''),
        fen: result.after,
        color: result.color,
      };

      setMoves((prev) => [...prev.slice(0, currentPly), newMove]);
      setCurrentPly(currentPly + 1);
      setPgnError(null);
      return true;
    },
    [currentPly, moves],
  );

  const handleLoadPgn = useCallback(
    (pgnText) => {
      if (!pgnText.trim()) return;
      const chess = new Chess();
      try {
        chess.loadPgn(pgnText, { strict: false });
      } catch (err) {
        setPgnError(err instanceof Error ? err.message : 'Could not parse PGN.');
        return;
      }

      const history = chess.history({ verbose: true });
      if (history.length === 0) {
        setPgnError('No moves found in that PGN.');
        return;
      }

      const newMoves = history.map((move) => ({
        san: move.san,
        uci: move.from + move.to + (move.promotion ?? ''),
        fen: move.after,
        color: move.color,
      }));

      reset();
      setMoves(newMoves);
      setCurrentPly(newMoves.length);
      setPgnError(null);
    },
    [reset],
  );

  const analyzedCount = Object.keys(evals).length;
  const totalPositions = moves.length + 1;
  const isBatchAnalyzing = pendingCount > 0 && analyzedCount < totalPositions;
  const isFullyAnalyzed = moves.length > 0 && analyzedCount === totalPositions;

  const gameFeatures = useMemo(
    () => (isFullyAnalyzed ? extractGameFeatures({ moves, evals }) : { white: null, black: null }),
    [isFullyAnalyzed, moves, evals],
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>Chess Analyzer</h1>
        <p className="app-subtitle">Play, paste a PGN, or upload a game — Stockfish evaluates every move in your browser.</p>
      </header>

      <main className="app-main">
        <section className="board-section">
          <EvalBar evalData={evals[currentPly]} />
          <div className="board-wrapper">
            <Chessboard
              options={{
                position: displayFen,
                onPieceDrop: handlePieceDrop,
                boardOrientation: 'white',
                id: 'analysis-board',
              }}
            />
          </div>
        </section>

        <aside className="side-panel">
          <AnalysisPanel
            engineReady={engineReady}
            evalData={evals[currentPly]}
            displayFen={displayFen}
            playedSan={currentPly > 0 ? moves[currentPly - 1].san : null}
            classification={currentPly > 0 ? classifications[currentPly - 1] : null}
          />

          {isBatchAnalyzing && (
            <div className="analysis-progress">
              Analyzing game… {analyzedCount}/{totalPositions}
              <div className="analysis-progress-bar">
                <div
                  className="analysis-progress-fill"
                  style={{ width: `${(analyzedCount / totalPositions) * 100}%` }}
                />
              </div>
            </div>
          )}

          {isFullyAnalyzed && <RatingEstimate whiteFeatures={gameFeatures.white} blackFeatures={gameFeatures.black} />}

          <MoveList
            moves={moves}
            classifications={classifications}
            currentPly={currentPly}
            onSelectPly={setCurrentPly}
          />

          <PgnLoader onLoad={handleLoadPgn} error={pgnError} />
        </aside>
      </main>

      <section className="chart-section">
        <AccuracyChart
          moves={moves}
          evals={evals}
          classifications={classifications}
          currentPly={currentPly}
          onSelectPly={setCurrentPly}
        />
      </section>
    </div>
  );
}

export default App;
