function MoveCell({ san, ply, classification, active, onSelect }) {
  return (
    <button
      type="button"
      className="move-cell"
      data-active={active || undefined}
      onClick={() => onSelect(ply)}
    >
      <span>{san}</span>
      {classification && (
        <span
          className="move-badge"
          style={{ backgroundColor: classification.color }}
          title={classification.label}
        >
          {classification.label[0]}
        </span>
      )}
    </button>
  );
}

export function MoveList({ moves, classifications, currentPly, onSelectPly }) {
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      number: i / 2 + 1,
      white: moves[i],
      whitePly: i + 1,
      black: moves[i + 1],
      blackPly: i + 2,
    });
  }

  return (
    <div className="move-list">
      <button
        type="button"
        className="move-row move-row-start"
        data-active={currentPly === 0 || undefined}
        onClick={() => onSelectPly(0)}
      >
        Start position
      </button>
      {pairs.map((pair) => (
        <div className="move-row" key={pair.number}>
          <span className="move-number">{pair.number}.</span>
          <MoveCell
            san={pair.white.san}
            ply={pair.whitePly}
            classification={classifications[pair.whitePly - 1]}
            active={currentPly === pair.whitePly}
            onSelect={onSelectPly}
          />
          {pair.black && (
            <MoveCell
              san={pair.black.san}
              ply={pair.blackPly}
              classification={classifications[pair.blackPly - 1]}
              active={currentPly === pair.blackPly}
              onSelect={onSelectPly}
            />
          )}
        </div>
      ))}
      {moves.length === 0 && <div className="move-list-empty">No moves yet — play on the board or load a PGN.</div>}
    </div>
  );
}
