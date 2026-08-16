"use client";

import { useEffect } from "react";
import { FaXmark } from "react-icons/fa6";

export type ToastVariant = "error" | "success";

export function Toast({
  message,
  variant = "error",
  onDismiss,
}: {
  message: string | null;
  variant?: ToastVariant;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(onDismiss, 5_000);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="toast" data-variant={variant} role={variant === "error" ? "alert" : "status"}>
      <span>{message}</span>
      <button aria-label="Dismiss notification" onClick={onDismiss} type="button">
        <FaXmark aria-hidden="true" />
      </button>
    </div>
  );
}
