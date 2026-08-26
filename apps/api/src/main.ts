import { startApiProcess } from "./index";

const handle = await startApiProcess();

console.log(
  JSON.stringify({
    msg: "forgeroom api listening",
    host: handle.config.host,
    port: handle.config.port,
    embedWorker: handle.config.embedWorker,
  }),
);
