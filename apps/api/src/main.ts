import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startApiProcess } from "./index";

try {
  loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const handle = await startApiProcess();

console.log(
  JSON.stringify({
    msg: "forgeroom api listening",
    host: handle.config.host,
    port: handle.config.port,
    embedWorker: handle.config.embedWorker,
  }),
);
