import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const loader = pathToFileURL(require.resolve("tsx")).href;
const sourcePath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const quickstart = readme.match(/<!-- example: examples\/quickstart.ts -->\n```ts\n([\s\S]*?)```/)![1]!;

// Run the README in both consumer module formats, using the real library source.
// Only the SDK is replaced: this checks the example without credentials or API calls.
it.each(["commonjs", "module"])("runs the README quick start in a %s project", (type) => {
  const dir = mkdtempSync(join(tmpdir(), "jev-state-quickstart-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify(type === "module" ? { type } : {}));
    writeFileSync(join(dir, "sdk.cjs"), `
const assert = require("node:assert/strict");
exports.choice = (instructions, criteria) => ({ type: "choice", instructions, criteria });
exports.TypeSafeClient = class {
  async systemOne({ state, questions }) {
    assert.deepEqual(state, {
      hp: "critical", enemies: "a few", lastNoiseAt: "less than a minute ago",
    });
    assert.equal(questions.action.type, "choice");
    assert.deepEqual(Object.keys(questions.action.criteria), ["retreat", "attack", "patrol"]);
    return { answers: { action: { choice: "retreat", confidence: 0.93 } } };
  }
};
`);
    writeFileSync(join(dir, "quickstart.ts"), quickstart
      .replace('from "jev-state"', `from ${JSON.stringify(sourcePath)}`)
      .replace('from "@typesafe-ai/sdk"', 'from "./sdk.cjs"'));
    const result = spawnSync(process.execPath, ["--import", loader, join(dir, "quickstart.ts")], {
      cwd: dir,
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env.PATH ?? "", TSX_DISABLE_CACHE: "1" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("retreat 0.93");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
