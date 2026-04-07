"use client";

import { useEffect, useRef } from "react";

export interface HistoryEntry {
  type: "human" | "robot" | "system";
  message: string;
  action?: number;
}

interface GameHistoryProps {
  entries: HistoryEntry[];
}

export default function GameHistory({ entries }: GameHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div
      ref={scrollRef}
      className="w-full h-48 overflow-y-auto rounded-lg bg-neutral-900/50 border border-neutral-800 p-3 space-y-1.5"
    >
      {entries.length === 0 && (
        <p className="text-neutral-600 text-sm italic text-center pt-4">
          No moves yet...
        </p>
      )}
      {entries.map((entry, i) => {
        const colorClass =
          entry.type === "human"
            ? "text-blue-400"
            : entry.type === "robot"
              ? "text-orange-400"
              : "text-neutral-400";
        const prefix =
          entry.type === "human"
            ? "You"
            : entry.type === "robot"
              ? "Robot"
              : "";

        return (
          <div key={i} className={`text-sm ${colorClass}`}>
            {prefix && (
              <span className="font-semibold">{prefix}: </span>
            )}
            <span className={entry.type === "system" ? "italic" : ""}>
              {entry.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
