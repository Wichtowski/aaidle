import { FaSquareXTwitter } from "react-icons/fa6";
import { HiMiniCommandLine } from "react-icons/hi2";
import { RiGrokAiFill } from "react-icons/ri";
import { SiDogecoin, SiTesla } from "react-icons/si";

type IconDefinition =
  | { kind: "image"; src: string; alt: string }
  | { kind: "component"; component: typeof HiMiniCommandLine; alt: string };

/** Semantic clue IDs stay in the seed; raster assets and React icons share one renderer. */
export const EMOJI_ICONS: Record<string, IconDefinition> = {
  keystroke: { kind: "image", src: "/emoji-visual/keystroke.png", alt: "ALT key" },
  bird: { kind: "image", src: "/emoji-visual/bird.png", alt: "bird" },
  moon: { kind: "image", src: "/emoji-visual/moon.png", alt: "moon" },
  "point-cloud": { kind: "image", src: "/emoji-visual/point-cloud.png", alt: "point cloud" },
  "projection-axis": {
    kind: "image",
    src: "/emoji-visual/projection-axis.png",
    alt: "projection axis",
  },
  clown: { kind: "image", src: "/emoji-visual/clown.png", alt: "clown" },
  "is-this-true": { kind: "image", src: "/emoji-visual/is-this-true.png", alt: "is this true?" },
  "red-planet": { kind: "image", src: "/emoji-visual/red-planet.png", alt: "red planet" },
  "tesla-cybertruck": {
    kind: "image",
    src: "/emoji-visual/cybertruck.webp",
    alt: "Tesla Cybertruck",
  },
  ayaya: { kind: "image", src: "/emoji-visual/ayaya.png", alt: "Ayaya" },
  gemma: { kind: "image", src: "/emoji-visual/gemma.png", alt: "Gemma" },

  "command-line": { kind: "component", component: HiMiniCommandLine, alt: "command line" },
  grok: { kind: "component", component: RiGrokAiFill, alt: "grok logo" },
  tesla: { kind: "component", component: SiTesla, alt: "Tesla logo" },
  x: { kind: "component", component: FaSquareXTwitter, alt: "X (prev twitter) logo" },
  doge: { kind: "component", component: SiDogecoin, alt: "Doge logo" },
};

export function EmojiIcon({ icon }: { icon: string }) {
  const definition = EMOJI_ICONS[icon];
  if (!definition) return <span aria-label="unknown emoji icon">?</span>;
  if (definition.kind === "image") return <img alt={definition.alt} src={definition.src} />;
  const Icon = definition.component;
  return (
    <span aria-label={definition.alt} role="img">
      <Icon aria-hidden />
    </span>
  );
}
