"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as ort from "onnxruntime-web";
import { type Dimensions, applyAction } from "@/lib/game-logic";

// Disable multi-threading to avoid issues with SharedArrayBuffer in most
// deployment setups (requires COOP/COEP headers).
ort.env.wasm.numThreads = 1;

/** Cache key → session so we never reload the same model. */
const sessionCache = new Map<string, ort.InferenceSession>();

function modelUrl(d1: number, d2: number): string {
  return `/models/model_${d1}${d2}_joker.onnx`;
}

async function getSession(d1: number, d2: number): Promise<ort.InferenceSession> {
  const key = `${d1}_${d2}`;
  const cached = sessionCache.get(key);
  if (cached) return cached;

  const session = await ort.InferenceSession.create(modelUrl(d1, d2));
  sessionCache.set(key, session);
  return session;
}

/** Run the value network: (priv, pub) → scalar float. */
async function evaluate(
  session: ort.InferenceSession,
  priv: Float32Array,
  pub: Float32Array,
): Promise<number> {
  const privTensor = new ort.Tensor("float32", priv, [priv.length]);
  const pubTensor = new ort.Tensor("float32", pub, [pub.length]);
  const results = await session.run({ priv: privTensor, pub: pubTensor });
  return (results.value.data as Float32Array)[0];
}

export interface UseOnnxModelResult {
  isLoading: boolean;
  /** Sample an action via regret-matching given the current game state. */
  sampleAction: (
    state: Float32Array,
    priv: Float32Array,
    lastCall: number,
    dims: Dimensions,
  ) => Promise<number>;
}

/**
 * React hook that loads an ONNX model for the given dice configuration and
 * exposes a `sampleAction` function implementing regret-matching inference.
 */
export function useOnnxModel(d1: number, d2: number): UseOnnxModelResult {
  const [isLoading, setIsLoading] = useState(true);
  const sessionRef = useRef<ort.InferenceSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getSession(d1, d2).then((s) => {
      if (!cancelled) {
        sessionRef.current = s;
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [d1, d2]);

  const sampleAction = useCallback(
    async (
      state: Float32Array,
      priv: Float32Array,
      lastCall: number,
      dims: Dimensions,
    ): Promise<number> => {
      const session = sessionRef.current;
      if (!session) {
        throw new Error("ONNX model not loaded yet");
      }

      // 1. Get value V of the current state
      const V = await evaluate(session, priv, state);

      // 2. For each legal action compute regrets
      const firstAction = lastCall + 1;
      const lastAction = dims.nActions - 1; // inclusive (liar)
      const nLegal = lastAction - firstAction + 1;

      const regrets = new Float32Array(nLegal);

      for (let i = 0; i < nLegal; i++) {
        const action = firstAction + i;
        // Clone state and apply the candidate action
        const childState = new Float32Array(state);
        applyAction(childState, action, dims);

        // Evaluate child from the SAME player's perspective (same priv)
        const Vi = await evaluate(session, priv, childState);
        regrets[i] = Math.max(Vi - V, 0);
      }

      // 3. Normalise to a probability distribution
      let sum = 0;
      for (let i = 0; i < nLegal; i++) sum += regrets[i];

      const probs = new Float32Array(nLegal);
      if (sum <= 0) {
        // Uniform when all regrets are zero
        for (let i = 0; i < nLegal; i++) probs[i] = 1 / nLegal;
      } else {
        for (let i = 0; i < nLegal; i++) probs[i] = regrets[i] / sum;
      }

      // 4. Weighted random sample
      const r = Math.random();
      let cumulative = 0;
      for (let i = 0; i < nLegal; i++) {
        cumulative += probs[i];
        if (r < cumulative) {
          return firstAction + i;
        }
      }
      // Fallback (floating-point edge case)
      return lastAction;
    },
    [], // stable — session accessed via ref
  );

  return { isLoading, sampleAction };
}
