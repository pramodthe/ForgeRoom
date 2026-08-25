import { z } from "zod";

export const opaqueIdSchema = z.string().min(1);
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/i);
export const nonNegativeIntSchema = z.number().int().nonnegative();
export const positiveIntSchema = z.number().int().positive();

export const FORBIDDEN_PAYLOAD_KEYS = [
  "password",
  "password_hash",
  "passwordhash",
  "api_key",
  "apikey",
  "access_token",
  "accesstoken",
  "refresh_token",
  "secret",
  "client_secret",
  "credential",
  "credentials",
  "authorization",
  "auth_header",
  "authheader",
  "reasoning",
  "thinking",
  "signature",
  "raw_tool_body",
  "rawtoolbody",
  "trueforge_api_key",
  "composio_api_key",
  "model_provider_api_key",
] as const;

const forbiddenKeySet = new Set<string>(FORBIDDEN_PAYLOAD_KEYS);

export function normalizePayloadKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function isForbiddenPayloadKey(key: string): boolean {
  const normalized = normalizePayloadKey(key);
  return forbiddenKeySet.has(normalized);
}

export type SafeJsonValue =
  null | boolean | number | string | SafeJsonValue[] | { [key: string]: SafeJsonValue };

export const safeJsonValueSchema: z.ZodType<SafeJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(safeJsonValueSchema),
    z.record(z.string(), safeJsonValueSchema).superRefine((value, ctx) => {
      for (const key of Object.keys(value)) {
        if (isForbiddenPayloadKey(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `forbidden payload field: ${key}`,
            path: [key],
          });
        }
      }
    }),
  ]),
);

export const schemaVersion1 = z.literal(1);
