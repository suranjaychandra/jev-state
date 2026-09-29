/** Return this from a rule to remove the field from the projected state. */
export const DROP: unique symbol = Symbol("jev-state.drop");
export type Drop = typeof DROP;

/** Text, a JSON object or array, or `null`: the shapes Jev accepts for state, instructions, and criteria. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type EntryType = string | { [key: string]: JsonValue } | JsonValue[] | null;

/** Where a rule is running. Rules always see the raw input, never already-projected values. */
export interface RuleContext {
  /** The whole raw input passed to `project()`. */
  readonly root: any;
  /** The raw object or array holding this value. */
  readonly parent: any;
  /** This value's key in `parent`. */
  readonly key: string | number;
  /** Dotted path such as `npc.hp`; array elements appear as `[]`, e.g. `enemies[].distance`. */
  readonly path: string;
  /** @internal */
  readonly [ENV]: Env;
}

/**
 * A function from a raw value to its projected value. Return `DROP` to remove the field,
 * or `undefined` to leave it out. A rule may also be keyed on a field the raw input lacks,
 * which lets it add a derived field.
 */
export type Rule = (value: any, ctx: RuleContext) => unknown;

/** Rules keyed by field name. Nest a schema to reach into a nested object. */
export interface Schema {
  readonly [key: string]: Rule | Schema;
}

export interface ProjectOptions {
  /** What to do with fields the schema doesn't mention. Default: `"keep"`. */
  unknown?: "keep" | "drop";
  /** Drop `null`, `""`, `[]`, and `{}` values. Default: `true`. */
  dropEmpty?: boolean;
}

/** @internal */
export const ENV: unique symbol = Symbol("jev-state.env");

/** @internal */
export interface Env {
  readonly root: unknown;
  readonly unknown: "keep" | "drop";
  readonly dropEmpty: boolean;
  readonly changed: Set<string>;
  readonly dropped: Set<string>;
}

/** A value that may be given directly or computed from where the rule runs. */
export type Resolvable<T> = T | ((ctx: RuleContext) => T);

export const resolve = <T>(v: Resolvable<T>, ctx: RuleContext): T =>
  typeof v === "function" ? (v as (ctx: RuleContext) => T)(ctx) : v;

export const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

export const isEmpty = (v: unknown): boolean =>
  v === null ||
  v === "" ||
  (Array.isArray(v) && v.length === 0) ||
  (isPlainObject(v) && Object.keys(v).length === 0);

export const childPath = (parent: string, key: string | number): string =>
  typeof key === "number" ? `${parent}[]` : parent ? `${parent}.${key}` : key;
