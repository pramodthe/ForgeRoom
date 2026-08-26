import { z } from "zod";

export const PROTOTYPE_POLLUTION_KEYS = ["__proto__", "prototype", "constructor"] as const;

const prototypePollutionKeySet = new Set<string>(PROTOTYPE_POLLUTION_KEYS);

export function isUnsafeObjectKey(key: string): boolean {
  return prototypePollutionKeySet.has(key.toLowerCase());
}

export const safeRecordKeySchema = z
  .string()
  .min(1)
  .refine((key) => !isUnsafeObjectKey(key), "prototype-mutating object keys are forbidden");

export const opaqueIdSchema = safeRecordKeySchema;
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
  "model_reasoning",
  "reasoning_content",
  "thinking",
  "provider_thinking",
  "signature",
  "request_signature",
  "raw_tool_body",
  "raw_tool_body_fragment",
  "rawtoolbody",
  "database_password",
  "github_secret",
  "trueforge_api_key",
  "composio_api_key",
  "provider_api_key",
  "model_provider_api_key",
  "__proto__",
  "prototype",
  "constructor",
] as const;

export function normalizePayloadKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

const forbiddenKeySet = new Set<string>(FORBIDDEN_PAYLOAD_KEYS.map(normalizePayloadKey));

const forbiddenSensitiveSuffixes = [
  "apikey",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "authheader",
  "authorization",
  "credential",
  "credentials",
  "password",
  "passwordhash",
  "secret",
  "reasoning",
  "thinking",
  "requestsignature",
  "rawtoolbody",
  "rawtoolbodyfragment",
] as const;

export function isForbiddenPayloadKey(key: string): boolean {
  const normalized = normalizePayloadKey(key);
  return (
    forbiddenKeySet.has(normalized) ||
    forbiddenSensitiveSuffixes.some((suffix) => normalized.endsWith(suffix))
  );
}

export type SafeJsonValue =
  null | boolean | number | string | SafeJsonValue[] | { [key: string]: SafeJsonValue };
export type SafeJsonObject = { [key: string]: SafeJsonValue };

export const safeJsonValueSchema: z.ZodType<SafeJsonValue, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(safeJsonValueSchema),
    z.preprocess(
      (input, ctx) => {
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
          return input;
        }

        const prototype = Object.getPrototypeOf(input);
        if (prototype !== Object.prototype && prototype !== null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "safe JSON objects must have a plain or null prototype",
          });
          return z.NEVER;
        }

        // Check the input before Zod clones it. In particular, an own `__proto__`
        // property can otherwise disappear during object reconstruction.
        for (const key of Object.keys(input)) {
          if (isForbiddenPayloadKey(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `forbidden payload field: ${key}`,
              path: [key],
            });
          }
        }
        return input;
      },
      z.record(z.string(), safeJsonValueSchema),
    ),
  ]),
);

export const safeJsonObjectSchema = safeJsonValueSchema.refine(
  (value): value is SafeJsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value),
  "must be a safe JSON object",
);

/** Reject dangerous own keys before Zod reconstructs a record and can silently drop them. */
export function safeRecordSchema<ValueSchema extends z.ZodTypeAny>(valueSchema: ValueSchema) {
  return z.preprocess(
    (input, ctx) => {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return input;
      }
      for (const key of Object.keys(input)) {
        if (isUnsafeObjectKey(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `prototype-mutating record key is forbidden: ${key}`,
            path: [key],
          });
        }
      }
      return input;
    },
    z.record(safeRecordKeySchema, valueSchema),
  );
}

export const schemaVersion1 = z.literal(1);
