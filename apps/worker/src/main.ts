import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startWorkerProcess } from "./index";

try {
  loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const handle = startWorkerProcess({
  databaseUrl: process.env.DATABASE_URL,
  markNeedsAttentionOnStart: Boolean(process.env.DATABASE_URL),
});

void handle.startup.then((result) => {
  console.log(
    JSON.stringify({
      msg: "forgeroom worker started",
      embedded: handle.embedded,
      needs_attention_marked: result.marked,
    }),
  );
});
