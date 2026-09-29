import { describe, expect, it } from "vitest";
import { MAX_OPTIONS, NONE_ID, pick } from "../src/index.js";

const enemies = [
  { name: "Goblin Archer", distance: "far" },
  { name: "Goblin Archer", distance: "near" },
  { name: "Orc  Chief!", distance: "medium" },
];

describe("pick", () => {
  it("builds a choice question with unique slug ids and a none option", () => {
    const p = pick("Which enemy first?", enemies, { label: (e) => e.name, describe: (e) => `${e.name}, ${e.distance}` });
    expect(p.ids).toEqual(["goblin_archer", "goblin_archer_2", "orc_chief"]);
    expect(p.question).toEqual({
      type: "choice",
      instructions: "Which enemy first?",
      criteria: {
        goblin_archer: "Goblin Archer, far",
        goblin_archer_2: "Goblin Archer, near",
        orc_chief: "Orc  Chief!, medium",
        [NONE_ID]: "None of the listed options fit.",
      },
    });
  });

  it("resolves answers back to the original items", () => {
    const p = pick("Which?", enemies, { label: (e) => e.name });
    expect(p.resolve("goblin_archer_2")).toBe(enemies[1]);
    expect(p.resolve({ choice: "orc_chief", confidence: 0.9 })).toBe(enemies[2]);
    expect(p.resolve({ choice: NONE_ID, confidence: 0.99 })).toBeNull();
    expect(p.resolve("missing")).toBeNull();
  });

  it("returns null below minConfidence", () => {
    const p = pick("Which?", enemies, { label: (e) => e.name });
    expect(p.resolve({ choice: "orc_chief", confidence: 0.4 }, { minConfidence: 0.6 })).toBeNull();
    expect(p.resolve({ choice: "orc_chief" }, { minConfidence: 0.6 })).toBeNull();
    expect(p.resolve({ choice: "orc_chief", confidence: 0.6 }, { minConfidence: 0.6 })).toBe(enemies[2]);
  });

  it("can leave out the none option or reword it", () => {
    expect(Object.keys(pick("Which?", enemies, { label: (e) => e.name, none: false }).question.criteria)).not.toContain(NONE_ID);
    expect(pick("Which?", enemies, { label: (e) => e.name, none: "Hold fire" }).question.criteria[NONE_ID]).toBe("Hold fire");
  });

  it("never reuses the none id and falls back for empty labels", () => {
    const p = pick("Which?", [{ n: "None of these" }, { n: "!!!" }], { label: (x) => x.n });
    expect(p.ids).toEqual([`${NONE_ID}_2`, "option"]);
  });

  it("enforces option limits", () => {
    expect(() => pick("Which?", [], { label: String })).toThrow(/at least two/);
    expect(() => pick("Which?", [1], { label: String, none: false })).toThrow(/at least two/);
    const many = Array.from({ length: MAX_OPTIONS }, (_, i) => i);
    expect(() => pick("Which?", many, { label: String })).toThrow(/prune/);
    expect(() => pick("Which?", many, { label: String, none: false })).not.toThrow();
  });
});
