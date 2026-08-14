import { z } from "zod";
import { sessionCookieName } from "@/lib/auth/auth-config";
import { assertSameOrigin, cookieValue } from "@/lib/auth/auth-http";
import { authError } from "@/lib/auth/auth-response";
import { isAccountDisabled, userForSession } from "@/lib/auth/auth-service";
import { canManageAdministrators, canManageUsers } from "@/lib/auth/permissions";
import { database } from "@/lib/db/client";
import { catalogModel, catalogModelsForClassic } from "@/lib/server/model-catalog";
import {
  classicCategoryFromRouteSegment,
  isClassicDifficulty,
} from "@/lib/domain/models/model-types";
import { localProgressSchema } from "@/lib/storage/local-progress-schema";
import { parseCloudProgress } from "@/lib/domain/players/cloud-progress";
import { readRequestText } from "@/lib/validation/request-body";

type UserDetailRow = {
  id: string;
  email: string;
  display_name: string | null;
  email_verified_at: number | null;
  created_at: number;
  updated_at: number;
  permission: "user" | "developer" | "superadmin";
  disabled_at: number | null;
  disabled_reason: string | null;
  disabled_by_email: string | null;
  password_hash: string | null;
  identity_providers: string | null;
  last_seen_at: number | null;
  progress_json: string | null;
  progress_updated_at: number | null;
  completion_count: number;
};

type CompletionRow = {
  challenge_id: string;
  challenge_date: string;
  mode: string;
  answer_model_id: string;
  answer_model_name: string;
  completed_at: number;
};

const updateUserSchema = z
  .object({
    permission: z.enum(["user", "developer"]).optional(),
    disabled: z.boolean().optional(),
    disabledReason: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.permission === undefined && value.disabled === undefined) {
      context.addIssue({ code: "custom", message: "Choose an account update." });
    }
    if (value.disabled && !value.disabledReason) {
      context.addIssue({
        code: "custom",
        path: ["disabledReason"],
        message: "Enter a reason for disabling this account.",
      });
    }
  });

const removeGuessSchema = z
  .object({ gameKey: z.string().min(1).max(300), requestId: z.string().uuid() })
  .strict();

function parseProgress(progressJson: string | null): unknown | null {
  if (!progressJson) return null;
  try {
    return JSON.parse(progressJson);
  } catch {
    return { rawProgress: progressJson, warning: "The stored progress is not valid JSON." };
  }
}

function signInProviders(user: Pick<UserDetailRow, "password_hash" | "identity_providers">) {
  return [
    ...(user.password_hash ? ["password"] : []),
    ...(user.identity_providers?.split(",").filter(Boolean) ?? []),
  ];
}

function trajectoryReferenceModels(progress: unknown, targetChallengeIds: Set<string>) {
  const parsedProgress = localProgressSchema.safeParse(progress);
  if (!parsedProgress.success) return [];

  const latestSolvedGame = Object.values(parsedProgress.data.games)
    .filter((game) => game.status === "solved" && targetChallengeIds.has(game.challengeId))
    .sort(
      (left, right) =>
        right.challengeDate.localeCompare(left.challengeDate) ||
        right.startedAt.localeCompare(left.startedAt),
    )[0];
  if (!latestSolvedGame) return [];

  const [, categorySegment, difficulty] = latestSolvedGame.mode.split(":");
  const category = classicCategoryFromRouteSegment(categorySegment);
  if (!category || !isClassicDifficulty(difficulty)) return [];

  return catalogModelsForClassic(category, difficulty);
}

async function adminForRequest(request: Request) {
  const user = await userForSession(cookieValue(request, sessionCookieName));
  if (!user) throw new Error("UNAUTHENTICATED");
  if (isAccountDisabled(user)) throw new Error("FORBIDDEN");
  if (!canManageUsers(user.permission)) throw new Error("FORBIDDEN");
  return user;
}

async function userDetail(userId: string) {
  const DB = database();
  const user = await DB.prepare(
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
      disabled_by.email AS disabled_by_email,
      u.password_hash,
      (SELECT GROUP_CONCAT(i.provider, ',') FROM user_identities i WHERE i.user_id=u.id) AS identity_providers,
      (SELECT MAX(s.last_seen_at) FROM user_sessions s WHERE s.user_id=u.id) AS last_seen_at,
      p.progress_json,
      p.updated_at AS progress_updated_at,
      (SELECT COUNT(*) FROM user_challenge_completions c WHERE c.user_id=u.id) AS completion_count
    FROM users u
    LEFT JOIN user_progress p ON p.user_id=u.id
    LEFT JOIN users disabled_by ON disabled_by.id=u.disabled_by_user_id
    WHERE u.id=?`,
  )
    .bind(userId)
    .first<UserDetailRow>();
  if (!user) return null;

  const completions = await DB.prepare(
    `SELECT
      c.challenge_id,
        d.challenge_date,
        d.mode,
        d.answer_model_id,
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

  const trajectoryTargets: Record<string, NonNullable<ReturnType<typeof catalogModel>>> = {};
  for (const completion of completions.results) {
    const target = catalogModel(completion.answer_model_id);
    if (target) trajectoryTargets[completion.challenge_id] = target;
  }

  const progress = parseProgress(user.progress_json);

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    emailVerifiedAt: user.email_verified_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    permission: user.permission,
    disabledAt: user.disabled_at,
    disabledReason: user.disabled_reason,
    disabledByEmail: user.disabled_by_email,
    signInProviders: signInProviders(user),
    lastSeenAt: user.last_seen_at,
    progressUpdatedAt: user.progress_updated_at,
    completionCount: user.completion_count,
    progress,
    trajectoryTargets,
    trajectoryReferenceModels: trajectoryReferenceModels(
      progress,
      new Set(Object.keys(trajectoryTargets)),
    ),
    completions: completions.results.map((completion) => ({
      challengeId: completion.challenge_id,
      challengeDate: completion.challenge_date,
      mode: completion.mode,
      answerModelName: completion.answer_model_name,
      completedAt: completion.completed_at,
    })),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await adminForRequest(request);
    const { userId } = await params;
    const user = await userDetail(userId);
    if (!user) return authError("NOT_FOUND", "User not found.", 404);
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "UNAUTHENTICATED") return authError(code, "Sign in to access admin tools.", 401);
    if (code === "FORBIDDEN") {
      return authError(code, "You do not have permission to access admin tools.", 403);
    }
    return authError("INVALID_REQUEST", "Could not load user data.", 400);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await adminForRequest(request);
    if (!canManageAdministrators(admin.permission)) throw new Error("FORBIDDEN");
    const { userId } = await params;
    if (userId === admin.id) throw new Error("SELF_UPDATE");
    const update = updateUserSchema.parse(JSON.parse(await readRequestText(request, 4_096)));
    const target = await database()
      .prepare("SELECT id, permission FROM users WHERE id=?")
      .bind(userId)
      .first<{ id: string; permission: "user" | "developer" | "superadmin" }>();
    if (!target) return authError("NOT_FOUND", "User not found.", 404);
    if (target.permission === "superadmin") throw new Error("SUPERADMIN_PROTECTED");

    const now = Date.now();
    const DB = database();
    if (update.permission !== undefined) {
      await DB.prepare("UPDATE users SET permission=?, updated_at=? WHERE id=?")
        .bind(update.permission, now, userId)
        .run();
    }
    if (update.disabled !== undefined) {
      if (update.disabled) {
        await DB.prepare(
          "UPDATE users SET disabled_at=?, disabled_reason=?, disabled_by_user_id=?, updated_at=? WHERE id=?",
        )
          .bind(now, update.disabledReason, admin.id, now, userId)
          .run();
      } else {
        await DB.prepare(
          "UPDATE users SET disabled_at=NULL, disabled_reason=NULL, disabled_by_user_id=NULL, updated_at=? WHERE id=?",
        )
          .bind(now, userId)
          .run();
      }
    }
    const user = await userDetail(userId);
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "UNAUTHENTICATED") return authError(code, "Sign in to access admin tools.", 401);
    if (code === "FORBIDDEN") {
      return authError(code, "Only a super administrator can change account access.", 403);
    }
    if (code === "SELF_UPDATE") {
      return authError(code, "You cannot change your own administrator access.", 400);
    }
    if (code === "SUPERADMIN_PROTECTED") {
      return authError(code, "Super administrator accounts cannot be changed here.", 403);
    }
    if (code === "INVALID_ORIGIN") {
      return authError(code, "This request must come from the application.", 403);
    }
    return authError("INVALID_REQUEST", "Could not update this account.", 400);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await adminForRequest(request);
    if (!canManageAdministrators(admin.permission)) throw new Error("FORBIDDEN");
    const { userId } = await params;
    if (userId === admin.id) throw new Error("SELF_UPDATE");
    const { gameKey, requestId } = removeGuessSchema.parse(JSON.parse(await readRequestText(request, 4_096)));
    const DB = database();
    const record = await DB.prepare("SELECT progress_json FROM user_progress WHERE user_id=?")
      .bind(userId)
      .first<{ progress_json: string }>();
    if (!record) throw new Error("PROGRESS_NOT_FOUND");
    const progress = localProgressSchema.parse(JSON.parse(record.progress_json));
    const game = progress.games[gameKey];
    if (!game) throw new Error("GAME_NOT_FOUND");
    const guesses = game.guesses.filter((guess) => guess.requestId !== requestId);
    if (guesses.length === game.guesses.length) throw new Error("GUESS_NOT_FOUND");
    const solved = guesses.some((guess) => guess.isCorrect);
    const nextProgress = parseCloudProgress({
      ...progress,
      games: {
        ...progress.games,
        [gameKey]: { ...game, guesses, status: solved ? "solved" : "in-progress", completedAt: solved ? game.completedAt : null },
      },
    });
    await DB.prepare("UPDATE user_progress SET progress_json=?, updated_at=? WHERE user_id=?")
      .bind(JSON.stringify(nextProgress), Date.now(), userId)
      .run();
    if (!solved) {
      await DB.prepare("DELETE FROM user_challenge_completions WHERE user_id=? AND challenge_id=?")
        .bind(userId, game.challengeId)
        .run();
    }
    const user = await userDetail(userId);
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "UNAUTHENTICATED") return authError(code, "Sign in to access admin tools.", 401);
    if (code === "FORBIDDEN") return authError(code, "Only a super administrator can remove saved guesses.", 403);
    if (code === "SELF_UPDATE") return authError(code, "You cannot remove guesses from your own account.", 400);
    if (code === "PROGRESS_NOT_FOUND" || code === "GAME_NOT_FOUND" || code === "GUESS_NOT_FOUND") {
      return authError(code, "The saved guess was not found.", 404);
    }
    if (code === "INVALID_ORIGIN") return authError(code, "This request must come from the application.", 403);
    return authError("INVALID_REQUEST", "Could not remove the saved guess.", 400);
  }
}
