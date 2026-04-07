"use client";

import DiceIcon from "./DiceIcon";

interface DiceHandProps {
  dice: number[];
  hidden?: boolean;
  highlightFaces?: number[];
  label: string;
}

export default function DiceHand({
  dice,
  hidden = false,
  highlightFaces = [],
  label,
}: DiceHandProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-medium text-neutral-400 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex gap-2">
        {dice.map((face, i) => (
          <DiceIcon
            key={i}
            face={face}
            hidden={hidden}
            highlight={highlightFaces.includes(face)}
          />
        ))}
        {dice.length === 0 && (
          <span className="text-neutral-500 text-sm italic">No dice</span>
        )}
      </div>
    </div>
  );
}
