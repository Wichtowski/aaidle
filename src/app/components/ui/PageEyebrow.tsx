import type { ReactNode } from "react";
import { BackButton } from "./BackButton";

export function PageEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow page-eyebrow">
      <BackButton />
      <span>{children}</span>
    </p>
  );
}
