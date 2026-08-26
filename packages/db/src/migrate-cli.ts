import { createSql, databaseUrl } from "./client";
import { migrate, rollbackLast } from "./migrate";

const down = process.argv.includes("--down");
const sql = createSql(databaseUrl());

try {
  if (down) {
    const rolled = await rollbackLast(sql);
    process.stdout.write(rolled ? `rolled back ${rolled}\n` : "no applied migrations\n");
  } else {
    const applied = await migrate(sql);
    process.stdout.write(
      applied.length > 0 ? `applied ${applied.join(", ")}\n` : "already up to date\n",
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
