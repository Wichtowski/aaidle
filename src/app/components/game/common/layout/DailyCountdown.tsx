"use client";
import { useEffect, useRef, useState } from "react";

const reloadPage = () => window.location.reload();

export function DailyCountdown({
  expiresAt,
  onExpiry = reloadPage,
}: {
  expiresAt: string;
  onExpiry?: () => void;
}) {
  const [left, setLeft] = useState(0);
  const reloadedForExpiry = useRef<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now();

      if (remaining <= 0) {
        if (reloadedForExpiry.current !== expiresAt) {
          reloadedForExpiry.current = expiresAt;
          onExpiry();
        }
        return;
      }

      setLeft(remaining);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpiry]);

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
