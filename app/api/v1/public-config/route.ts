import { database } from "@/lib/db/client";
import { normalizeSoundCloudUrl } from "@/lib/media/soundcloud";

export async function GET() {
  const setting = await database()
    .prepare("SELECT value FROM site_settings WHERE key=?")
    .bind("hardcore_soundcloud_url")
    .first<{ value: string }>();

  return Response.json(
    { hardcoreSoundCloudUrl: normalizeSoundCloudUrl(setting?.value) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
