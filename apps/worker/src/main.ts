import { startWorkerProcess } from "./index";

const handle = startWorkerProcess();

console.log(
  JSON.stringify({
    msg: "forgeroom worker started",
    embedded: handle.embedded,
  }),
);
