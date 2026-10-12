import { describe, expect, it } from "vitest";
import { drop, keep, pipe, project, type ProjectOptions, type Schema } from "../src/index.js";

const strict = (raw: object, schema: Schema, options: ProjectOptions = {}) =>
  project(raw, schema, { ...options, strict: true });

describe("project JSON output", () => {
  it("is off by default, so values accepted by 0.1.1 still pass through", () => {
    const date = new Date(0);
    const { state } = project({ date, score: NaN, list: [undefined] }, {});
    expect(state.date).toBe(date);
    expect(state.score).toBeNaN();
    expect(state.list).toEqual([undefined]);
  });

  it.each([true, false])("rejects unsupported retained values with a field path (dropEmpty: %s)", (dropEmpty) => {
    const invalid = [1n, NaN, Infinity, -Infinity, Symbol("private"), () => 1,
      new Date(0), new Map(), new Set(), new Uint8Array([1])];
    for (const value of invalid) {
      const schemas: Schema[] = [{}, { payload: keep() }, { payload: () => value }];
      for (const schema of schemas) {
        expect(() => strict({ payload: value }, schema, { dropEmpty })).toThrow(TypeError);
        expect(() => strict({ payload: value }, schema, { dropEmpty })).toThrow(/\$\["payload"\]/);
      }
    }
  });

  it("identifies nested fields and array indexes without printing the value", () => {
    expect(() => strict({ items: [{ "a.b": 12345678901234567890n }] }, {}))
      .toThrow('project() output at $["items"][0]["a.b"] is not JSON-compatible: bigint. Convert or drop this value in your schema.');
  });

  it("rejects undefined array elements and holes instead of silently turning them into null", () => {
    for (const list of [[undefined], Array(1)]) {
      expect(() => strict({ list }, {})).toThrow(/\$\["list"\]\[0\].*undefined/);
    }
    expect(() => strict({ nested: { missing: undefined } }, {}, { dropEmpty: false }))
      .toThrow(/\$\["nested"\]\["missing"\]/);
    expect(strict({ missing: undefined, nested: { missing: undefined, ok: true } }, {}).state)
      .toEqual({ nested: { ok: true } });
  });

  it.each([true, false])("rejects circular objects and arrays without overflowing (dropEmpty: %s)", (dropEmpty) => {
    const object: Record<string, unknown> = { ok: true };
    object.self = object;
    const array: unknown[] = [];
    array.push(array);
    const schemas: Schema[] = [{}, { value: keep() }];
    for (const value of [object, array]) {
      for (const schema of schemas) {
        expect(() => strict({ value }, schema, { dropEmpty })).toThrow(/circular reference/);
      }
    }
    expect(object.self).toBe(object);
    expect(array[0]).toBe(array);
  });

  it("allows rules to drop or convert unsupported raw and intermediate values", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const { state } = strict({ id: 123n, date: new Date(0), cycle, temporary: 1 }, {
      id: (value) => String(value),
      date: (value) => value.toISOString(),
      cycle: drop(),
      temporary: pipe(() => 2n, (value) => String(value)),
    });
    expect(state).toEqual({ id: "123", date: "1970-01-01T00:00:00.000Z", temporary: "2" });
    expect(strict({ cycle }, {}, { unknown: "drop" }).state).toEqual({});
    expect(strict({ value: { cycle, ok: true } }, {
      value: pipe({}, { cycle: drop() }),
    }).state).toEqual({ value: { ok: true } });
  });

  it("accepts shared references, null-prototype objects and all JSON value types", () => {
    const shared = Object.assign(Object.create(null), { score: 1 });
    const raw = { a: shared, b: shared, list: [null, "", true, false, 0, -1.5, [], {}] };
    const state = strict(raw, {}, { dropEmpty: false }).state;
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(raw.a).toBe(raw.b);
  });

  it("rejects retained serialization hooks that could replace validated data", () => {
    const value = Object.defineProperty({ ok: true }, "toJSON", { value: () => 1n });
    expect(() => strict({ value }, { value: keep() })).toThrow(/custom toJSON method/);
    expect(() => strict({ value }, {}, { dropEmpty: false })).toThrow(/custom toJSON method/);
  });
});
