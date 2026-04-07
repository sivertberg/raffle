"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  calcDimensions,
  makeInitialState,
  makePrivateState,
  applyAction,
  getCurrentPlayer,
  rollDice,
  evaluateCall,
  actionToCall,
  SIDES,
  type Dimensions,
} from "@/lib/game-logic";
import { useOnnxModel } from "@/hooks/useOnnxModel";

/* ── Dice rendering ── */

const DICE_DOTS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 2], [2, 0]],
  3: [[0, 2], [1, 1], [2, 0]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function Die({ value, size = 40, hidden = false, color = "#fff" }: {
  value: number; size?: number; hidden?: boolean; color?: string;
}) {
  const r = size * 0.08;
  if (hidden) return (
    <div style={{ width: size, height: size, borderRadius: 6, background: "#64748b", border: "2px solid #475569", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: size * 0.5, fontWeight: 700 }}>?</div>
  );
  const dots = DICE_DOTS[value] || [];
  const pad = size * 0.22;
  const gap = (size - 2 * pad - 2 * r) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect x={1} y={1} width={size - 2} height={size - 2} rx={6} fill={color} stroke="#334155" strokeWidth={2} />
      {dots.map(([row, col], i) => (
        <circle key={i} cx={pad + r + col * gap} cy={pad + r + row * gap} r={r} fill="#1e293b" />
      ))}
    </svg>
  );
}

/* ── Constants ── */

const PHASE = { SETUP: 0, LOADING: 1, PLAY: 2, REVEAL: 3, GAME_OVER: 4 } as const;
type Phase = (typeof PHASE)[keyof typeof PHASE];

const BOT_NAME = "Captain";

/* ── Component ── */

export default function GameBoard() {
  const [phase, setPhase] = useState<Phase>(PHASE.SETUP);
  const [startDice, setStartDice] = useState(5);
  const [diceCount, setDiceCount] = useState<[number, number]>([5, 5]); // [human, robot]
  const [humanDice, setHumanDice] = useState<number[]>([]);
  const [robotDice, setRobotDice] = useState<number[]>([]);
  const [humanId, setHumanId] = useState<0 | 1>(0);
  const [currentBid, setCurrentBid] = useState<{ qty: number; face: number } | null>(null);
  const [lastBidder, setLastBidder] = useState<"human" | "robot" | null>(null);
  const [bidQty, setBidQty] = useState(1);
  const [bidFace, setBidFace] = useState(2);
  const [log, setLog] = useState<string[]>([]);
  const [revealResult, setRevealResult] = useState<{
    actual: number; bidValid: boolean; humanLoses: boolean; calledBy: "human" | "robot";
  } | null>(null);
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState<[number, number]>([0, 0]); // [human, robot]
  const [isRobotThinking, setIsRobotThinking] = useState(false);

  // Tensor state for ONNX
  const [pubState, setPubState] = useState<Float32Array | null>(null);
  const [privStates, setPrivStates] = useState<[Float32Array, Float32Array] | null>(null);
  const [lastAction, setLastAction] = useState(-1);

  const logRef = useRef<HTMLDivElement>(null);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Positional dice for calcDimensions: d1 = player0, d2 = player1
  const d1 = humanId === 0 ? diceCount[0] : diceCount[1];
  const d2 = humanId === 0 ? diceCount[1] : diceCount[0];
  const dims = calcDimensions(d1, d2);
  const { isLoading, sampleAction } = useOnnxModel(d1, d2);

  // Refs for values accessed in callbacks to avoid stale closures
  const diceCountRef = useRef(diceCount);
  diceCountRef.current = diceCount;
  const humanDiceRef = useRef(humanDice);
  humanDiceRef.current = humanDice;
  const robotDiceRef = useRef(robotDice);
  robotDiceRef.current = robotDice;
  const scoresRef = useRef(scores);
  scoresRef.current = scores;
  const humanIdRef = useRef(humanId);
  humanIdRef.current = humanId;
  const dimsRef = useRef(dims);
  dimsRef.current = dims;
  const pubStateRef = useRef(pubState);
  pubStateRef.current = pubState;
  const privStatesRef = useRef(privStates);
  privStatesRef.current = privStates;
  const lastActionRef = useRef(lastAction);
  lastActionRef.current = lastAction;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  useEffect(() => {
    return () => { if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current); };
  }, []);

  const addLog = useCallback((msg: string) => setLog(p => [...p, msg]), []);

  const totalDice = diceCount[0] + diceCount[1];

  /* ── Start game ── */

  const startGame = () => {
    const dc: [number, number] = [startDice, startDice];
    setDiceCount(dc);
    setRound(1);
    setScores([0, 0]);
    setLog(["🎲 Round 1 — Everyone rolls!"]);
    setPhase(PHASE.LOADING);
    // Will transition to PLAY once model is loaded
  };

  // Once loading finishes, start the first round
  const startedRef = useRef(false);
  useEffect(() => {
    if (phase === PHASE.LOADING && !isLoading) {
      startedRef.current = true;
      beginRound(diceCount, 0 as 0 | 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isLoading]);

  const beginRound = useCallback((dc: [number, number], hId: 0 | 1) => {
    const hDice = rollDice(dc[0]);
    const rDice = rollDice(dc[1]);
    const pos0 = hId === 0 ? dc[0] : dc[1];
    const pos1 = hId === 0 ? dc[1] : dc[0];
    const newDims = calcDimensions(pos0, pos1);
    const state = makeInitialState(newDims);
    const hPriv = makePrivateState(hDice, hId, newDims);
    const rPriv = makePrivateState(rDice, (hId === 0 ? 1 : 0) as 0 | 1, newDims);

    setHumanDice(hDice);
    setRobotDice(rDice);
    setHumanId(hId);
    setPubState(state);
    setPrivStates([hPriv, rPriv]);
    setLastAction(-1);
    setCurrentBid(null);
    setLastBidder(null);
    setBidQty(1);
    setBidFace(2);
    setRevealResult(null);
    setIsRobotThinking(false);
    setPhase(PHASE.PLAY);

    const starter = getCurrentPlayer(state, newDims);
    if (starter === hId) {
      addLog("You start.");
    } else {
      addLog(`${BOT_NAME} starts.`);
      // Trigger robot turn
      triggerRobotTurn(state, rPriv, -1, newDims);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog]);

  /* ── Robot turn ── */

  const triggerRobotTurn = useCallback((state: Float32Array, rPriv: Float32Array, lastAct: number, curDims: Dimensions) => {
    setIsRobotThinking(true);
    aiTimeoutRef.current = setTimeout(async () => {
      const action = await sampleAction(state, rPriv, lastAct, curDims);
      const call = actionToCall(action, curDims.nActions);

      if (!call) {
        // Robot calls liar
        addLog(`${BOT_NAME} calls LIAR!`);
        resolveLiar("robot", lastAct);
      } else {
        // Robot bids
        applyAction(state, action, curDims);
        setPubState(new Float32Array(state));
        setLastAction(action);
        setCurrentBid({ qty: call.count, face: call.face });
        setLastBidder("robot");
        addLog(`${BOT_NAME} bids ${call.count}× face ${call.face}`);
        setIsRobotThinking(false);
      }
    }, 800 + Math.random() * 700);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleAction, addLog]);

  /* ── Resolve liar call ── */

  const resolveLiar = useCallback((calledBy: "human" | "robot", bidAction: number) => {
    const curHumanDice = humanDiceRef.current;
    const curRobotDice = robotDiceRef.current;

    const bidWasValid = evaluateCall(curHumanDice, curRobotDice, bidAction);
    // If you call liar and the bid was valid, you lose. If you call liar and it was a bluff, bidder loses.
    const humanLoses = calledBy === "human" ? bidWasValid : !bidWasValid;

    const call = actionToCall(bidAction, dimsRef.current.nActions);
    const actual = call ? [...curHumanDice, ...curRobotDice].filter(v =>
      v === call.face || (call.face !== 1 && v === 1)
    ).length : 0;

    setRevealResult({ actual, bidValid: bidWasValid, humanLoses, calledBy });
    setIsRobotThinking(false);
    setPhase(PHASE.REVEAL);
  }, []);

  /* ── Proceed after reveal ── */

  const proceedAfterReveal = useCallback(() => {
    if (!revealResult) return;
    const curDiceCount = diceCountRef.current;
    const curScores = scoresRef.current;

    const newDiceCount: [number, number] = [...curDiceCount];
    if (revealResult.humanLoses) {
      newDiceCount[0] -= 1;
    } else {
      newDiceCount[1] -= 1;
    }
    setDiceCount(newDiceCount);

    const loserName = revealResult.humanLoses ? "You" : BOT_NAME;

    if (newDiceCount[0] <= 0 || newDiceCount[1] <= 0) {
      const humanWins = newDiceCount[0] > 0;
      const newScores: [number, number] = [...curScores];
      if (humanWins) newScores[0] += 1; else newScores[1] += 1;
      setScores(newScores);
      addLog(`💀 ${loserName} eliminated!`);
      addLog(`🏆 ${humanWins ? "You" : BOT_NAME} win${humanWins ? "" : "s"} the game!`);
      setPhase(PHASE.GAME_OVER);
      return;
    }

    addLog(`${loserName} lose${revealResult.humanLoses ? "" : "s"} a die (${revealResult.humanLoses ? newDiceCount[0] : newDiceCount[1]} left)`);

    const newRound = round + 1;
    setRound(newRound);
    // Loser starts next round
    const newHumanId = revealResult.humanLoses ? (humanIdRef.current) : ((humanIdRef.current === 0 ? 1 : 0) as 0 | 1);
    addLog(`🎲 Round ${newRound} — ${revealResult.humanLoses ? "You" : BOT_NAME} start${revealResult.humanLoses ? "" : "s"}.`);
    beginRound(newDiceCount, newHumanId);
  }, [revealResult, round, addLog, beginRound]);

  /* ── Human actions ── */

  const humanBid = () => {
    if (phase !== PHASE.PLAY || isRobotThinking) return;
    if (!pubState || !privStates) return;

    const action = (bidQty - 1) * SIDES + (bidFace - 1);
    if (action <= lastAction) return; // Must be higher

    const state = new Float32Array(pubState);
    applyAction(state, action, dims);
    setPubState(state);
    setLastAction(action);
    setCurrentBid({ qty: bidQty, face: bidFace });
    setLastBidder("human");
    addLog(`You bid ${bidQty}× face ${bidFace}`);

    // Trigger robot turn
    const rPriv = privStates[1];
    triggerRobotTurn(state, rPriv, action, dims);
  };

  const humanLiar = () => {
    if (phase !== PHASE.PLAY || isRobotThinking || lastBidder === null) return;
    addLog("You call LIAR!");
    resolveLiar("human", lastAction);
  };

  const canBid = (() => {
    const action = (bidQty - 1) * SIDES + (bidFace - 1);
    return action > lastAction;
  })();

  /* ── Setup screen ── */

  if (phase === PHASE.SETUP) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ background: "#1e293b", borderRadius: 16, padding: 40, maxWidth: 400, width: "100%", border: "1px solid #334155", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎲</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#f8fafc" }}>Raffel</h1>
          <p style={{ color: "#94a3b8", marginBottom: 28 }}>Liar&apos;s Dice</p>
          <div style={{ marginBottom: 28, textAlign: "left" }}>
            <label style={{ fontSize: 14, color: "#94a3b8", display: "block", marginBottom: 6 }}>Dice per player</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setStartDice(n)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "2px solid", borderColor: startDice === n ? "#3b82f6" : "#475569", background: startDice === n ? "#3b82f6" : "transparent", color: startDice === n ? "#fff" : "#94a3b8", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>{n}</button>
              ))}
            </div>
          </div>
          <button onClick={startGame} style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}>Start Game</button>
        </div>
      </div>
    );
  }

  /* ── Loading screen ── */

  if (phase === PHASE.LOADING || isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Loading AI brain...</div>
          <div style={{ color: "#64748b", marginTop: 8 }}>This may take a moment</div>
        </div>
      </div>
    );
  }

  /* ── Game screen ── */

  const isMyTurn = phase === PHASE.PLAY && !isRobotThinking;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🎲 Raffel <span style={{ fontSize: 14, color: "#64748b", fontWeight: 400 }}>Round {round}</span></h2>
          <span style={{ fontSize: 13, color: "#64748b" }}>Score: {scores[0]}–{scores[1]} · {totalDice} dice in play</span>
        </div>

        {/* Opponent (robot) */}
        <div style={{
          background: isRobotThinking ? "#1e3a5f" : "#1e293b",
          borderRadius: 12, padding: 12, marginBottom: 16,
          border: `2px solid ${isRobotThinking ? "#3b82f6" : "#334155"}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: isRobotThinking ? "#60a5fa" : "#cbd5e1" }}>
            {BOT_NAME} <span style={{ fontWeight: 400, fontSize: 12, color: "#64748b" }}>({diceCount[1]}d)</span>
            {isRobotThinking && <span style={{ marginLeft: 8, fontSize: 12, color: "#60a5fa" }}>thinking...</span>}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(phase === PHASE.REVEAL || phase === PHASE.GAME_OVER
              ? robotDice
              : Array(diceCount[1]).fill(0)
            ).map((v: number, j: number) => (
              <Die key={j} value={v} size={32} hidden={phase !== PHASE.REVEAL && phase !== PHASE.GAME_OVER} />
            ))}
          </div>
        </div>

        {/* Current bid display */}
        {currentBid && phase === PHASE.PLAY && (
          <div style={{ background: "#334155", borderRadius: 10, padding: "10px 16px", marginBottom: 12, textAlign: "center", fontSize: 15 }}>
            Current bid: <strong>{currentBid.qty}× face {currentBid.face}</strong>
            <span style={{ color: "#64748b", marginLeft: 8 }}>by {lastBidder === "human" ? "You" : BOT_NAME}</span>
          </div>
        )}

        {/* Reveal phase */}
        {phase === PHASE.REVEAL && revealResult && currentBid && (
          <div style={{ background: revealResult.bidValid ? "#14532d" : "#7f1d1d", borderRadius: 12, padding: 16, marginBottom: 12, textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {revealResult.bidValid
                ? `✅ Bid was valid! (${revealResult.actual} matched ≥ ${currentBid.qty} bid)`
                : `❌ Bid was a lie! (only ${revealResult.actual} matched, needed ${currentBid.qty})`}
            </div>
            <div style={{ fontSize: 14, color: "#e2e8f0" }}>
              {revealResult.humanLoses ? "You lose" : `${BOT_NAME} loses`} a die!
            </div>
            <button onClick={proceedAfterReveal} style={{ marginTop: 12, padding: "10px 28px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Next Round →</button>
          </div>
        )}

        {/* Game over */}
        {phase === PHASE.GAME_OVER && (
          <div style={{ background: "linear-gradient(135deg, #14532d, #166534)", borderRadius: 12, padding: 20, marginBottom: 12, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 4 }}>🏆</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{diceCount[0] > 0 ? "You" : BOT_NAME} win{diceCount[0] > 0 ? "" : "s"}!</div>
            <button onClick={() => { setPhase(PHASE.SETUP); setLog([]); }} style={{ marginTop: 14, padding: "10px 28px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Play Again</button>
          </div>
        )}

        {/* Your hand */}
        <div style={{
          background: "#1e293b",
          borderRadius: 14, padding: 16, marginBottom: 12,
          border: `2px solid ${isMyTurn ? "#3b82f6" : "#334155"}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: isMyTurn ? "#60a5fa" : "#94a3b8" }}>
            Your Hand {isMyTurn && "— Your turn!"}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {humanDice.map((v, j) => <Die key={j} value={v} size={48} color="#f1f5f9" />)}
          </div>

          {isMyTurn && phase === PHASE.PLAY && (
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Quantity</label>
                <select value={bidQty} onChange={e => setBidQty(+e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #475569", background: "#0f172a", color: "#e2e8f0", fontSize: 15 }}>
                  {Array.from({ length: totalDice }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Face</label>
                <select value={bidFace} onChange={e => setBidFace(+e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #475569", background: "#0f172a", color: "#e2e8f0", fontSize: 15 }}>
                  {[2, 3, 4, 5, 6].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <button onClick={humanBid} disabled={!canBid} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: canBid ? "#22c55e" : "#475569", color: "#fff", fontWeight: 700, fontSize: 14, cursor: canBid ? "pointer" : "not-allowed", opacity: canBid ? 1 : 0.5 }}>
                Bid
              </button>
              {currentBid && lastBidder === "robot" && (
                <button onClick={humanLiar} style={{ padding: "8px 20px", borderRadius: 8, border: "2px solid #ef4444", background: "transparent", color: "#ef4444", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  🤥 Liar!
                </button>
              )}
            </div>
          )}
        </div>

        {/* Log */}
        <div ref={logRef} style={{ background: "#0f172a", borderRadius: 10, padding: 12, maxHeight: 180, overflowY: "auto", fontSize: 13, lineHeight: 1.6, color: "#94a3b8", border: "1px solid #1e293b" }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}
