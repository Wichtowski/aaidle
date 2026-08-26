export type TimelineSeedPaths = {
  classicPath?: string;
  timelinePath?: string;
  eventsPath?: string;
};

export function syncTimelineSeed(paths?: TimelineSeedPaths): number;
