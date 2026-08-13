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

export async function grantHardcoreAccess(userId: string) {
  await database()
    .prepare(
      "INSERT OR IGNORE INTO user_hardcore_access (user_id, unlocked_at) VALUES (?, ?)",
    )
    .bind(userId, Date.now())
    .run();
}
