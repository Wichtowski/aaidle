import { HiMiniCommandLine } from "react-icons/hi2";

type IconDefinition =
  | { kind: "image"; src: string; alt: string }
  | { kind: "component"; component: typeof HiMiniCommandLine; alt: string };

/** Semantic clue IDs stay in the seed; raster assets and React icons share one renderer. */
export const EMOJI_CLUE_ICONS: Record<string, IconDefinition> = {
  "keystroke": { kind: "image", src: "/emoji-clues/keystroke.png", alt: "ALT key" },
  meta: { kind: "image", src: "/emoji-clues/meta.png", alt: "Meta symbol" },
  alibaba: { kind: "image", src: "/emoji-clues/alibaba.png", alt: "Alibaba symbol" },
  windows: { kind: "image", src: "/emoji-clues/windows.png", alt: "four-pane window" },
  ibm: { kind: "image", src: "/emoji-clues/ibm.png", alt: "IBM letters" },
  bird: { kind: "image", src: "/emoji-clues/bird.png", alt: "bird" },
  moon: { kind: "image", src: "/emoji-clues/moon.png", alt: "moon" },
  "point-cloud": { kind: "image", src: "/emoji-clues/point-cloud.png", alt: "point cloud" },
  "projection-axis": { kind: "image", src: "/emoji-clues/projection-axis.png", alt: "projection axis" },
  "command-line": { kind: "component", component: HiMiniCommandLine, alt: "command line" },
};

export function EmojiClueIcon({ icon }: { icon: string }) {
  const definition = EMOJI_CLUE_ICONS[icon];
  if (!definition) return <span aria-label="unknown emoji clue">?</span>;
  if (definition.kind === "image") return <img alt={definition.alt} src={definition.src} />;
  const Icon = definition.component;
  return (
    <span aria-label={definition.alt} role="img">
      <Icon aria-hidden />
    </span>
  );
}
