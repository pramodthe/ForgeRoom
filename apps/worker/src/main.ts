import { startWorkerProcess } from "./index";

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
