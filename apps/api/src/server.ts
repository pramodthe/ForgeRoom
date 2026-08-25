import { Hono } from "hono";

export function createApiApp() {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "forgeroom-api",
    }),
  );

  return app;
}
