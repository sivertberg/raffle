"use client";

const DICE_FACES = ["\u2680", "\u2681", "\u2682", "\u2683", "\u2684", "\u2685"];

interface DiceIconProps {
  face: number; // 1-6
  hidden?: boolean;
  highlight?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function DiceIcon({
  face,
  hidden = false,
  highlight = false,
  size = "md",
}: DiceIconProps) {
  const sizeClasses = {
    sm: "text-2xl w-8 h-8",
    md: "text-4xl w-12 h-12",
    lg: "text-5xl w-16 h-16",
  };

  if (hidden) {
    return (
      <span
        className={`${sizeClasses[size]} inline-flex items-center justify-center rounded-lg bg-neutral-700 text-neutral-400 select-none`}
      >
        ?
      </span>
    );
  }

  return (
    <span
      className={`${sizeClasses[size]} inline-flex items-center justify-center rounded-lg select-none transition-colors ${
        highlight
          ? "bg-amber-500/20 text-amber-300 ring-2 ring-amber-500"
          : "text-white"
      }`}
    >
      {DICE_FACES[face - 1]}
    </span>
  );
}

export { DICE_FACES };
