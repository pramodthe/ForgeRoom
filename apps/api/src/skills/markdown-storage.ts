import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function materializeSkillMarkdown(input: {
  rootDir: string;
  blobKey: string;
  markdown: string;
}): Promise<void> {
  const root = resolve(input.rootDir);
  const objectPath = resolve(root, input.blobKey);
  if (!objectPath.startsWith(`${root}/`) && objectPath !== root) {
    throw new Error("skill markdown blob key resolves outside storage root");
  }
  await mkdir(dirname(objectPath), { recursive: true });
  await writeFile(objectPath, input.markdown, { encoding: "utf8", flag: "wx" }).catch(
    async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") {
        throw error;
      }
    },
  );
}

export function resolveSkillStorageRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.SKILL_STORAGE_DIR?.trim() || env.ARTIFACT_STORAGE_DIR?.trim();
  return configured && configured.length > 0 ? configured : null;
}
