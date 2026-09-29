import { describe, expect, it } from "vitest";
import { count, project, relativeTime, time } from "../src/index.js";

describe("count", () => {
  const rule = count();
  const run = (v: unknown) => project({ v }, { v: rule }, { dropEmpty: false }).state.v;

  it("names counts of numbers and arrays", () => {
    expect(run(0)).toBe("none");
    expect(run([])).toBe("none");
    expect(run(1)).toBe("one");
    expect(run([1, 2])).toBe("a few");
    expect(run(3)).toBe("a few");
    expect(run(4)).toBe("several");
    expect(run(9)).toBe("several");
    expect(run(10)).toBe("many");
  });

  it("takes custom thresholds and labels", () => {
    const custom = count({ few: 5, many: 6, labels: { none: "empty", many: "loads" } });
    const r = (v: unknown) => project({ v }, { v: custom }).state.v;
    expect(r(0)).toBe("empty");
    expect(r(5)).toBe("a few");
    expect(r(6)).toBe("loads");
  });

  it("leaves other values alone", () => {
    expect(run(-1)).toBe(-1);
    expect(run(2.5)).toBe(2.5);
    expect(run("3")).toBe("3");
  });

  it("rejects bad thresholds", () => {
    expect(() => count({ few: 1 })).toThrow(RangeError);
    expect(() => count({ few: 5, many: 5 })).toThrow(RangeError);
  });
});

describe("time", () => {
  const now = Date.UTC(2026, 8, 29, 12, 0, 0);
  const run = (v: unknown, opts = {}) => project({ v }, { v: time({ now, ...opts }) }).state.v;

  it("describes the past", () => {
    expect(run(now - 3_000)).toBe("just now");
    expect(run(now - 45_000)).toBe("less than a minute ago");
    expect(run(now - 3 * 60_000)).toBe("a few minutes ago");
    expect(run(now - 30 * 60_000)).toBe("within the last hour");
    expect(run(now - 5 * 3_600_000)).toBe("within the last day");
    expect(run(now - 3 * 86_400_000)).toBe("within the last week");
    expect(run(now - 20 * 86_400_000)).toBe("within the last month");
    expect(run(now - 90 * 86_400_000)).toBe("more than a month ago");
  });

  it("describes the future", () => {
    expect(run(now + 3_000)).toBe("any moment now");
    expect(run(now + 2 * 60_000)).toBe("in a few minutes");
    expect(run(now + 90 * 86_400_000)).toBe("more than a month from now");
  });

  it("accepts Dates, ISO strings, and epoch seconds", () => {
    expect(run(new Date(now - 45_000))).toBe("less than a minute ago");
    expect(run(new Date(now - 45_000).toISOString())).toBe("less than a minute ago");
    expect(run(Math.floor((now - 3 * 60_000) / 1000))).toBe("a few minutes ago");
    expect(run(now - 3 * 60_000, { unit: "ms" })).toBe("a few minutes ago");
  });

  it("reads now from the state", () => {
    const rule = time({ now: (ctx) => ctx.root.clock });
    expect(project({ clock: now, seen: now - 45_000 }, { seen: rule }).state.seen).toBe("less than a minute ago");
  });

  it("supports custom wording", () => {
    expect(run(now - 120_000, { format: (d: number) => `${d / 1000}s ago` })).toBe("120s ago");
  });

  it("leaves unparseable values alone", () => {
    expect(run("not a date")).toBe("not a date");
    expect(run(true)).toBe(true);
  });

  it("exports the default wording", () => {
    expect(relativeTime(0)).toBe("just now");
  });
});
