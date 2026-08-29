import { HttpAgent } from "@forgeroom/ag-ui/browser";
import { apiUrl } from "../api/http-client";

export type CredentialedAgUiClientOptions = {
  channelId: string;
  coworkerId: string;
  logicalThreadId: string;
  csrfToken: string;
  initialUserMessage?: {
    id: string;
    content: string;
  };
};

/**
 * One credentialed official AG-UI HttpAgent factory for all coworker threads.
 * Session cookies + CSRF only — never browser provider keys or model credentials.
 */
export function createCredentialedAgUiClient(options: CredentialedAgUiClientOptions): HttpAgent {
  return new HttpAgent({
    url: apiUrl(
      `/api/ag-ui/channels/${encodeURIComponent(options.channelId)}/coworkers/${encodeURIComponent(options.coworkerId)}/runs`,
    ),
    threadId: options.logicalThreadId,
    initialMessages: options.initialUserMessage
      ? [
          {
            id: options.initialUserMessage.id,
            role: "user",
            content: options.initialUserMessage.content,
          },
        ]
      : [],
    headers: { "x-csrf-token": options.csrfToken },
    fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),
  });
}
