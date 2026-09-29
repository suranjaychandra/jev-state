import { describe, expect, it } from "vitest";
import { band, project } from "../src/index.js";

const run = (rule: ReturnType<typeof band>, value: unknown, parent: object = {}) =>
  project({ ...parent, v: value }, { v: rule }).state.v;

describe("band", () => {
  it("splits min..max into equal bands", () => {
    const rule = band({ max: 100, labels: ["low", "medium", "high"] });
    expect(run(rule, 0)).toBe("low");
    expect(run(rule, 33)).toBe("low");
    expect(run(rule, 34)).toBe("medium");
    expect(run(rule, 99)).toBe("high");
    expect(run(rule, 100)).toBe("high");
  });

  it("clamps values outside the range", () => {
    const rule = band({ max: 10, labels: ["low", "high"] });
    expect(run(rule, -5)).toBe("low");
    expect(run(rule, 50)).toBe("high");
  });

  it("treats cuts as fractions when max is set", () => {
    const rule = band({ max: (ctx) => ctx.parent.maxHp, cuts: [0.2, 0.5], labels: ["critical", "low", "healthy"] });
    expect(run(rule, 45, { maxHp: 300 })).toBe("critical");
    expect(run(rule, 45, { maxHp: 50 })).toBe("healthy");
    expect(run(rule, 60, { maxHp: 300 })).toBe("low");
  });

  it("treats cuts as raw values without max", () => {
    const rule = band({ cuts: [10, 30], labels: ["near", "medium", "far"] });
    expect(run(rule, 9.9)).toBe("near");
    expect(run(rule, 10)).toBe("medium");
    expect(run(rule, 30)).toBe("far");
  });

  it("honours min", () => {
    const rule = band({ min: -20, max: 40, labels: ["cold", "mild", "hot"] });
    expect(run(rule, -10)).toBe("cold");
    expect(run(rule, 15)).toBe("mild");
    expect(run(rule, 35)).toBe("hot");
  });

  it("leaves non-numbers and bad ranges alone", () => {
    const rule = band({ max: (ctx) => ctx.parent.maxHp, labels: ["low", "high"] });
    expect(run(rule, "12", { maxHp: 100 })).toBe("12");
    expect(run(rule, Number.NaN, { maxHp: 100 })).toBeNaN();
    expect(run(rule, 5, { maxHp: 0 })).toBe(5);
    expect(run(rule, 5)).toBe(5);
  });

  it("rejects bad options", () => {
    expect(() => band({ labels: ["only"], max: 1 })).toThrow(RangeError);
    expect(() => band({ labels: ["a", "b"] })).toThrow(/max.*cuts/);
    expect(() => band({ labels: ["a", "b", "c"], cuts: [1] })).toThrow(/needs 2 cuts/);
    expect(() => band({ labels: ["a", "b", "c"], cuts: [5, 5] })).toThrow(/ascending/);
  });
});
