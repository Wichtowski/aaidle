import { sessionCookieName } from "@/lib/auth/auth-config";
import { cookieValue } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { userForSession } from "@/lib/auth/auth-service";
import { canManageUsers } from "@/lib/auth/permissions";
import { database } from "@/lib/db/client";

type UserDetailRow = {
  id: string;
  email: string;
  display_name: string | null;
  email_verified_at: number | null;
  created_at: number;
  updated_at: number;
  last_seen_at: number | null;
  progress_json: string | null;
  progress_updated_at: number | null;
  completion_count: number;
};

type CompletionRow = {
  challenge_id: string;
  challenge_date: string;
  mode: string;
  answer_model_name: string;
  completed_at: number;
};

function parseProgress(progressJson: string | null): unknown | null {
  if (!progressJson) return null;
  try {
    return JSON.parse(progressJson);
  } catch {
    return { rawProgress: progressJson, warning: "The stored progress is not valid JSON." };
  }
}

async function adminForRequest(request: Request) {
  const user = await userForSession(cookieValue(request, sessionCookieName));
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!canManageUsers(user.permission)) throw new Error("FORBIDDEN");
}

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await adminForRequest(request);
    const { userId } = await params;
    const DB = database();
    const user = await DB.prepare(
      `SELECT
        u.id,
        u.email,
        u.display_name,
        u.email_verified_at,
        u.created_at,
        u.updated_at,
        (SELECT MAX(s.last_seen_at) FROM user_sessions s WHERE s.user_id=u.id) AS last_seen_at,
        p.progress_json,
        p.updated_at AS progress_updated_at,
        (SELECT COUNT(*) FROM user_challenge_completions c WHERE c.user_id=u.id) AS completion_count
      FROM users u
      LEFT JOIN user_progress p ON p.user_id=u.id
      WHERE u.id=?`,
    )
      .bind(userId)
      .first<UserDetailRow>();
    if (!user) return authError("NOT_FOUND", "User not found.", 404);

    const completions = await DB.prepare(
      `SELECT
        c.challenge_id,
        d.challenge_date,
        d.mode,
        m.name AS answer_model_name,
        c.completed_at
      FROM user_challenge_completions c
      JOIN daily_challenges d ON d.id=c.challenge_id
      JOIN models m ON m.id=d.answer_model_id
      WHERE c.user_id=?
      ORDER BY c.completed_at DESC`,
    )
      .bind(userId)
      .all<CompletionRow>();

    return Response.json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          emailVerifiedAt: user.email_verified_at,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          lastSeenAt: user.last_seen_at,
          progressUpdatedAt: user.progress_updated_at,
          completionCount: user.completion_count,
          progress: parseProgress(user.progress_json),
          completions: completions.results.map((completion) => ({
            challengeId: completion.challenge_id,
            challengeDate: completion.challenge_date,
            mode: completion.mode,
            answerModelName: completion.answer_model_name,
            completedAt: completion.completed_at,
          })),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "UNAUTHENTICATED") return authError(code, "Sign in to access admin tools.", 401);
    if (code === "FORBIDDEN") return authError(code, "You do not have permission to access admin tools.", 403);
    return authError("INVALID_REQUEST", "Could not load user data.", 400);
  }
}
