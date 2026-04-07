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
} from "@/lib/game-logic";
import { useOnnxModel } from "@/hooks/useOnnxModel";
import DiceHand from "./DiceHand";
import BidGrid from "./BidGrid";
import ChallengeButton from "./ChallengeButton";
import GameHistory, { HistoryEntry } from "./GameHistory";
import ScoreDisplay from "./ScoreDisplay";
import { DICE_FACES } from "./DiceIcon";

type Phase = "bidding" | "robot-thinking" | "round-over" | "game-over";

const ROBOT_PHRASES = [
  "I'll say",
  "Maybe",
  "Hmm,",
  "How about",
  "Let's go with",
  "I think",
  "I'll raise to",
  "Going with",
  "Try this:",
  "My bet:",
];

function randomPhrase(): string {
  return ROBOT_PHRASES[Math.floor(Math.random() * ROBOT_PHRASES.length)];
}

function formatBid(action: number, nActions: number): string {
  const call = actionToCall(action, nActions);
  if (!call) return "Liar!";
  return `${call.count} ${DICE_FACES[call.face - 1]}`;
}

const INITIAL_DICE = 5;

export default function GameBoard() {
  const [diceCount, setDiceCount] = useState<[number, number]>([
    INITIAL_DICE,
    INITIAL_DICE,
  ]);
  const [humanDice, setHumanDice] = useState<number[]>([]);
  const [robotDice, setRobotDice] = useState<number[]>([]);
  const [humanId, setHumanId] = useState<0 | 1>(0);
  const [lastBid, setLastBid] = useState(-1);
  const [pubState, setPubState] = useState<Float32Array | null>(null);
  const [privStates, setPrivStates] = useState<[Float32Array, Float32Array] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [phase, setPhase] = useState<Phase>("bidding");
  const [revealedRobotDice, setRevealedRobotDice] = useState(false);
  const [highlightFaces, setHighlightFaces] = useState<number[]>([]);
  const [roundMessage, setRoundMessage] = useState("");

  // diceCount is semantic: [humanDice, robotDice] — never positional
  // Derive positional (player0, player1) for calcDimensions based on humanId
  const robotId = (humanId === 0 ? 1 : 0) as 0 | 1;
  const d1 = humanId === 0 ? diceCount[0] : diceCount[1];
  const d2 = humanId === 0 ? diceCount[1] : diceCount[0];
  const dims = calcDimensions(d1, d2);
  const { isLoading, sampleAction } = useOnnxModel(d1, d2);

  const lastBidRef = useRef(lastBid);
  lastBidRef.current = lastBid;
  const pubStateRef = useRef(pubState);
  pubStateRef.current = pubState;
  const privStatesRef = useRef(privStates);
  privStatesRef.current = privStates;

  // dc is semantic: [humanDice, robotDice]
  const startRound = useCallback(
    (
      dc: [number, number],
      hId: 0 | 1,
      prevHistory: HistoryEntry[]
    ) => {
      const hDice = rollDice(dc[0]);
      const rDice = rollDice(dc[1]);
      // Positional: player0 dice, player1 dice
      const pos0 = hId === 0 ? dc[0] : dc[1];
      const pos1 = hId === 0 ? dc[1] : dc[0];
      const newDims = calcDimensions(pos0, pos1);
      const state = makeInitialState(newDims);
      const hPriv = makePrivateState(hDice, hId, newDims);
      const rPriv = makePrivateState(rDice, (hId === 0 ? 1 : 0) as 0 | 1, newDims);

      setHumanDice(hDice);
      setRobotDice(rDice);
      setPubState(state);
      setPrivStates([hPriv, rPriv]);
      setLastBid(-1);
      setRevealedRobotDice(false);
      setHighlightFaces([]);
      setRoundMessage("");

      const starter = getCurrentPlayer(state, newDims);
      const newEntry: HistoryEntry = {
        type: "system",
        message: `New round! ${starter === hId ? "You go" : "Robot goes"} first. (${dc[0]} vs ${dc[1]} dice)`,
      };
      const updatedHistory = [...prevHistory, newEntry];
      setHistory(updatedHistory);

      if (starter === hId) {
        setPhase("bidding");
      } else {
        setPhase("robot-thinking");
      }

      return { state, hPriv, rPriv, rDice, hDice, newDims, starter, updatedHistory };
    },
    []
  );

  // Initialize first round
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const { state, rPriv, newDims, starter } = startRound(
      [INITIAL_DICE, INITIAL_DICE],
      0,
      []
    );
    if (starter !== 0) {
      // Robot goes first — trigger robot turn after state settles
      setTimeout(() => {
        doRobotTurn(state, rPriv, -1, newDims);
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doRobotTurn = useCallback(
    async (
      state: Float32Array,
      rPriv: Float32Array,
      currentLastBid: number,
      currentDims: ReturnType<typeof calcDimensions>
    ) => {
      setPhase("robot-thinking");
      // Small delay for UX
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));

      const action = await sampleAction(state, rPriv, currentLastBid, currentDims);
      const nActions = currentDims.nActions;
      const call = actionToCall(action, nActions);

      if (!call) {
        // Robot calls liar
        setHistory((prev) => [
          ...prev,
          { type: "robot", message: "LIAR! I don't believe you!", action },
        ]);
        // Resolve challenge — the last bidder was human
        resolveChallenge(currentLastBid, "robot-called");
      } else {
        // Robot makes a bid
        applyAction(state, action, currentDims);
        setPubState(new Float32Array(state));
        setLastBid(action);
        const bidStr = formatBid(action, nActions);
        setHistory((prev) => [
          ...prev,
          {
            type: "robot",
            message: `${randomPhrase()} ${bidStr}`,
            action,
          },
        ]);
        setPhase("bidding");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sampleAction]
  );

  const resolveChallenge = useCallback(
    (bidAction: number, caller: "human-called" | "robot-called") => {
      const call = actionToCall(bidAction, dims.nActions);
      if (!call) return;

      // evaluateCall returns true if the call was valid (caller of liar loses)
      const bidWasValid = evaluateCall(humanDice, robotDice, bidAction);

      // evaluateCall returns true if the bid was valid (enough dice exist).
      // If bid was valid → the liar-caller was wrong → they lose.
      // If bid was a bluff → the liar-caller was right → the bidder loses.
      const humanLoses = caller === "human-called" ? bidWasValid : !bidWasValid;

      setRevealedRobotDice(true);
      // Highlight the called face and aces (face 1 is wild)
      setHighlightFaces([1, call.face]);

      const loserStr = humanLoses ? "You lose" : "Robot loses";
      const reasonStr = caller === "human-called"
        ? bidWasValid
          ? `The bid of ${call.count} ${DICE_FACES[call.face - 1]} was valid!`
          : `The bid of ${call.count} ${DICE_FACES[call.face - 1]} was a bluff!`
        : bidWasValid
          ? `Your bid of ${call.count} ${DICE_FACES[call.face - 1]} was valid!`
          : `Your bid of ${call.count} ${DICE_FACES[call.face - 1]} was a bluff!`;

      setRoundMessage(`${reasonStr} ${loserStr} a die.`);
      setHistory((prev) => [
        ...prev,
        { type: "system", message: `${reasonStr} ${loserStr} a die.` },
      ]);

      // Update dice counts — diceCount is [human, robot]
      const newDiceCount: [number, number] = [...diceCount];
      if (humanLoses) {
        newDiceCount[0] -= 1;
      } else {
        newDiceCount[1] -= 1;
      }
      setDiceCount(newDiceCount);

      if (newDiceCount[0] <= 0 || newDiceCount[1] <= 0) {
        const humanWins = newDiceCount[0] > 0;
        const newScores: [number, number] = [...scores];
        if (humanWins) {
          newScores[0] += 1;
        } else {
          newScores[1] += 1;
        }
        setScores(newScores);
        setHistory((prev) => [
          ...prev,
          {
            type: "system",
            message: humanWins ? "You win the game!" : "Robot wins the game!",
          },
        ]);
        setPhase("game-over");
      } else {
        setPhase("round-over");
      }
    },
    [humanDice, robotDice, diceCount, humanId, robotId, dims.nActions, scores]
  );

  const handleHumanBid = useCallback(
    (action: number) => {
      if (phase !== "bidding" || !pubState || !privStates) return;

      const state = new Float32Array(pubState);
      applyAction(state, action, dims);
      setPubState(state);
      setLastBid(action);

      const bidStr = formatBid(action, dims.nActions);
      setHistory((prev) => [
        ...prev,
        { type: "human", message: bidStr, action },
      ]);

      // Trigger robot turn
      const rPriv = privStates[1];
      doRobotTurn(state, rPriv, action, dims);
    },
    [phase, pubState, privStates, dims, doRobotTurn]
  );

  const handleHumanChallenge = useCallback(() => {
    if (phase !== "bidding" || lastBid < 0) return;
    setHistory((prev) => [
      ...prev,
      { type: "human", message: "LIAR! I don't believe you!" },
    ]);
    resolveChallenge(lastBid, "human-called");
  }, [phase, lastBid, resolveChallenge]);

  const handleNextRound = useCallback(() => {
    const newHumanId = (humanId === 0 ? 1 : 0) as 0 | 1;
    setHumanId(newHumanId);

    const { state, rPriv, newDims, starter } = startRound(
      diceCount,
      newHumanId,
      history
    );

    if (starter !== newHumanId) {
      setTimeout(() => {
        doRobotTurn(state, rPriv, -1, newDims);
      }, 500);
    }
  }, [humanId, diceCount, history, startRound, doRobotTurn]);

  const handleNewGame = useCallback(() => {
    const newDiceCount: [number, number] = [INITIAL_DICE, INITIAL_DICE];
    setDiceCount(newDiceCount);
    const newHumanId: 0 | 1 = 0;
    setHumanId(newHumanId);

    const { state, rPriv, newDims, starter } = startRound(
      newDiceCount,
      newHumanId,
      [{ type: "system", message: "New game started!" }]
    );

    if (starter !== newHumanId) {
      setTimeout(() => {
        doRobotTurn(state, rPriv, -1, newDims);
      }, 500);
    }
  }, [startRound, doRobotTurn]);

  const currentPlayer = pubState ? getCurrentPlayer(pubState, dims) : humanId;
  const totalDice = diceCount[0] + diceCount[1];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="text-4xl animate-pulse">Loading AI model...</div>
          <div className="text-neutral-500">This may take a moment</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Liar&apos;s Dice
          </h1>
          <ScoreDisplay humanScore={scores[0]} robotScore={scores[1]} />
        </div>

        {/* Robot hand */}
        <div className="bg-neutral-900/50 rounded-xl p-4 border border-neutral-800">
          <DiceHand
            dice={robotDice}
            hidden={!revealedRobotDice}
            highlightFaces={revealedRobotDice ? highlightFaces : []}
            label="Robot"
          />
        </div>

        {/* Game history */}
        <GameHistory entries={history} />

        {/* Phase message */}
        {phase === "robot-thinking" && (
          <div className="text-center text-orange-400 text-sm animate-pulse">
            Robot is thinking...
          </div>
        )}
        {roundMessage && (phase === "round-over" || phase === "game-over") && (
          <div className="text-center text-amber-300 text-sm font-medium">
            {roundMessage}
          </div>
        )}

        {/* Human hand */}
        <div className="bg-neutral-900/50 rounded-xl p-4 border border-neutral-800">
          <DiceHand
            dice={humanDice}
            hidden={false}
            highlightFaces={revealedRobotDice ? highlightFaces : []}
            label="Your Hand"
          />
        </div>

        {/* Controls */}
        {phase === "bidding" && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <ChallengeButton
                onChallenge={handleHumanChallenge}
                disabled={lastBid < 0 || currentPlayer !== humanId}
                visible={lastBid >= 0}
              />
            </div>
            <BidGrid
              totalDice={totalDice}
              lastBid={lastBid}
              onBid={handleHumanBid}
              disabled={currentPlayer !== humanId}
            />
          </div>
        )}

        {phase === "round-over" && (
          <div className="flex justify-center">
            <button
              onClick={handleNextRound}
              className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-colors cursor-pointer"
            >
              Next Round
            </button>
          </div>
        )}

        {phase === "game-over" && (
          <div className="flex justify-center">
            <button
              onClick={handleNewGame}
              className="px-6 py-3 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-500 transition-colors cursor-pointer"
            >
              New Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
