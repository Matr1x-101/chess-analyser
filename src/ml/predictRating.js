import { FEATURE_KEYS } from './features.js';

const MODEL_URL = `${import.meta.env.BASE_URL}models/rating-model.json`;

let modelPromise = null;

/** Fetches and caches the offline-trained rating model (see training/train-model.mjs). */
export function loadRatingModel() {
  if (!modelPromise) {
    modelPromise = fetch(MODEL_URL).then((res) => {
      if (!res.ok) throw new Error(`Failed to load rating model: HTTP ${res.status}`);
      return res.json();
    });
  }
  return modelPromise;
}

/**
 * Estimates a player's rating from their move-quality feature vector
 * (see src/ml/features.js). Returns null if fewer than a handful of moves
 * were played — too little signal for a meaningful estimate.
 */
export async function predictRating(features) {
  if (!features || features.numMoves < 6) return null;

  const model = await loadRatingModel();
  const rating = model.featureKeys.reduce((sum, key) => {
    const standardized = (features[key] - model.means[key]) / model.stds[key];
    return sum + model.weights[key] * standardized;
  }, model.intercept);

  // Fewer moves means less evidence to go on — widen the stated margin
  // for short games rather than reporting a falsely precise number.
  const shortGamePenalty = Math.max(1, 20 / features.numMoves);
  const margin = model.metadata.valMAE * shortGamePenalty;

  return { rating: Math.round(rating), margin: Math.round(margin) };
}

export { FEATURE_KEYS };
