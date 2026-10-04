#!/usr/bin/env node
/**
 * Fits a small ridge-regularized multiple linear regression predicting
 * player rating from the move-quality feature vector, on a standardized
 * (zero-mean, unit-variance) copy of the features. No ML library needed —
 * the feature count is small enough that plain Gaussian elimination on the
 * normal equations is exact and fast.
 *
 * Writes public/models/rating-model.json, the artifact the browser app
 * loads for client-side inference (see src/ml/predictRating.js).
 *
 * Usage: node training/train-model.mjs [--in=training/data/dataset.json] [--out=public/models/rating-model.json] [--ridge=1.0]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURE_KEYS } from '../src/ml/features.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);

const IN_PATH = args.in ?? fileURLToPath(new URL('data/dataset.json', import.meta.url));
const OUT_PATH = args.out ?? fileURLToPath(new URL('../public/models/rating-model.json', import.meta.url));
const RIDGE = Number(args.ridge ?? 1.0);

/** Deterministic shuffle so re-running with the same data reproduces the same split. */
function seededShuffle(array, seed = 42) {
  const a = [...array];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Solves Ax = b via Gaussian elimination with partial pivoting. A is mutated. */
function solve(A, b) {
  const n = A.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    }
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];

    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      for (let k = col; k < n; k++) A[row][k] -= factor * A[col][k];
      b[row] -= factor * b[col];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) sum -= A[row][k] * x[k];
    x[row] = sum / A[row][row];
  }
  return x;
}

/** Fits `rating ~ 1 + features` (bias is the last coefficient) via ridge regression. */
function fitRidge(featureRows, targets, ridge) {
  const n = featureRows.length;
  const k = FEATURE_KEYS.length + 1; // + bias column

  const X = featureRows.map((row) => [...FEATURE_KEYS.map((key) => row[key]), 1]);

  // Normal equations: (X^T X + ridge * I) beta = X^T y. The bias column
  // isn't penalized (ridge only shrinks the feature weights).
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * targets[i];
      for (let bIdx = 0; bIdx < k; bIdx++) {
        XtX[a][bIdx] += X[i][a] * X[i][bIdx];
      }
    }
  }
  for (let a = 0; a < k - 1; a++) XtX[a][a] += ridge;

  const beta = solve(XtX, Xty);
  return { weights: beta.slice(0, k - 1), intercept: beta[k - 1] };
}

function predict({ weights, intercept }, row) {
  return intercept + FEATURE_KEYS.reduce((sum, key, i) => sum + weights[i] * row[key], 0);
}

const rows = JSON.parse(readFileSync(IN_PATH, 'utf8'));
console.log(`Loaded ${rows.length} rows.`);

const means = Object.fromEntries(FEATURE_KEYS.map((key) => [key, 0]));
const stds = Object.fromEntries(FEATURE_KEYS.map((key) => [key, 1]));
for (const key of FEATURE_KEYS) {
  const values = rows.map((r) => r[key]);
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  means[key] = m;
  stds[key] = Math.sqrt(variance) || 1;
}

const standardized = rows.map((row) => {
  const out = { rating: row.rating };
  for (const key of FEATURE_KEYS) out[key] = (row[key] - means[key]) / stds[key];
  return out;
});

const shuffled = seededShuffle(standardized);
const splitAt = Math.floor(shuffled.length * 0.8);
const trainRows = shuffled.slice(0, splitAt);
const valRows = shuffled.slice(splitAt);

const model = fitRidge(trainRows, trainRows.map((r) => r.rating), RIDGE);

const valPreds = valRows.map((row) => predict(model, row));
const valTargets = valRows.map((row) => row.rating);
const mae = valPreds.reduce((s, p, i) => s + Math.abs(p - valTargets[i]), 0) / valPreds.length;
const meanTarget = valTargets.reduce((s, v) => s + v, 0) / valTargets.length;
const ssTot = valTargets.reduce((s, v) => s + (v - meanTarget) ** 2, 0);
const ssRes = valPreds.reduce((s, p, i) => s + (p - valTargets[i]) ** 2, 0);
const r2 = 1 - ssRes / ssTot;

console.log(`Validation MAE: ${mae.toFixed(1)} rating points, R²: ${r2.toFixed(3)}`);

const artifact = {
  featureKeys: FEATURE_KEYS,
  means,
  stds,
  weights: Object.fromEntries(FEATURE_KEYS.map((key, i) => [key, model.weights[i]])),
  intercept: model.intercept,
  metadata: {
    trainedAt: new Date().toISOString(),
    sourceDataset: 'https://database.lichess.org (rated blitz/rapid/classical games)',
    ridge: RIDGE,
    sampleSize: rows.length,
    trainRows: trainRows.length,
    valRows: valRows.length,
    valMAE: mae,
    valR2: r2,
  },
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2));
console.log(`Wrote model to ${OUT_PATH}`);
