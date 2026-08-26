import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { ApiEnv } from "../env";

/** Rate-limit key that does not trust client-spoofable forwarded headers by default. */
export function loginClientKey(c: Context, env: ApiEnv): string {
  if (env.trustProxy) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) {
        return first;
      }
    }
  }
  try {
    const info = getConnInfo(c);
    if (info.remote.address) {
      return info.remote.address;
    }
  } catch {
    // app.request() in tests has no socket address.
  }
  return "local";
}
