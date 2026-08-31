import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function publishBackstopReport(sourceDirectory, destinationDirectory) {
  const source = resolve(sourceDirectory);
  const destination = resolve(destinationDirectory);
  await mkdir(destination, { recursive: true });
  await cp(resolve(source, "html_report"), destination, { recursive: true });
  await cp(resolve(source, "bitmaps_reference"), resolve(destination, "bitmaps_reference"), {
    recursive: true,
  });
  await cp(resolve(source, "bitmaps_test"), resolve(destination, "bitmaps_test"), {
    recursive: true,
  });

  const configPath = resolve(destination, "config.js");
  const config = await readFile(configPath, "utf8");
  const publishedConfig = config
    .replaceAll('"../bitmaps_reference/', '"./bitmaps_reference/')
    .replaceAll('"../bitmaps_test/', '"./bitmaps_test/');
  if (
    !config.includes('"../bitmaps_reference/') ||
    !config.includes('"../bitmaps_test/') ||
    publishedConfig.includes('"../bitmaps_')
  ) {
    throw new Error("Backstop report config did not contain bitmap paths to publish.");
  }
  await writeFile(configPath, publishedConfig);

  const bitmapPaths = [...publishedConfig.matchAll(/"(\.\/bitmaps_[^"?]+\.png)"/g)].map(
    ([, path]) => path,
  );
  if (bitmapPaths.length === 0) throw new Error("Backstop report did not reference any bitmaps.");

  const testBitmapPaths = bitmapPaths.filter((path) => path.startsWith("./bitmaps_test/"));
  if (testBitmapPaths.length === 0) {
    throw new Error("Backstop report did not reference any test bitmaps.");
  }
  await Promise.all(testBitmapPaths.map((path) => access(resolve(destination, path))));
}
