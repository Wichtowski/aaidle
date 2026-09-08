import soundtrackFiles from "virtual:hardcore-soundtracks";
import { utcDate } from "@lib/utils/dates";

export type HardcoreSoundtrack = {
  artist: string;
  audioSources: Array<{
    fileName: string;
    mimeType: "audio/mpeg" | "audio/ogg";
    url: string;
  }>;
  coverUrl: string;
  title: string;
};

function displayName(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function buildHardcoreSoundtrackCatalog(
  files: Array<{
    audioFileNames: string[];
    baseName: string;
    coverFileName: string;
  }> = soundtrackFiles,
): HardcoreSoundtrack[] {
  return files.map(({ audioFileNames, baseName, coverFileName }) => {
    const [title, artist] = baseName.split("--");
    return {
      artist: displayName(artist),
      audioSources: audioFileNames.map((fileName) => ({
        fileName,
        mimeType: fileName.toLowerCase().endsWith(".ogg") ? "audio/ogg" : "audio/mpeg",
        url: `/hardcore/audio/${encodeURIComponent(fileName)}`,
      })),
      coverUrl: `/hardcore/cover/${encodeURIComponent(coverFileName)}`,
      title: displayName(title),
    };
  });
}

function hashDate(date: string) {
  let hash = 2_166_136_261;
  for (const character of date) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function dailyHardcoreSoundtrack(
  date = utcDate(),
  catalog = buildHardcoreSoundtrackCatalog(),
) {
  return catalog.length > 0 ? catalog[hashDate(date) % catalog.length] : null;
}
