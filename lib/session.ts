import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const SESSION_MAX_AGE = 60 * 60 * 24;

export function sessionDeadline() {
  return String(Date.now() + SESSION_MAX_AGE * 1000);
}

export function remainingSessionSeconds(deadline: string | undefined) {
  if (!deadline) return SESSION_MAX_AGE;
  return Math.max(0, Math.floor((Number(deadline) - Date.now()) / 1000));
}

function key() {
  const secret = process.env.SESSION_SECRET || `${process.env.SPOTIFY_CLIENT_SECRET || ""}:${process.env.GOOGLE_CLIENT_SECRET || ""}`;
  if (secret === ":") throw new Error("Add SESSION_SECRET to encrypt provider sessions.");
  return createHash("sha256").update(secret).digest();
}

export function sealToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function unsealToken(value: string) {
  try {
    const payload = Buffer.from(value, "base64url");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}

export function sessionCookie(maxAge = SESSION_MAX_AGE) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: Math.min(maxAge, SESSION_MAX_AGE), path: "/" };
}
