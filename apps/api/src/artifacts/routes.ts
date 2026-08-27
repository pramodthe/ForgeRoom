import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode } from "@forgeroom/contracts";
import { randomOpaqueId } from "../auth/crypto";
import type { AuthService } from "../auth/service";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";
import { requireParam, requireSession } from "../http-guards";
import type { ArtifactService } from "./service";

function fail(
  c: Context,
  error: {
    code: string;
    message: string;
  },
) {
  const status: ContentfulStatusCode =
    error.code === "not_found"
      ? 404
      : error.code === "forbidden" || error.code === "unauthenticated"
        ? error.code === "unauthenticated"
          ? 401
          : 403
        : 400;
  const failure = errorResponse(error.code as ErrorCode, error.message, { status });
  return c.json(failure.body, failure.status);
}

function okJson(c: Context, body: object, status: ContentfulStatusCode) {
  return c.json({ ...body, request_id: randomOpaqueId("req") }, status);
}

export function mountArtifactRoutes(
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
  },
  options: { env: ApiEnv; auth: AuthService; artifacts: ArtifactService },
) {
  const { env, auth, artifacts } = options;

  app.get("/api/artifacts/:artifactId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const artifactId = requireParam(c, "artifactId");
    if (artifactId instanceof Response) {
      return artifactId;
    }
    const result = await artifacts.getArtifact(authed.session, artifactId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.get("/api/artifacts/:artifactId/download", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const artifactId = requireParam(c, "artifactId");
    if (artifactId instanceof Response) {
      return artifactId;
    }
    const result = await artifacts.downloadArtifact(authed.session, artifactId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    const encoded = encodeURIComponent(result.value.filename);
    c.header("Content-Type", result.value.mimeType);
    c.header(
      "Content-Disposition",
      `attachment; filename="${result.value.filename}"; filename*=UTF-8''${encoded}`,
    );
    c.header("Content-Length", String(result.value.content.byteLength));
    return c.body(new Uint8Array(result.value.content));
  });

  app.get("/api/artifacts/:artifactId/preview", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const artifactId = requireParam(c, "artifactId");
    if (artifactId instanceof Response) {
      return artifactId;
    }
    const result = await artifacts.previewArtifact(authed.session, artifactId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    for (const [key, value] of Object.entries(result.value.headers)) {
      c.header(key, value);
    }
    if (result.value.imageBody) {
      c.header("Content-Length", String(result.value.imageBody.byteLength));
      return c.body(new Uint8Array(result.value.imageBody));
    }
    return okJson(c, { preview: result.value.preview }, 200);
  });
}
