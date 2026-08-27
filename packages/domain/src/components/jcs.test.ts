import { describe, expect, it } from "vitest";
import { canonicalizeJson } from "./jcs";

describe("canonicalizeJson", () => {
  it("sorts object keys stably", () => {
    expect(canonicalizeJson({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it("rejects lone UTF-16 surrogates", () => {
    expect(() => canonicalizeJson(`bad${String.fromCharCode(0xd800)}`)).toThrow(
      /lone UTF-16 surrogates/,
    );
    expect(() => canonicalizeJson({ [String.fromCharCode(0xdc00)]: 1 })).toThrow(
      /lone UTF-16 surrogates/,
    );
  });
});
