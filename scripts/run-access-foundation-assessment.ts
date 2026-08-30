import { generateAccessFoundationReport, prepareFoundationBackfill, seedApprovedShadowFlags } from "../server/access-foundation-report";

async function main() {
  await seedApprovedShadowFlags();
  await prepareFoundationBackfill();
  const report = await generateAccessFoundationReport();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error("[access-foundation-assessment] failed:", error);
  process.exitCode = 1;
});