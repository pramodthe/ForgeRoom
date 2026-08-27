/**
 * RFC 8785-style JSON Canonicalization Scheme (JCS) for descriptor hashing.
 */

function assertNoLoneSurrogates(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError("lone UTF-16 surrogates are not JSON-serializable");
      }
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("lone UTF-16 surrogates are not JSON-serializable");
    }
  }
}

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
    assertNoLoneSurrogates(value);
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
      .map((key) => {
        assertNoLoneSurrogates(key);
        return `${JSON.stringify(key)}:${serializeJsonValue(record[key])}`;
      })
      .join(",")}}`;
  }
  throw new TypeError(`unsupported JSON value type: ${typeof value}`);
}

export function canonicalizeJson(value: unknown): string {
  return serializeJsonValue(value);
}
