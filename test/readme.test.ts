import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// README code blocks marked `<!-- example: path -->` must match the runnable file exactly,
// except that the file imports from src while the README imports from "jev-state".
// The files themselves are typechecked in CI, so the README can't drift out of date.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readme = read("README.md");
const blocks = [...readme.matchAll(/<!-- example: (\S+) -->\n```ts\n([\s\S]*?)```/g)];

describe("README examples", () => {
  it("includes the quick start, recipes, and composition example", () => {
    expect(blocks.map((b) => b[1])).toEqual([
      "examples/quickstart.ts",
      "examples/recipes/game-npc.ts",
      "examples/recipes/support-ticket.ts",
      "examples/recipes/agent-pick.ts",
      "examples/composition.ts",
    ]);
  });

  for (const [, path, code] of blocks) {
    it(`${path} matches its README block`, () => {
      const source = read(path!).replace(/from "(\.\.\/)+src\/index\.js"/g, 'from "jev-state"');
      expect(code).toBe(source);
    });
  }
});
