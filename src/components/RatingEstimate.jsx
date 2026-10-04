import { useEffect, useState } from 'react';
import { predictRating } from '../ml/predictRating.js';

function RatingRow({ side, estimate }) {
  return (
    <div className="rating-estimate-row">
      <span className="rating-estimate-side">{side}</span>
      <span className="rating-estimate-value">
        {estimate ? (
          <>
            ~{estimate.rating} <span className="rating-estimate-margin">± {estimate.margin}</span>
          </>
        ) : (
          <span className="rating-estimate-margin">not enough moves</span>
        )}
      </span>
    </div>
  );
}

/** Renders once a game is fully analyzed, given each side's move-quality feature vector (src/ml/features.js). */
export function RatingEstimate({ whiteFeatures, blackFeatures }) {
  const [status, setStatus] = useState('loading');
  const [estimates, setEstimates] = useState({ white: null, black: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([predictRating(whiteFeatures), predictRating(blackFeatures)])
      .then(([white, black]) => {
        if (cancelled) return;
        setEstimates({ white, black });
        setStatus('done');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [whiteFeatures, blackFeatures]);

  return (
    <div className="card rating-estimate">
      <h3 className="rating-estimate-title">Estimated rating</h3>

      {status === 'loading' && <p className="analysis-status">Estimating…</p>}
      {status === 'error' && <p className="analysis-status">Couldn't load the rating model.</p>}

      {status === 'done' && (
        <>
          <RatingRow side="White" estimate={estimates.white} />
          <RatingRow side="Black" estimate={estimates.black} />
          <p className="rating-estimate-note">
            Estimated from move-quality patterns — centipawn loss, blunder rate, and blunder type (hanging pieces vs.
            missed tactics vs. positional errors) — using a model trained on real rated games from{' '}
            <a href="https://database.lichess.org" target="_blank" rel="noreferrer">
              database.lichess.org
            </a>{' '}
            analyzed with Stockfish. Approximate, especially for short games.
          </p>
        </>
      )}
    </div>
  );
}
