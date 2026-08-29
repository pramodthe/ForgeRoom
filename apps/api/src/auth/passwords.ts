import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const SALT_LENGTH = 16;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

function isCanonicalBase64Url(value: string, expectedLength: number): boolean {
  if (!BASE64URL_PATTERN.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === expectedLength && decoded.toString("base64url") === value;
}

/** Validate only the encoded hash structure and fixed cost parameters. */
export function isSupportedScryptPasswordHash(encoded: string): boolean {
  const parts = encoded.split("$");
  return (
    parts.length === 6 &&
    parts[0] === "scrypt" &&
    parts[1] === String(SCRYPT_N) &&
    parts[2] === String(SCRYPT_R) &&
    parts[3] === String(SCRYPT_P) &&
    isCanonicalBase64Url(parts[4] ?? "", SALT_LENGTH) &&
    isCanonicalBase64Url(parts[5] ?? "", KEYLEN)
  );
}

function scryptHash(
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derived);
    });
  });
}

/** Valid-format hash used only for constant-time login padding (never a real password). */
export const DUMMY_PASSWORD_HASH = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${Buffer.alloc(SALT_LENGTH).toString("base64url")}$${Buffer.alloc(KEYLEN).toString("base64url")}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scryptHash(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!isSupportedScryptPasswordHash(encoded)) {
    return false;
  }
  const parts = encoded.split("$");
  const n = Number.parseInt(parts[1]!, 10);
  const r = Number.parseInt(parts[2]!, 10);
  const p = Number.parseInt(parts[3]!, 10);
  const salt = parts[4]!;
  const expected = Buffer.from(parts[5]!, "base64url");
  const actual = await scryptHash(password, salt, KEYLEN, { N: n, r, p });
  return timingSafeEqual(actual, expected);
}
