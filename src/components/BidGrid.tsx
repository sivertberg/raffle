"use client";

import { DICE_FACES } from "./DiceIcon";

interface BidGridProps {
  totalDice: number;
  lastBid: number;
  onBid: (action: number) => void;
  disabled?: boolean;
}

export default function BidGrid({
  totalDice,
  lastBid,
  onBid,
  disabled = false,
}: BidGridProps) {
  const faces = 6;
  // Actions: count 1..totalDice x face 1..6, laid out as (count-1)*6 + (face-1)
  // Action index = row * 6 + col where row = count-1, col = face-1

  const rows: { count: number; cells: { face: number; action: number }[] }[] =
    [];
  for (let count = 1; count <= totalDice; count++) {
    const cells = [];
    for (let face = 1; face <= faces; face++) {
      const action = (count - 1) * faces + (face - 1);
      cells.push({ face, action });
    }
    rows.push({ count, cells });
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${faces}, minmax(0, 1fr))` }}>
        {/* Header row */}
        {Array.from({ length: faces }, (_, i) => (
          <div
            key={`header-${i}`}
            className="text-center text-lg py-1 text-neutral-400"
          >
            {DICE_FACES[i]}
          </div>
        ))}

        {/* Bid cells */}
        {rows.map((row) =>
          row.cells.map((cell) => {
            const isDisabled = disabled || cell.action <= lastBid;
            return (
              <button
                key={cell.action}
                onClick={() => onBid(cell.action)}
                disabled={isDisabled}
                className={`px-2 py-1.5 text-sm rounded-md font-medium transition-colors whitespace-nowrap ${
                  isDisabled
                    ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                    : "bg-neutral-700 text-neutral-100 hover:bg-blue-600 hover:text-white cursor-pointer"
                }`}
              >
                {row.count} {DICE_FACES[cell.face - 1]}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
