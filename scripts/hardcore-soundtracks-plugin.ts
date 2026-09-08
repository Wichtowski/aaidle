import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const virtualModuleId = "virtual:hardcore-soundtracks";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const audioDirectory = fileURLToPath(new URL("../public/hardcore/audio/", import.meta.url));
const coverDirectory = fileURLToPath(new URL("../public/hardcore/cover/", import.meta.url));
const audioExtensions = new Set(["mp3", "ogg"]);
const coverExtensions = new Set(["avif", "jpeg", "jpg", "png", "webp"]);

function filesIn(directory: string) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function soundtrackCatalog() {
  const audioFilesByBaseName = new Map<string, string[]>();
  const coversByBaseName = new Map<string, string>();

  for (const fileName of filesIn(audioDirectory)) {
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (!extension || !audioExtensions.has(extension)) continue;
    const baseName = fileName.slice(0, -(extension.length + 1));
    const audioFiles = audioFilesByBaseName.get(baseName) ?? [];
    if (audioFiles.some((audioFile) => audioFile.toLowerCase().endsWith(`.${extension}`))) {
      throw new Error(
        `Hardcore soundtrack "${baseName}" has more than one .${extension} audio file.`,
      );
    }
    audioFiles.push(fileName);
    audioFilesByBaseName.set(baseName, audioFiles);
  }

  for (const fileName of filesIn(coverDirectory)) {
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (!extension || !coverExtensions.has(extension)) continue;
    const baseName = fileName.slice(0, -(extension.length + 1));
    if (coversByBaseName.has(baseName)) {
      throw new Error(`Hardcore soundtrack "${baseName}" has more than one cover image.`);
    }
    coversByBaseName.set(baseName, fileName);
  }

  const tracks = [...audioFilesByBaseName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([baseName, audioFileNames]) => {
      const separator = baseName.indexOf("--");
      if (
        separator <= 0 ||
        separator !== baseName.lastIndexOf("--") ||
        separator >= baseName.length - 2
      ) {
        throw new Error(
          `Hardcore soundtrack "${baseName}" must use the name "song--artist.ogg" or "song--artist.mp3".`,
        );
      }
      const coverFileName = coversByBaseName.get(baseName);
      if (!coverFileName) {
        throw new Error(`Hardcore soundtrack "${baseName}" is missing a matching cover image.`);
      }
      audioFileNames.sort((left, right) => {
        const leftRank = left.toLowerCase().endsWith(".ogg") ? 0 : 1;
        const rightRank = right.toLowerCase().endsWith(".ogg") ? 0 : 1;
        return leftRank - rightRank || left.localeCompare(right);
      });
      return { audioFileNames, baseName, coverFileName };
    });

  for (const baseName of coversByBaseName.keys()) {
    if (!audioFilesByBaseName.has(baseName)) {
      throw new Error(`Hardcore cover "${baseName}" is missing a matching audio file.`);
    }
  }

  return tracks;
}

export function hardcoreSoundtracksPlugin(): Plugin {
  return {
    name: "aaidle-hardcore-soundtracks",
    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : undefined;
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return undefined;
      return `export default ${JSON.stringify(soundtrackCatalog())};`;
    },
    configureServer(server) {
      server.watcher.add([audioDirectory, coverDirectory]);
      server.watcher.on("all", (_event, path) => {
        if (
          !path.startsWith(projectRoot) ||
          (!path.startsWith(audioDirectory) && !path.startsWith(coverDirectory))
        ) {
          return;
        }
        const module = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}
