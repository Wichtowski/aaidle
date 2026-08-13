import { sessionCookieName } from "@/lib/auth/auth-config";
import { assertSameOrigin, cookieValue } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { userForSession } from "@/lib/auth/auth-service";
import { database } from "@/lib/db/client";
import { mergeCloudProgress, parseCloudProgress } from "@/lib/domain/players/cloud-progress";

const maxProgressBytes = 1_000_000;

async function verifiedUser(request: Request) {
  const user = await userForSession(cookieValue(request, sessionCookieName));
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!user.email_verified_at) throw new Error("EMAIL_UNVERIFIED");
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await verifiedUser(request);
    const record = await database()
      .prepare("SELECT progress_json FROM user_progress WHERE user_id=?")
      .bind(user.id)
      .first<{ progress_json: string }>();
    return Response.json(
      { progress: record ? parseCloudProgress(JSON.parse(record.progress_json)) : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "UNAUTHENTICATED") return authError(code, "Sign in to sync your progress.", 401);
    if (code === "EMAIL_UNVERIFIED") return authError(code, "Activate your account to sync progress.", 403);
    return authError("INVALID_REQUEST", "Could not load account progress.", 400);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await verifiedUser(request);
    const body = await request.text();
    if (body.length > maxProgressBytes) throw new Error("BODY_TOO_LARGE");
    const incoming = parseCloudProgress(JSON.parse(body));
    const DB = database();
    const record = await DB.prepare("SELECT progress_json FROM user_progress WHERE user_id=?")
      .bind(user.id)
      .first<{ progress_json: string }>();
    const progress = mergeCloudProgress(
      record ? parseCloudProgress(JSON.parse(record.progress_json)) : null,
      incoming,
    );
    await DB.prepare(
      "INSERT INTO user_progress (user_id, progress_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET progress_json=excluded.progress_json, updated_at=excluded.updated_at",
    )
      .bind(user.id, JSON.stringify(progress), Date.now())
      .run();
    return Response.json({ progress }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "UNAUTHENTICATED") return authError(code, "Sign in to sync your progress.", 401);
    if (code === "EMAIL_UNVERIFIED") return authError(code, "Activate your account to sync progress.", 403);
    if (code === "BODY_TOO_LARGE") return authError(code, "Progress data is too large to sync.", 413);
    return authError("INVALID_REQUEST", "Could not save account progress.", 400);
  }
}
