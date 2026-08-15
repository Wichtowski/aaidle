import { database } from "../../../db/client";
import { localProgressSchema } from "../../../storage/local-progress-schema";

export async function hasHardcoreAccess(userId: string) {
  const access = await database()
    .prepare("SELECT 1 FROM user_hardcore_access WHERE user_id=?")
    .bind(userId)
    .first();
  if (access) return true;

  const progressRecord = await database()
    .prepare("SELECT progress_json FROM user_progress WHERE user_id=?")
    .bind(userId)
    .first<{ progress_json: string }>();
  if (!progressRecord) return false;

  try {
    const progress = localProgressSchema.safeParse(JSON.parse(progressRecord.progress_json));
    if (!progress.success || !progress.data.preferences.hardcoreUnlocked) return false;
    await grantHardcoreAccess(userId);
    return true;
  } catch {
    return false;
  }
}

export async function isInnerCircleActive(userId: string) {
  const progressRecord = await database()
    .prepare("SELECT progress_json FROM user_progress WHERE user_id=?")
    .bind(userId)
    .first<{ progress_json: string }>();
  if (!progressRecord) return false;

  try {
    const progress = localProgressSchema.safeParse(JSON.parse(progressRecord.progress_json));
    return progress.success && progress.data.preferences.innerCircleActive;
  } catch {
    return false;
  }
}

export async function leaveInnerCircle(userId: string) {
  const DB = database();
  const progressRecord = await DB.prepare("SELECT progress_json FROM user_progress WHERE user_id=?")
    .bind(userId)
    .first<{ progress_json: string }>();
  if (!progressRecord) return;

  try {
    const progress = localProgressSchema.safeParse(JSON.parse(progressRecord.progress_json));
    if (!progress.success || !progress.data.preferences.innerCircleActive) return;
    const nextProgress = {
      ...progress.data,
      preferences: { ...progress.data.preferences, innerCircleActive: false },
    };
    await DB.prepare("UPDATE user_progress SET progress_json=?, updated_at=? WHERE user_id=?")
      .bind(JSON.stringify(nextProgress), Date.now(), userId)
      .run();
  } catch {
    // A malformed progress record must not block recording the solved challenge
  }
}

export async function grantHardcoreAccess(userId: string) {
  await database()
    .prepare("INSERT OR IGNORE INTO user_hardcore_access (user_id, unlocked_at) VALUES (?, ?)")
    .bind(userId, Date.now())
    .run();
}
