import { FaSquareXTwitter } from "react-icons/fa6";
import { HiMiniCommandLine } from "react-icons/hi2";
import { RiGrokAiFill } from "react-icons/ri";
import { SiDogecoin, SiTesla } from "react-icons/si";

type IconDefinition =
  | { kind: "image"; src: string; alt: string }
  | { kind: "component"; component: typeof HiMiniCommandLine; alt: string };

/** Semantic clue IDs stay in the seed; raster assets and React icons share one renderer. */
export const EMOJI_CLUE_ICONS: Record<string, IconDefinition> = {
  "keystroke": { kind: "image", src: "/emoji-clues/keystroke.png", alt: "ALT key" },
  alibaba: { kind: "image", src: "/emoji-clues/alibaba.png", alt: "Alibaba symbol" },
  ibm: { kind: "image", src: "/emoji-clues/ibm.png", alt: "IBM letters" },
  bird: { kind: "image", src: "/emoji-clues/bird.png", alt: "bird" },
  moon: { kind: "image", src: "/emoji-clues/moon.png", alt: "moon" },
  "point-cloud": { kind: "image", src: "/emoji-clues/point-cloud.png", alt: "point cloud" },
  "projection-axis": { kind: "image", src: "/emoji-clues/projection-axis.png", alt: "projection axis" },
  clown: { kind: "image", src: "/emoji-clues/clown.png", alt: "clown" },
  "is-this-true": { kind: "image", src: "/emoji-clues/is-this-true.png", alt: "is this true?" },
  "red-planet": { kind: "image", src: "/emoji-clues/red-planet.png", alt: "red planet" },
  "tesla-cybertruck": { kind: "image", src: "/emoji-clues/tesla-cybertruck.png", alt: "Tesla Cybertruck" },

  "command-line": { kind: "component", component: HiMiniCommandLine, alt: "command line" },
  grok: { kind: "component", component: RiGrokAiFill, alt: "grok logo" },
  tesla: { kind: "component", component: SiTesla , alt: "Tesla logo" },
  x: { kind: "component", component: FaSquareXTwitter, alt: "X (prev twitter) logo" },
  doge: { kind: "component", component: SiDogecoin, alt: "Doge logo" },
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
