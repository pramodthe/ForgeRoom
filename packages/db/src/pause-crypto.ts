import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENC_PREFIX = "enc:v1:";

/** Derive a 32-byte key from an opaque secret string. */
export function derivePausePayloadKey(secret: string): Buffer {
  return createHash("sha256").update(`forgeroom-pause-payload-v1:${secret}`).digest();
}

/** Seal a JSON-serializable pause response for RequiredAction ciphertext storage. */
export function sealPauseResponsePayload(
  payload: unknown,
  key: Buffer,
): { ciphertext: string; payloadHash: string } {
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const payloadHash = `sha256:${createHash("sha256").update(plaintext).digest("hex")}`;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = `${ENC_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
  return { ciphertext, payloadHash };
}

/** Open a sealed pause response (worker/resume path). */
export function openPauseResponsePayload(ciphertext: string, key: Buffer): unknown {
  if (!ciphertext.startsWith(ENC_PREFIX)) {
    throw new Error("unsupported pause response ciphertext version");
  }
  const body = ciphertext.slice(ENC_PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("malformed pause response ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as unknown;
}
