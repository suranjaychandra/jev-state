import { describe, expect, it } from "vitest";
import { DROP, band, count, drop, each, keep, pipe, project, prune } from "../src/index.js";

describe("project", () => {
  it("keeps unknown fields and applies rules", () => {
    const { state, meta } = project({ hp: 20, name: "Rex" }, { hp: band({ max: 100, labels: ["low", "high"] }) });
    expect(state).toEqual({ hp: "low", name: "Rex" });
    expect(meta.changed).toEqual(["hp"]);
  });

  it("drops unknown fields when asked", () => {
    const { state, meta } = project({ a: 1, b: 2, c: 3 }, { a: keep() }, { unknown: "drop" });
    expect(state).toEqual({ a: 1 });
    expect(meta.dropped.sort()).toEqual(["b", "c"]);
  });

  it("drops empty values, including inside untouched objects", () => {
    const { state, meta } = project(
      { a: null, b: "", c: [], d: {}, e: { f: null, g: 1, h: { i: [] } }, list: [null, 1] },
      {},
    );
    expect(state).toEqual({ e: { g: 1 }, list: [null, 1] });
    expect(meta.dropped).toEqual(expect.arrayContaining(["a", "b", "c", "d", "e.f", "e.h.i", "e.h"]));
  });

  it("can keep empty values", () => {
    expect(project({ a: null }, {}, { dropEmpty: false }).state).toEqual({ a: null });
  });

  it("walks nested schemas", () => {
    const { state, meta } = project(
      { npc: { hp: 10, maxHp: 200, debug: "x" } },
      { npc: { hp: band({ max: (ctx) => ctx.parent.maxHp, labels: ["low", "high"] }), maxHp: drop(), debug: drop() } },
    );
    expect(state).toEqual({ npc: { hp: "low" } });
    expect(meta.changed).toEqual(["npc.hp"]);
    expect(meta.dropped.sort()).toEqual(["npc.debug", "npc.maxHp"]);
  });

  it("lets rules read raw siblings that another rule drops", () => {
    const { state } = project(
      { hp: 90, maxHp: 100 },
      { maxHp: drop(), hp: band({ max: (ctx) => ctx.parent.maxHp, labels: ["low", "high"] }) },
    );
    expect(state).toEqual({ hp: "high" });
  });

  it("adds derived fields from rules keyed on missing fields", () => {
    const { state, meta } = project(
      { enemies: [{ d: 40 }, { d: 5 }] },
      { nearest: (_, ctx) => Math.min(...ctx.root.enemies.map((e: { d: number }) => e.d)) },
    );
    expect(state.nearest).toBe(5);
    expect(meta.changed).toEqual(["nearest"]);
  });

  it("does not mutate the input", () => {
    const raw = { list: [{ a: 1, b: 2 }], hp: 5 };
    const copy = structuredClone(raw);
    project(raw, { list: prune({ keep: ["a"] }), hp: drop() });
    expect(raw).toEqual(copy);
  });

  it("rejects non-objects", () => {
    expect(() => project([] as unknown as object, {})).toThrow(TypeError);
  });
});

describe("each and pipe", () => {
  const enemies = [
    { id: "a", distance: 50, hp: 10, mesh: "m1" },
    { id: "b", distance: 5, hp: 90, mesh: "m2" },
    { id: "c", distance: 20, hp: 50, mesh: "m3" },
  ];

  it("applies a schema to every element", () => {
    const { state, meta } = project(
      { enemies },
      {
        enemies: pipe(
          prune({ omit: ["mesh"], sortBy: (a, b) => a.distance - b.distance, max: 2 }),
          each({ distance: band({ cuts: [10, 30], labels: ["near", "medium", "far"] }) }),
        ),
      },
    );
    expect(state.enemies).toEqual([
      { id: "b", distance: "near", hp: 90 },
      { id: "c", distance: "medium", hp: 50 },
    ]);
    expect(meta.changed).toEqual(expect.arrayContaining(["enemies", "enemies[].distance"]));
  });

  it("keeps fields a schema inside each() doesn't name, even with unknown: drop", () => {
    const { state } = project(
      { enemies, noise: 1 },
      { enemies: pipe(prune({ keep: ["id", "distance"] }), each({ distance: band({ cuts: [10], labels: ["near", "far"] }) })) },
      { unknown: "drop" },
    );
    expect(state).toEqual({
      enemies: [
        { id: "a", distance: "far" },
        { id: "b", distance: "near" },
        { id: "c", distance: "far" },
      ],
    });
  });

  it("removes elements a rule drops", () => {
    const { state } = project({ xs: [1, 2, 3, 4] }, { xs: each((x) => (x % 2 ? x : DROP)) });
    expect(state.xs).toEqual([1, 3]);
  });

  it("each ignores non-arrays and pipe stops at DROP", () => {
    expect(project({ v: 3 }, { v: each(() => 1) }).state.v).toBe(3);
    let called = false;
    const { state } = project({ v: 1 }, { v: pipe(drop(), () => (called = true)) });
    expect(state).toEqual({});
    expect(called).toBe(false);
  });

  it("pipe can build a derived field", () => {
    const { state } = project({ list: [1, 2, 3, 4, 5] }, { size: pipe((_, ctx) => ctx.root.list, count()) });
    expect(state.size).toBe("several");
  });
});

describe("prune", () => {
  it("keeps or omits object fields", () => {
    expect(project({ o: { a: 1, b: 2 } }, { o: prune({ keep: ["a", "zzz"] }) }).state.o).toEqual({ a: 1 });
    expect(project({ o: { a: 1, b: 2 } }, { o: prune({ omit: ["a"] }) }).state.o).toEqual({ b: 2 });
  });

  it("filters, sorts, and caps arrays without mutating them", () => {
    const xs = [5, 1, 4, 2, 3];
    const { state } = project({ xs }, { xs: prune<number>({ filter: (x) => x > 1, sortBy: (a, b) => a - b, max: 3 }) });
    expect(state.xs).toEqual([2, 3, 4]);
    expect(xs).toEqual([5, 1, 4, 2, 3]);
  });

  it("rejects bad options", () => {
    expect(() => prune({ keep: ["a"], omit: ["b"] })).toThrow(TypeError);
    expect(() => prune({ max: -1 })).toThrow(RangeError);
  });
});
