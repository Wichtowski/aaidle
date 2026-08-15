import { createHmac, timingSafeEqual } from "node:crypto";
import { requiredAuthSecret } from "../../../auth/auth-config";

type TrajectoryAccessPayload = { challengeId: string; answerModelId: string };

const signatureFor = (payload: string) =>
  createHmac("sha256", requiredAuthSecret()).update(payload).digest("base64url");

export function createTrajectoryAccessToken({
  challengeId,
  answerModelId,
}: TrajectoryAccessPayload) {
  const payload = Buffer.from(JSON.stringify({ challengeId, answerModelId })).toString("base64url");
  return `${payload}.${signatureFor(payload)}`;
}

export function hasTrajectoryAccess(
  token: string | null | undefined,
  expected: TrajectoryAccessPayload,
) {
  const [payload, signature] = token?.split(".") ?? [];
  if (!payload || !signature) return false;

  const expectedSignature = signatureFor(payload);
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return false;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<TrajectoryAccessPayload>;
    return (
      parsed.challengeId === expected.challengeId && parsed.answerModelId === expected.answerModelId
    );
  } catch {
    return false;
  }
}
