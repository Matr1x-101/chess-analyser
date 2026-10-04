import { advantageLabel, evalToBarPercent, formatBarLabel } from '../engine/evaluation.js';

export function EvalBar({ evalData }) {
  if (!evalData) {
    return (
      <div className="eval-bar" aria-label="Evaluating position">
        <div className="eval-bar-fill-black" style={{ flexGrow: 50 }} />
        <div className="eval-bar-fill-white" style={{ flexGrow: 50 }} />
        <div className="eval-bar-label eval-bar-label-loading">…</div>
      </div>
    );
  }

  const percent = evalToBarPercent(evalData.whitePovCp);
  const label = formatBarLabel(evalData, evalData.sideToMove);

  return (
    <div className="eval-bar" title={advantageLabel(evalData.whitePovCp)}>
      <div className="eval-bar-fill-black" style={{ flexGrow: 100 - percent }} />
      <div className="eval-bar-fill-white" style={{ flexGrow: percent }} />
      <div className="eval-bar-label">{label}</div>
    </div>
  );
}
