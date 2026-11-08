import { build } from "esbuild";
import { mkdir, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir(".test-build", { recursive: true });
const outfile = ".test-build/core.test.cjs";
try {
  await build({ entryPoints: ["tests/core.test.ts"], outfile, bundle: true, packages: "external", platform: "node", format: "cjs", logLevel: "silent" });
  const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally { await unlink(outfile).catch(() => {}); }
