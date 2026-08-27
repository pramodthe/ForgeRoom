import { describe, expect, it, vi } from "vitest";
import { TrueForgeClient } from "./client";

describe("TrueForgeClient turns", () => {
  it("creates a non-streaming turn with explicit predecessor", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: {
            id: "tf_turn_1",
            session_id: "sess_1",
            previous_turn_id: null,
            input: [{ type: "user.message", content: "hi" }],
            state: { status: "running" },
            created_at: "2026-08-26T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = new TrueForgeClient({
      baseUrl: "http://trueforge.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const turn = await client.createTurn("sess_1", {
      input: [{ type: "user.message", content: "hi" }],
      previousTurnId: "none",
      stream: false,
    });
    expect(turn.id).toBe("tf_turn_1");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toEqual({
      input: [{ type: "user.message", content: "hi" }],
      previous_turn_id: "none",
      stream: false,
    });
  });
});
