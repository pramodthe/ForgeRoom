import {
  loadDemoEnv,
  loadDemoFixtureBundle,
  resetDemoFixtures,
  resetSyntheticProviderLabel,
  seedDemoFixtures,
} from "./demo-seed";

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const action = argv[0] ?? "seed";
  const env = loadDemoEnv();
  if (action === "seed") {
    const result = await seedDemoFixtures({ env });
    console.log(JSON.stringify({ ok: true, action: "seed", ...result }, null, 2));
    return;
  }
  if (action === "reset") {
    if (argv.includes("--provider-only")) {
      const bundle = loadDemoFixtureBundle();
      const status = await resetSyntheticProviderLabel({
        env,
        pinned: bundle.pinnedAccount,
        synthetic: bundle.syntheticProvider,
      });
      console.log(
        JSON.stringify({ ok: true, action: "provider-reset", providerReset: status }, null, 2),
      );
      return;
    }
    const providerReset = !argv.includes("--no-provider");
    const result = await resetDemoFixtures({ env, providerReset });
    console.log(JSON.stringify({ ok: true, action: "reset", ...result }, null, 2));
    return;
  }
  console.error("Usage: pnpm fixtures:seed | pnpm fixtures:reset [--no-provider|--provider-only]");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
