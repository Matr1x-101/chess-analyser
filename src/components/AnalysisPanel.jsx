import { advantageLabel, formatScore } from '../engine/evaluation.js';
import { uciToSan } from '../utils/chessHelpers.js';

export function AnalysisPanel({ engineReady, evalData, displayFen, playedSan, classification }) {
  if (!engineReady) {
    return (
      <div className="analysis-panel">
        <p className="analysis-status">Loading chess engine…</p>
      </div>
    );
  }

  const bestMoveSan = evalData?.bestMove ? uciToSan(displayFen, evalData.bestMove) : null;

  return (
    <div className="analysis-panel">
      {evalData ? (
        <>
          <div className="analysis-score-row">
            <span className="analysis-score">{formatScore(evalData, evalData.sideToMove)}</span>
            <span className="analysis-advantage">{advantageLabel(evalData.whitePovCp)}</span>
          </div>
          <div className="analysis-line">
            <span className="analysis-line-label">Engine's top choice</span>
            <span className="analysis-line-value">{bestMoveSan ?? '—'}</span>
          </div>
        </>
      ) : (
        <p className="analysis-status">Analyzing position…</p>
      )}

      {playedSan && (
        <div className="analysis-line analysis-played">
          <span className="analysis-line-label">Move played</span>
          <span className="analysis-line-value">
            {playedSan}
            {classification && (
              <span className="move-badge move-badge-inline" style={{ backgroundColor: classification.color }}>
                {classification.label}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
