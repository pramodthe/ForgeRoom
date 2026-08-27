/**
 * RFC 8785-style JSON Canonicalization Scheme (JCS) for descriptor hashing.
 */

function serializeJsonValue(value: unknown): string {
  if (value === undefined) {
    throw new TypeError("undefined is not JSON-serializable");
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("non-finite numbers are not JSON-serializable");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeJsonValue(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("non-plain objects are not JSON-serializable");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${serializeJsonValue(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(`unsupported JSON value type: ${typeof value}`);
}

export function canonicalizeJson(value: unknown): string {
  return serializeJsonValue(value);
}
