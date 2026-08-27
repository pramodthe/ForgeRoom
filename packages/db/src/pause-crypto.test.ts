import { describe, expect, it } from "vitest";
import {
  derivePausePayloadKey,
  openPauseResponsePayload,
  sealPauseResponsePayload,
} from "./pause-crypto";

describe("pause response crypto", () => {
  it("round-trips sealed payloads", () => {
    const key = derivePausePayloadKey("test-secret");
    const sealed = sealPauseResponsePayload({ decision: "deny", reason: "no" }, key);
    expect(sealed.ciphertext.startsWith("enc:v1:")).toBe(true);
    expect(sealed.payloadHash.startsWith("sha256:")).toBe(true);
    expect(openPauseResponsePayload(sealed.ciphertext, key)).toEqual({
      decision: "deny",
      reason: "no",
    });
  });
});
