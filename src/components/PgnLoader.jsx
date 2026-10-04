import { useRef, useState } from 'react';

export function PgnLoader({ onLoad, error }) {
  const [text, setText] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      setText(content);
      onLoad(content);
    };
    reader.readAsText(file);
  };

  return (
    <div className="pgn-loader">
      <textarea
        className="pgn-textarea"
        placeholder="Paste a PGN (Lichess / Chess.com export)…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
      />
      <div className="pgn-loader-actions">
        <button type="button" onClick={() => onLoad(text)} disabled={!text.trim()}>
          Load PGN
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Upload .pgn file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pgn,text/plain"
          hidden
          onChange={handleFileChange}
        />
      </div>
      {error && <div className="pgn-error">{error}</div>}
    </div>
  );
}
