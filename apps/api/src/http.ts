import type { ErrorCode, ErrorEnvelope } from "@forgeroom/contracts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { randomOpaqueId } from "./auth/crypto";

export function errorResponse(
  code: ErrorCode,
  message: string,
  options: {
    status: ContentfulStatusCode;
    retryable?: boolean;
    details?: ErrorEnvelope["error"]["details"];
  },
): { status: ContentfulStatusCode; body: ErrorEnvelope } {
  return {
    status: options.status,
    body: {
      error: {
        code,
        message,
        request_id: randomOpaqueId("req"),
        retryable: options.retryable ?? false,
        details: options.details ?? {},
      },
    },
  };
}
