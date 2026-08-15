import { sessionCookieName } from "@/lib/auth/auth-config";
import { assertSameOrigin, cookieValue } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { isAccountDisabled, userForSession } from "@/lib/auth/auth-service";
import { database } from "@/lib/db/client";
import { mergeCloudProgress, parseCloudProgress } from "@/lib/domain/players/cloud-progress";
import { grantHardcoreAccess } from "@/lib/domain/games/classic/hardcore-access";
import { readRequestText } from "@/lib/validation/request-body";

const maxProgressBytes = 1_000_000;

async function authenticatedUser(request: Request) {
  const user = await userForSession(cookieValue(request, sessionCookieName));
  if (!user) throw new Error("UNAUTHENTICATED");
  if (isAccountDisabled(user)) throw new Error("ACCOUNT_DISABLED");
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const record = await database()
      .prepare("SELECT progress_json FROM user_progress WHERE user_id=?")
      .bind(user.id)
      .first<{ progress_json: string }>();
    const progress = record ? parseCloudProgress(JSON.parse(record.progress_json)) : null;
    if (progress?.preferences.hardcoreUnlocked) {
      await grantHardcoreAccess(user.id);
    }
    return Response.json({ progress }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "UNAUTHENTICATED") return authError(code, "Sign in to sync your progress.", 401);
    if (code === "ACCOUNT_DISABLED") return authError(code, "This account has been disabled.", 403);
    return authError("INVALID_REQUEST", "Could not load account progress.", 400);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await authenticatedUser(request);
    const body = await readRequestText(request, maxProgressBytes);
    const incoming = parseCloudProgress(JSON.parse(body));
    const DB = database();
    const record = await DB.prepare("SELECT progress_json FROM user_progress WHERE user_id=?")
      .bind(user.id)
      .first<{ progress_json: string }>();
    const progress = mergeCloudProgress(
      record ? parseCloudProgress(JSON.parse(record.progress_json)) : null,
      incoming,
    );
    if (progress.preferences.hardcoreUnlocked) {
      await grantHardcoreAccess(user.id);
    }
    await DB.prepare(
      "INSERT INTO user_progress (user_id, progress_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET progress_json=excluded.progress_json, updated_at=excluded.updated_at",
    )
      .bind(user.id, JSON.stringify(progress), Date.now())
      .run();
    return Response.json({ progress }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "UNAUTHENTICATED") return authError(code, "Sign in to sync your progress.", 401);
    if (code === "ACCOUNT_DISABLED") return authError(code, "This account has been disabled.", 403);
    if (code === "BODY_TOO_LARGE") {
      return authError(code, "Progress data is too large to sync.", 413);
    }
    return authError("INVALID_REQUEST", "Could not save account progress.", 400);
  }
}
