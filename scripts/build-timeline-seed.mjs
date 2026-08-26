import { resolve } from "node:path";
import { syncTimelineSeed } from "./timeline-seed-constants.mjs";

const classicPath = resolve(process.argv[2] ?? "data/classic.seed.json");
const timelinePath = resolve(process.argv[3] ?? "data/timeline.seed.json");
const itemCount = syncTimelineSeed({ classicPath, timelinePath });

console.log(`Synchronized ${itemCount} items into ${timelinePath}`);
