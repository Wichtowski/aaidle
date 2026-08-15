import { sessionCookieName } from "@/lib/auth/auth-config";
import { cookieValue } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { isAccountDisabled, userForSession } from "@/lib/auth/auth-service";
import { canManageUsers } from "@/lib/auth/permissions";
import { database } from "@/lib/db/client";

const pageSize = 50;

type UserSummaryRow = {
  id: string;
  email: string;
  display_name: string | null;
  email_verified_at: number | null;
  created_at: number;
  updated_at: number;
  permission: "user" | "developer" | "superadmin";
  disabled_at: number | null;
  disabled_reason: string | null;
  identity_providers: string | null;
  last_seen_at: number | null;
  progress_updated_at: number | null;
  completion_count: number;
};

function signInProviders(
  user: Pick<UserSummaryRow, "identity_providers"> & { password_hash?: string | null },
) {
  return [
    ...(user.password_hash ? ["password"] : []),
    ...(user.identity_providers?.split(",").filter(Boolean) ?? []),
  ];
}

function escapeLikeQuery(query: string) {
  return query.replace(/[\\%_]/g, "\\$&");
}

async function adminForRequest(request: Request) {
  const user = await userForSession(cookieValue(request, sessionCookieName));
  if (!user) throw new Error("UNAUTHENTICATED");
  if (isAccountDisabled(user)) throw new Error("FORBIDDEN");
  if (!canManageUsers(user.permission)) throw new Error("FORBIDDEN");
  return user;
}

export async function GET(request: Request) {
  try {
    await adminForRequest(request);
    const url = new URL(request.url);
    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const query = url.searchParams.get("query")?.trim().slice(0, 100) ?? "";
    const pattern = `%${escapeLikeQuery(query.toLocaleLowerCase("en-US"))}%`;
    const DB = database();
    const totalRow = await DB.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE email_normalized LIKE ? ESCAPE '\\' OR LOWER(COALESCE(display_name, '')) LIKE ? ESCAPE '\\'",
    )
      .bind(pattern, pattern)
      .first<{ count: number }>();
    const users = await DB.prepare(
      `SELECT
        u.id,
        u.email,
        u.display_name,
        u.email_verified_at,
        u.created_at,
        u.updated_at,
        u.permission,
        u.disabled_at,
        u.disabled_reason,
        u.password_hash,
        (SELECT GROUP_CONCAT(i.provider, ',') FROM user_identities i WHERE i.user_id=u.id) AS identity_providers,
        (SELECT MAX(s.last_seen_at) FROM user_sessions s WHERE s.user_id=u.id) AS last_seen_at,
        p.updated_at AS progress_updated_at,
        (SELECT COUNT(*) FROM user_challenge_completions c WHERE c.user_id=u.id) AS completion_count
      FROM users u
      LEFT JOIN user_progress p ON p.user_id=u.id
      WHERE u.email_normalized LIKE ? ESCAPE '\\' OR LOWER(COALESCE(u.display_name, '')) LIKE ? ESCAPE '\\'
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
    )
      .bind(pattern, pattern, pageSize, (page - 1) * pageSize)
      .all<UserSummaryRow>();

    return Response.json(
      {
        users: users.results.map((user) => ({
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          emailVerifiedAt: user.email_verified_at,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          permission: user.permission,
          disabledAt: user.disabled_at,
          disabledReason: user.disabled_reason,
          signInProviders: signInProviders(user),
          lastSeenAt: user.last_seen_at,
          progressUpdatedAt: user.progress_updated_at,
          completionCount: user.completion_count,
        })),
        total: totalRow?.count ?? 0,
        page,
        pageSize,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "UNAUTHENTICATED") return authError(code, "Sign in to access admin tools.", 401);
    if (code === "FORBIDDEN")
      return authError(code, "You do not have permission to access admin tools.", 403);
    return authError("INVALID_REQUEST", "Could not load users.", 400);
  }
}
