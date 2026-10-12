// Install the packed package into fresh CommonJS and ESM projects and use it the way a user would.
// Run after `npm run build`: node scripts/check-package.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });

const smoke = (load) => `${load}
const assert = ${load.includes("require") ? 'require("node:assert/strict")' : 'await import("node:assert/strict").then((m) => m.default)'};
const NOW = 1_800_000_000_000;
const { state } = project(
  { npc: { hp: 38, maxHp: 250, ammo: 3 }, enemies: [{ distance: 40 }, { distance: 5 }], lastNoiseAt: NOW - 30000, debug: {} },
  {
    npc: { hp: band({ max: (ctx) => ctx.parent.maxHp, cuts: [0.2, 0.5], labels: ["critical", "low", "healthy"] }), ammo: count({ few: 4 }) },
    enemies: each({ distance: band({ cuts: [10, 30], labels: ["near", "medium", "far"] }) }),
    lastNoiseAt: time({ now: NOW }),
  },
  { unknown: "drop" },
);
assert.deepEqual(state, {
  npc: { hp: "critical", ammo: "a few" },
  enemies: [{ distance: "far" }, { distance: "near" }],
  lastNoiseAt: "less than a minute ago",
});
// Values that 0.1.1 accepted must keep passing through by default.
const date = new Date(0);
assert.equal(project({ date }, {}).state.date, date);
assert.throws(() => project({ date }, {}, { strict: true }), TypeError);
const p = pick("Which?", [{ name: "Orc" }, { name: "Wolf" }], { label: (e) => e.name });
assert.deepEqual(p.resolve({ choice: "wolf", confidence: 0.9 }, { minConfidence: 0.5 }), { name: "Wolf" });
console.log("ok");
`;

const dir = mkdtempSync(join(tmpdir(), "jev-state-pack-"));
try {
  run(npm, ["pack", "--silent", "--pack-destination", dir], process.cwd());
  const tarball = join(dir, readdirSync(dir).find((f) => f.endsWith(".tgz")));
  const names = "project, band, count, time, each, pick";
  for (const [type, file, load] of [
    ["commonjs", "index.js", `const { ${names} } = require("jev-state");`],
    ["module", "index.js", `import { ${names} } from "jev-state";`],
  ]) {
    const app = join(dir, type);
    mkdirSync(app);
    writeFileSync(join(app, "package.json"), JSON.stringify({ name: `check-${type}`, private: true, type }));
    run(npm, ["install", tarball, "--no-audit", "--no-fund", "--silent"], app);
    writeFileSync(join(app, file), smoke(load));
    process.stdout.write(`${type}: ${run(process.execPath, [file], app)}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
