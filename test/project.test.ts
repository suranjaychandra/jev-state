import { describe, expect, it, vi } from "vitest";
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

  it.each([true, false])("preserves special JSON keys without changing the output prototype (dropEmpty: %s)", (dropEmpty) => {
    const raw = JSON.parse('{"__proto__":{"role":"admin"},"constructor":"npc","prototype":"data","toString":"label","hp":20}');
    const before = structuredClone(raw);
    const { state, meta } = project(raw, {}, { dropEmpty });

    expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
    expect(Object.hasOwn(state, "__proto__")).toBe(true);
    expect(state.role).toBeUndefined();
    expect(JSON.stringify(state)).toBe(JSON.stringify(raw));
    expect(project(state, {}, { dropEmpty }).state).toEqual(raw);
    expect(meta).toEqual({ changed: [], dropped: [] });
    expect(raw).toEqual(before);
    expect(Object.getPrototypeOf(raw)).toBe(Object.prototype);
  });

  it("preserves special keys inside untouched objects and array elements while cleaning empty fields", () => {
    const raw = JSON.parse('{"nested":{"__proto__":{"role":"admin"},"empty":null},"list":[{"__proto__":"data","empty":null}]}');
    const { state, meta } = project(raw, {});
    const expected = JSON.parse('{"nested":{"__proto__":{"role":"admin"}},"list":[{"__proto__":"data"}]}');

    expect(JSON.stringify(state)).toBe(JSON.stringify(expected));
    expect(Object.getPrototypeOf(state.nested)).toBe(Object.prototype);
    const item = (state.list as object[])[0]!;
    expect(Object.getPrototypeOf(item)).toBe(Object.prototype);
    expect(Object.hasOwn(item, "__proto__")).toBe(true);
    expect(meta.dropped).toEqual(["nested.empty", "list[].empty"]);
    expect(raw.nested.empty).toBeNull();
  });

  it("applies a nested schema to an own __proto__ field", () => {
    const raw = JSON.parse('{"npc":{"__proto__":{"value":1,"debug":2},"hp":20}}');
    const { state, meta } = project(raw, {
      npc: { ["__proto__"]: { value: keep() } },
    }, { unknown: "drop" });

    expect(JSON.stringify(state)).toBe('{"npc":{"__proto__":{"value":1}}}');
    expect(Object.getPrototypeOf(state.npc)).toBe(Object.prototype);
    expect(meta.dropped).toEqual(["npc.__proto__.debug", "npc.hp"]);
  });

  it("passes undefined to derived rules for absent keys with inherited names", () => {
    const keys = ["__proto__", "constructor", "toString"];
    const schema = Object.fromEntries(keys.map((key) => [key, (value: unknown) => {
      expect(value).toBeUndefined();
      return `derived-${key}`;
    }]));
    const { state, meta } = project({}, schema);

    expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
    for (const key of keys) {
      expect(Object.hasOwn(state, key)).toBe(true);
      expect(state[key]).toBe(`derived-${key}`);
    }
    expect(meta.changed).toEqual(keys);
    expect(meta.dropped).toEqual([]);
  });

  it("does not copy inherited properties when keep() names a missing field", () => {
    const { state, meta } = project({}, {
      ["__proto__"]: keep(), constructor: keep(), toString: keep(),
    }, { dropEmpty: false });

    expect(Object.keys(state)).toEqual([]);
    expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
    expect(meta).toEqual({ changed: [], dropped: [] });
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

  it("passes transformed values to function stages while retaining their surrounding context", () => {
    const raw = { hp: 20, maxHp: 100 };
    const { state } = project(raw, {
      hp: pipe(
        (value) => value * 2,
        (value, ctx) => {
          expect(value).toBe(40);
          expect(ctx.parent).toBe(raw);
          expect(ctx.parent.hp).toBe(20);
          expect(ctx.root).toBe(raw);
          expect(ctx.key).toBe("hp");
          return value;
        },
      ),
    });
    expect(state.hp).toBe(40);
    expect(raw.hp).toBe(20);
  });

  it("lets a later schema use intentionally transformed siblings while root stays original", () => {
    const raw = { npc: { hp: 60, maxHp: 100 } };
    const { state } = project(raw, {
      npc: pipe(
        { maxHp: () => 200 },
        { hp: band({
          max: (ctx) => {
            expect(ctx.parent.maxHp).toBe(200);
            expect(ctx.root).toBe(raw);
            expect(ctx.root.npc.maxHp).toBe(100);
            return ctx.parent.maxHp;
          },
          labels: ["low", "high"],
        }) },
      ),
    });
    expect(state).toEqual({ npc: { hp: "low", maxHp: 200 } });
    expect(raw).toEqual({ npc: { hp: 60, maxHp: 100 } });
  });

  it("runs both documented ways to calculate health when pruning maxHp", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await import("../examples/composition.js");
      expect(log.mock.calls).toEqual([
        [{ npc: { hp: "low" } }],
        [{ npc: { hp: "low" } }],
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it("keeps calculations with their array items and uses current indexes after sorting", () => {
    const raw = { units: [
      { id: "far", distance: 30, hp: 20, maxHp: 100 },
      { id: "near", distance: 5, hp: 20, maxHp: 20 },
    ] };
    const before = structuredClone(raw);
    const { state } = project(raw, {
      units: pipe(
        each({ hp: band({ max: (ctx) => ctx.parent.maxHp, labels: ["low", "high"] }) }),
        prune({ keep: ["id", "hp", "distance"], sortBy: (a, b) => a.distance - b.distance }),
        each((unit, ctx) => {
          expect(ctx.root).toBe(raw);
          expect(ctx.parent[ctx.key]).toBe(unit);
          expect(unit.id).toBe(ctx.key === 0 ? "near" : "far");
          expect(unit.maxHp).toBeUndefined();
          return unit;
        }),
      ),
    });
    expect(state.units).toEqual([
      { id: "near", hp: "high", distance: 5 },
      { id: "far", hp: "low", distance: 30 },
    ]);
    expect(raw).toEqual(before);
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
