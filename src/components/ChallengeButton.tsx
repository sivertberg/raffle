"use client";

interface ChallengeButtonProps {
  onChallenge: () => void;
  disabled?: boolean;
  visible?: boolean;
}

export default function ChallengeButton({
  onChallenge,
  disabled = false,
  visible = true,
}: ChallengeButtonProps) {
  if (!visible) return null;

  return (
    <button
      onClick={onChallenge}
      disabled={disabled}
      className={`px-6 py-3 rounded-lg text-lg font-bold uppercase tracking-wider transition-all ${
        disabled
          ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
          : "bg-red-600 text-white hover:bg-red-500 active:bg-red-700 cursor-pointer shadow-lg shadow-red-900/30"
      }`}
    >
      Liar!
    </button>
  );
}
