/**
 * Core game logic for Liar's Dice (Snyd).
 *
 * Pure functions — no React, no ONNX.  These mirror the Python Game class in
 * training/snyd.py and the constants produced by calc_args().
 */

export const SIDES = 6;

/** Dimension constants derived from each player's dice count. */
export interface Dimensions {
  nActions: number;
  curIndex: number;
  dPubPerPlayer: number;
  dPub: number;
  dPri: number;
  priIndex: number;
}

/**
 * Compute tensor dimensions for a game where player 0 has `d1` dice and
 * player 1 has `d2` dice (joker variant).
 */
export function calcDimensions(d1: number, d2: number): Dimensions {
  // Maximum call is (d1+d2) of any face → (d1+d2)*SIDES possible calls
  // Plus 1 for the "liar" action
  const nActions = (d1 + d2) * SIDES + 1;
  const curIndex = nActions;
  const dPubPerPlayer = nActions + 1; // actions + current-player indicator
  const dPub = 2 * dPubPerPlayer;
  const dPri = Math.max(d1, d2) * SIDES + 2; // dice encoding + 2 for player indicator
  const priIndex = dPri - 2;
  return { nActions, curIndex, dPubPerPlayer, dPub, dPri, priIndex };
}

/**
 * Create the initial (zeroed) public state with player 0 set as current.
 */
export function makeInitialState(dims: Dimensions): Float32Array {
  const state = new Float32Array(dims.dPub);
  // Player 0 starts: set the cur indicator in player-0's half
  state[dims.curIndex] = 1;
  return state;
}

/**
 * Encode a player's dice roll into the private-state tensor.
 *
 * Encoding (matching the Python "Chinese poker" style):
 *   For each face 1-6, count how many dice show that face.
 *   Set positions (face-1)*maxDice + 0 .. (face-1)*maxDice + (count-1) to 1.
 *
 * The last two positions are a one-hot for the player index.
 */
export function makePrivateState(
  roll: number[],
  player: 0 | 1,
  dims: Dimensions,
): Float32Array {
  const priv = new Float32Array(dims.dPri);
  priv[dims.priIndex + player] = 1;

  const maxDice = (dims.priIndex) / SIDES; // = max(d1,d2)

  // Count occurrences of each face
  const counts = new Array<number>(SIDES + 1).fill(0); // index 1-6
  for (const die of roll) {
    counts[die]++;
  }
  for (let face = 1; face <= SIDES; face++) {
    for (let i = 0; i < counts[face]; i++) {
      priv[(face - 1) * maxDice + i] = 1;
    }
  }
  return priv;
}

/**
 * Apply an action to the public state (mutates the array in place).
 *
 * Sets the action bit in the current player's half of the state and flips
 * the current-player indicators.
 */
export function applyAction(
  state: Float32Array,
  action: number,
  dims: Dimensions,
): void {
  const cur = getCurrentPlayer(state, dims);
  // Mark this action in the current player's half
  state[action + cur * dims.dPubPerPlayer] = 1;
  // Flip current player indicators
  state[dims.curIndex + cur * dims.dPubPerPlayer] = 0;
  state[dims.curIndex + (1 - cur) * dims.dPubPerPlayer] = 1;
}

/**
 * Read the current player (0 or 1) from the state tensor.
 *
 * The convention (matching the Python code) is:
 *   cur = 1 - state[curIndex]
 * i.e. when curIndex (player-0's indicator) is 1, it is player 0's turn.
 */
export function getCurrentPlayer(
  state: Float32Array,
  dims: Dimensions,
): 0 | 1 {
  return (1 - state[dims.curIndex]) as 0 | 1;
}

/**
 * Roll `count` dice, returning an array of face values (1-6) sorted ascending.
 */
export function rollDice(count: number): number[] {
  const dice: number[] = [];
  for (let i = 0; i < count; i++) {
    dice.push(Math.floor(Math.random() * SIDES) + 1);
  }
  return dice.sort((a, b) => a - b);
}

/**
 * Evaluate whether a "liar" call was correct.
 *
 * Returns `true` if the *previous* claim was truthful (i.e. the caller of
 * "liar" loses), `false` if the previous claim was a bluff (caller wins).
 *
 * Joker variant: aces (1s) are wild and count toward every other face.
 * If the claimed face IS 1, only actual 1s count.
 *
 * `lastCall` is the action index of the claim being challenged (0-based).
 * action index `a` → count = floor(a/SIDES)+1, face = (a%SIDES)+1.
 */
export function evaluateCall(
  r1: number[],
  r2: number[],
  lastCall: number,
): boolean {
  // If there was no previous call (lastCall === -1), treat it as if the call
  // was good — the player who called liar immediately loses.
  if (lastCall < 0) return true;

  const n = Math.floor(lastCall / SIDES) + 1; // claimed count
  const d = (lastCall % SIDES) + 1; // claimed face

  const all = [...r1, ...r2];
  let actual: number;
  if (d === 1) {
    // Only literal 1s count
    actual = all.filter((v) => v === 1).length;
  } else {
    // Face d plus wild aces
    actual = all.filter((v) => v === d || v === 1).length;
  }

  return actual >= n;
}

/**
 * Convert an action index to a human-readable call, or `null` for "liar".
 *
 * Action indices 0 .. nActions-2 map to claims:
 *   count = floor(action / SIDES) + 1
 *   face  = (action % SIDES) + 1
 *
 * The last action (nActions - 1) is "liar".
 */
export function actionToCall(
  action: number,
  nActions: number,
): { count: number; face: number } | null {
  if (action === nActions - 1) return null; // liar
  const count = Math.floor(action / SIDES) + 1;
  const face = (action % SIDES) + 1;
  return { count, face };
}
