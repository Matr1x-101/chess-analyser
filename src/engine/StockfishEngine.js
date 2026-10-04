const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`;
const SEARCH_DEPTH = 14;

/**
 * Thin wrapper around the Stockfish WASM worker speaking the UCI protocol.
 * Requests are serialized: only one `go` search runs at a time.
 */
export class StockfishEngine {
  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.ready = this._handshake();
    this.queue = Promise.resolve();
  }

  _handshake() {
    return new Promise((resolve, reject) => {
      const onMessage = (e) => {
        const line = e.data;
        if (line === 'uciok') {
          this.worker.postMessage('isready');
        } else if (line === 'readyok') {
          this.worker.removeEventListener('message', onMessage);
          resolve();
        }
      };
      this.worker.addEventListener('message', onMessage);
      this.worker.addEventListener('error', (err) => reject(err));
      this.worker.postMessage('uci');
    });
  }

  /**
   * Analyze a FEN position. Resolves with the best move (UCI form, e.g. "e2e4")
   * and a score from the perspective of the side to move: either `cp`
   * (centipawns) or `mate` (moves to mate), exactly one of which is set.
   */
  async analyze(fen, depth = SEARCH_DEPTH) {
    await this.ready;
    this.queue = this.queue.then(() => this._runSearch(fen, depth));
    return this.queue;
  }

  _runSearch(fen, depth) {
    return new Promise((resolve) => {
      let lastScore = null;

      const onMessage = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;

        if (line.startsWith('info') && line.includes(' score ')) {
          // Ignore info lines from lower-depth iterations that arrive after
          // a deeper one due to multi-pv noise; always take the latest score.
          const mateMatch = line.match(/score mate (-?\d+)/);
          const cpMatch = line.match(/score cp (-?\d+)/);
          if (mateMatch) {
            lastScore = { mate: parseInt(mateMatch[1], 10) };
          } else if (cpMatch) {
            lastScore = { cp: parseInt(cpMatch[1], 10) };
          }
        } else if (line.startsWith('bestmove')) {
          this.worker.removeEventListener('message', onMessage);
          const parts = line.split(' ');
          const bestMove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
          resolve({
            bestMove,
            ...(lastScore ?? { cp: 0 }),
          });
        }
      };

      this.worker.addEventListener('message', onMessage);
      this.worker.postMessage('ucinewgame');
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
