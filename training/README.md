# Rating model training pipeline

Produces `public/models/rating-model.json`, the small linear model the app loads
client-side (`src/ml/predictRating.js`) to estimate each player's rating from
move-quality features (`src/ml/features.js`).

The shipped model is trained on a modest real sample gathered in a sandboxed
environment — on the order of a few hundred rated Lichess games, not the full
multi-GB monthly database. It's a genuine, working pipeline against real data
and real Stockfish analysis, but treat its accuracy accordingly. Rerun it with
a bigger `--bytes`/`--count` and higher `--depth` for a stronger model.

## Steps

```bash
# 1. Sample real rated games from a Lichess monthly dump (database.lichess.org)
#    without downloading the whole multi-GB file — range-requests just the
#    first slice of bytes and decompresses that slice with the system zstd.
node training/fetch-sample-games.mjs --month=2026-06 --bytes=8000000 --count=250

# 2. Run real Stockfish analysis over every position of every sampled game.
#    Resumable: rerun with --resume to continue after an interruption.
node training/analyze-games.mjs --depth=10

# 3. Turn the raw evals into a labeled feature dataset (one row per player
#    per game), using the exact feature extractor the browser app uses.
node training/build-dataset.mjs

# 4. Fit the ridge-regularized linear regression and write the model artifact.
node training/train-model.mjs
```

Each step prints its own progress/stats (games sampled, rating range,
validation MAE/R²) so you can sanity-check before moving to the next step.

## Notes

- `training/data/` is gitignored — regenerate it by rerunning the steps above.
- `analyze-games.mjs` uses the `stockfish` npm package (a Node-runnable build
  of the same Stockfish 18 engine vendored in `public/engine/` for the
  browser), not a browser Worker — it's a devDependency only, never bundled
  into the app.
- Bumping the model beyond a linear regression (e.g. gradient-boosted trees)
  would need a JS-side inference implementation to match — keep training and
  `src/ml/predictRating.js` in lockstep if you change the model type.
