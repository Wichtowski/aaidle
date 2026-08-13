import { z } from "zod";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { cookieValue, assertSameOrigin } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { isAccountDisabled, userForSession } from "@/lib/auth/auth-service";
import { canManageAdministrators } from "@/lib/auth/permissions";
import { database } from "@/lib/db/client";
import { normalizeSoundCloudUrl } from "@/lib/media/soundcloud";
import { readRequestText } from "@/lib/validation/request-body";

const settingKey = "hardcore_soundcloud_url";
const updateSchema = z.object({ url: z.string().trim().max(2_048) });

async function superadminForRequest(request: Request) {
  const user = await userForSession(cookieValue(request, sessionCookieName));
  if (!user || isAccountDisabled(user) || !canManageAdministrators(user.permission)) {
    throw new Error("FORBIDDEN");
  }
}

export async function GET(request: Request) {
  try {
    await superadminForRequest(request);
    const setting = await database()
      .prepare("SELECT value FROM site_settings WHERE key=?")
      .bind(settingKey)
      .first<{ value: string }>();
    return Response.json(
      { url: setting?.value ?? "" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "FORBIDDEN") {
      return authError(code, "Only a super administrator can change the soundtrack.", 403);
    }
    return authError("INVALID_REQUEST", "Could not load the soundtrack setting.", 400);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await superadminForRequest(request);
    const { url: input } = updateSchema.parse(JSON.parse(await readRequestText(request, 4_096)));
    const url = normalizeSoundCloudUrl(input);
    if (input && !url) throw new Error("INVALID_URL");

    const DB = database();
    if (!url) {
      await DB.prepare("DELETE FROM site_settings WHERE key=?").bind(settingKey).run();
    } else {
      await DB.prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      )
        .bind(settingKey, url, Date.now())
        .run();
    }

    return Response.json({ url: url ?? "" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "FORBIDDEN") {
      return authError(code, "Only a super administrator can change the soundtrack.", 403);
    }
    if (code === "INVALID_ORIGIN") {
      return authError(code, "This request must come from the application.", 403);
    }
    if (code === "INVALID_URL") {
      return authError(code, "Enter a public HTTPS SoundCloud track or playlist URL.", 400);
    }
    return authError("INVALID_REQUEST", "Could not update the soundtrack setting.", 400);
  }
}
