import { ImageResponse } from "next/og";

export const alt = "aAIdle daily AI model game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#f6f5f0",
        color: "#17202c",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          fontSize: 42,
          fontWeight: 800,
          letterSpacing: -2,
        }}
      >
        a<span style={{ color: "#e84f33" }}>AI</span>dle
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div
          style={{
            color: "#e84f33",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          A daily deduction game
        </div>
        <div
          style={{
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: -5,
            lineHeight: 0.95,
            maxWidth: "950px",
          }}
        >
          Can you identify today’s AI model?
        </div>
      </div>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <div style={{ color: "#607084", fontSize: 28 }}>Compare the clues. Make your guess.</div>
        <div
          style={{
            background: "#e84f33",
            color: "#fffefa",
            display: "flex",
            fontSize: 24,
            fontWeight: 800,
            padding: "17px 25px",
          }}
        >
          Play today
        </div>
      </div>
    </div>,
    size,
  );
}
