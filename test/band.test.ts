import { describe, expect, it } from "vitest";
import { band, pipe, project } from "../src/index.js";

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
    // band leaves NaN unchanged; a later rule must normalize it before final JSON validation.
    expect(project({ v: NaN, maxHp: 100 }, {
      v: pipe(rule, (value) => {
        expect(value).toBeNaN();
        return "unknown";
      }),
    }).state.v).toBe("unknown");
    expect(run(rule, 5, { maxHp: 0 })).toBe(5);
    expect(run(rule, 5)).toBe(5);
  });

  it("rejects bad options", () => {
    expect(() => band({ labels: ["only"], max: 1 })).toThrow(RangeError);
    expect(() => band({ labels: ["a", "b"] })).toThrow(/max.*cuts/);
    expect(() => band({ labels: ["a", "b", "c"], cuts: [1] })).toThrow(/needs 2 cuts/);
    expect(() => band({ labels: ["a", "b", "c"], cuts: [5, 5] })).toThrow(/ascending/);
  });

  it("rejects non-finite, non-numeric and missing cuts", () => {
    for (const cut of [NaN, Infinity, -Infinity, "10", null, undefined]) {
      expect(() => band({ labels: ["low", "high"], cuts: [cut as number] }))
        .toThrow(/cuts.*finite numbers/);
    }
    expect(() => band({ labels: ["low", "high"], cuts: Array(1) })).toThrow(/cuts.*finite numbers/);
    expect(() => band({ labels: ["low", "mid", "high"], cuts: [1, NaN] }))
      .toThrow(/cuts.*finite numbers/);
  });

  it("requires fractional cuts to stay within zero and one when max is configured", () => {
    for (const cut of [-0.1, 1.1]) {
      expect(() => band({ labels: ["low", "high"], max: 100, cuts: [cut] }))
        .toThrow(/cuts.*between 0 and 1/);
      expect(() => band({ labels: ["low", "high"], max: () => 100, cuts: [cut] }))
        .toThrow(/cuts.*between 0 and 1/);
    }
  });

  it("keeps finite inputs unchanged when resolved range bounds are invalid", () => {
    const rule = band({ min: (ctx) => ctx.parent.min, max: (ctx) => ctx.parent.max, labels: ["low", "high"] });
    for (const [min, max] of [[0, Infinity], [-Infinity, 100], [NaN, 100], [0, NaN],
      ["0", 100], [null, 100], [0, "100"], [undefined, 100], [0, undefined], [100, 0], [0, 0]]) {
      expect(project({ min, max, v: 5 }, { v: rule }, { unknown: "drop" }).state.v).toBe(5);
    }
    expect(run(band({ max: Infinity, labels: ["low", "high"] }), 5)).toBe(5);
  });

  it("keeps input unchanged when finite range endpoints produce an infinite width", () => {
    const rule = band({ min: -Number.MAX_VALUE, max: Number.MAX_VALUE, labels: ["low", "high"] });
    expect(run(rule, 0)).toBe(0);
    expect(run(rule, Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
  });

  it("passes NaN through and gives infinite inputs the edge labels, as in 0.1.1", () => {
    for (const rule of [band({ max: 100, labels: ["low", "high"] }), band({ cuts: [10], labels: ["low", "high"] })]) {
      expect(run(rule, NaN)).toBeNaN();
      expect(run(rule, Infinity)).toBe("high");
      expect(run(rule, -Infinity)).toBe("low");
    }
  });

  it("accepts fraction endpoints and negative raw cuts, assigning equality to the higher band", () => {
    const fraction = band({ max: 100, cuts: [0, 1], labels: ["low", "mid", "high"] });
    expect(run(fraction, 0)).toBe("mid");
    expect(run(fraction, 99)).toBe("mid");
    expect(run(fraction, 100)).toBe("high");
    const raw = band({ cuts: [-10, 10], labels: ["low", "mid", "high"] });
    expect(run(raw, -11)).toBe("low");
    expect(run(raw, -10)).toBe("mid");
    expect(run(raw, 10)).toBe("high");
  });
});
