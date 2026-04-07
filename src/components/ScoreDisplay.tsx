"use client";

interface ScoreDisplayProps {
  humanScore: number;
  robotScore: number;
}

export default function ScoreDisplay({
  humanScore,
  robotScore,
}: ScoreDisplayProps) {
  return (
    <div className="flex items-center gap-6 text-sm font-medium">
      <div className="flex items-center gap-2">
        <span className="text-blue-400">You</span>
        <span className="text-2xl font-bold text-white">{humanScore}</span>
      </div>
      <span className="text-neutral-600">-</span>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-white">{robotScore}</span>
        <span className="text-orange-400">Robot</span>
      </div>
    </div>
  );
}
