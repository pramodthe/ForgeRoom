import { describe, expect, it } from "vitest";
import { createCredentialedAgUiClient } from "./credentialed-agui-client";

describe("createCredentialedAgUiClient", () => {
  it("builds a cookie-credentialed HttpAgent without provider keys", () => {
    const agent = createCredentialedAgUiClient({
      channelId: "channel_demo",
      coworkerId: "coworker_research",
      logicalThreadId: "thread_coworker_research",
      csrfToken: "csrf_test",
      initialUserMessage: { id: "msg_1", content: "hello" },
    });

    expect(agent).toBeTruthy();
    expect(String((agent as { url?: string }).url ?? "")).toContain(
      "/api/ag-ui/channels/channel_demo/coworkers/coworker_research/runs",
    );
    expect((agent as { threadId?: string }).threadId).toBe("thread_coworker_research");
    const headers = (agent as { headers?: Record<string, string> }).headers;
    expect(headers?.["x-csrf-token"]).toBe("csrf_test");
    expect(headers).not.toHaveProperty("authorization");
    expect(JSON.stringify(agent)).not.toMatch(/api[_-]?key|openai|anthropic|provider/i);
  });
});
