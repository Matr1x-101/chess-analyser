import { useMemo } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const EVAL_CLAMP_CP = 1000; // ±10 pawns — beyond this the exact number stops mattering visually.

function clampEval(whitePovCp) {
  return Math.max(-EVAL_CLAMP_CP, Math.min(EVAL_CLAMP_CP, whitePovCp)) / 100;
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  if (point.ply === 0) {
    return (
      <div className="chart-tooltip">
        <strong>Start position</strong>
      </div>
    );
  }
  return (
    <div className="chart-tooltip">
      <strong>
        {point.moveNumber}. {point.color === 'b' ? '…' : ''}
        {point.san}
      </strong>
      <div>Eval: {point.whiteAdv >= point.blackAdv ? '+' : ''}{(point.whiteAdv + point.blackAdv).toFixed(2)}</div>
      {point.loss > 0 && (
        <div style={{ color: point.severityColor }}>
          {point.color === 'w' ? 'White' : 'Black'} lost {Math.round(point.loss)}cp ({point.classificationLabel})
        </div>
      )}
    </div>
  );
}

/**
 * Per-move eval + accuracy chart: the shaded area shows each side's
 * advantage over the course of the game (where it swung), and the
 * diverging bars pinpoint exactly which move caused each swing.
 */
export function AccuracyChart({ moves, evals, classifications, currentPly, onSelectPly }) {
  const data = useMemo(() => {
    const points = [];

    const startEval = evals[0];
    points.push({
      ply: 0,
      moveNumber: 0,
      san: null,
      color: null,
      whiteAdv: startEval ? Math.max(0, clampEval(startEval.whitePovCp)) : 0,
      blackAdv: startEval ? Math.min(0, clampEval(startEval.whitePovCp)) : 0,
      loss: 0,
      barValue: 0,
      severityColor: null,
      classificationLabel: null,
      hasEval: Boolean(startEval),
    });

    moves.forEach((move, idx) => {
      const ply = idx + 1;
      const evalData = evals[ply];
      const classification = classifications[idx];
      const cp = evalData ? clampEval(evalData.whitePovCp) : null;
      const loss = classification?.loss ?? 0;

      points.push({
        ply,
        moveNumber: Math.ceil(ply / 2),
        san: move.san,
        color: move.color,
        whiteAdv: cp !== null ? Math.max(0, cp) : null,
        blackAdv: cp !== null ? Math.min(0, cp) : null,
        loss,
        barValue: move.color === 'w' ? -loss : loss,
        severityColor: classification?.color ?? null,
        classificationLabel: classification?.label ?? null,
        hasEval: Boolean(evalData),
      });
    });

    return points.filter((p) => p.hasEval || p.ply === 0);
  }, [moves, evals, classifications]);

  if (moves.length === 0) {
    return null;
  }

  return (
    <div className="card accuracy-chart">
      <h3 className="accuracy-chart-title">Accuracy over the game</h3>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={(state) => {
            const ply = state?.activePayload?.[0]?.payload?.ply;
            if (ply !== undefined) onSelectPly(ply);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="ply"
            tickFormatter={(ply) => {
              if (ply === 0) return 'Start';
              // Only label White's ply for a given move number — labeling
              // both halves doubles up every tick and clutters the axis.
              return ply % 2 === 1 ? Math.ceil(ply / 2) : '';
            }}
            stroke="var(--text-muted)"
            fontSize={12}
            minTickGap={20}
          />
          <YAxis
            yAxisId="eval"
            domain={[-EVAL_CLAMP_CP / 100, EVAL_CLAMP_CP / 100]}
            stroke="var(--text-muted)"
            fontSize={12}
            width={32}
          />
          <YAxis yAxisId="loss" orientation="right" hide domain={[-1000, 1000]} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine yAxisId="eval" y={0} stroke="var(--border)" />
          <ReferenceLine yAxisId="eval" x={currentPly} stroke="var(--accent)" strokeWidth={2} />
          <Area
            yAxisId="eval"
            dataKey="whiteAdv"
            stroke="none"
            fill="#eceff3"
            fillOpacity={0.9}
            isAnimationActive={false}
            connectNulls
          />
          <Area
            yAxisId="eval"
            dataKey="blackAdv"
            stroke="none"
            fill="#35383e"
            fillOpacity={0.9}
            isAnimationActive={false}
            connectNulls
          />
          <Bar yAxisId="loss" dataKey="barValue" isAnimationActive={false} maxBarSize={6}>
            {data.map((point) => (
              <Cell key={point.ply} fill={point.severityColor ?? 'transparent'} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
