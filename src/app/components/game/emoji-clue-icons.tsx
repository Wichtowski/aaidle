type IconDefinition = { kind: "image"; src: string; alt: string };

/** Semantic clue IDs stay in the seed; replace these small raster files without touching game data. */
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
};

export function EmojiClueIcon({ icon }: { icon: string }) {
  const definition = EMOJI_CLUE_ICONS[icon];
  if (!definition) return <span aria-label="unknown emoji clue">?</span>;
  return <img alt={definition.alt} src={definition.src} />;
}
