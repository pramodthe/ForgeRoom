import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function randomOpaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}

export function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHmac("sha256", "forgeroom-session-v1").update(secret).digest("base64url");
}

export function secretsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function deriveCsrfToken(sessionSecret: string): string {
  return createHmac("sha256", sessionSecret).update("forgeroom-csrf-v1").digest("base64url");
}

export function parseSessionCookie(
  raw: string | undefined,
): { sessionId: string; secret: string } | null {
  if (!raw) {
    return null;
  }
  const separator = raw.indexOf(".");
  if (separator <= 0 || separator === raw.length - 1) {
    return null;
  }
  return {
    sessionId: raw.slice(0, separator),
    secret: raw.slice(separator + 1),
  };
}

export function formatSessionCookie(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}
