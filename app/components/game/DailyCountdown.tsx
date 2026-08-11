"use client";
import { useEffect, useState } from "react";

export function DailyCountdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return (
    <time aria-label="Time until next challenge" className="countdown">
      Next model in {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
      {String(seconds).padStart(2, "0")}
    </time>
  );
}
