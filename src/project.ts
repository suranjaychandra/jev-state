import { assertJson } from "./json.js";
import {
  DROP,
  ENV,
  type Env,
  type JsonObject,
  type ProjectOptions,
  type Rule,
  type RuleContext,
  type Schema,
  childPath,
  isEmpty,
  isPlainObject,
} from "./rule.js";

export interface Projection<T = JsonObject> {
  /** The state to send to Jev. */
  state: T;
  meta: {
    /** Schema field paths whose function rule returned a different value/reference (excluding DROP/undefined). Not a deep diff. */
    changed: string[];
    /** Field paths removed during schema processing or empty-field cleanup. Excludes removals inside prune/custom rules and array elements removed by each(). */
    dropped: string[];
  };
}

/**
 * Apply a schema of rules to raw state and return the state to send to Jev.
 *
 * The built-in rules do not mutate input. Rules within the same schema read that schema's
 * input object, so one rule can read a sibling even when another drops it. A schema inside
 * `pipe()` reads the previous stage's output. `ctx.root` always points to the original input.
 * With `strict: true`, throws a TypeError with a field path if the output is not plain JSON.
 */
export function project<T = JsonObject>(
  raw: object,
  schema: Schema,
  options: ProjectOptions = {},
): Projection<T> {
  if (!isPlainObject(raw)) throw new TypeError("project() expects a plain object as raw state");
  const env: Env = {
    root: raw,
    unknown: options.unknown ?? "keep",
    dropEmpty: options.dropEmpty ?? true,
    changed: new Set(),
    dropped: new Set(),
  };
  const state = applySchema(raw, schema, "", env) as T;
  if (options.strict) assertJson(state);
  return { state, meta: { changed: [...env.changed], dropped: [...env.dropped] } };
}

/** Run a rule or nested schema against one value. Used by `project()`, `each()`, and `pipe()`. */
export function applyEntry(value: unknown, entry: Rule | Schema, ctx: RuleContext): unknown {
  if (typeof entry === "function") return entry(value, ctx);
  if (isPlainObject(value)) return applySchema(value, entry, ctx.path, ctx[ENV]);
  return value;
}

function applySchema(obj: Record<string, unknown>, schema: Schema, path: string, env: Env) {
  const entries: [string, unknown][] = [];
  const keys = new Set([...Object.keys(obj), ...Object.keys(schema)]);

  for (const key of keys) {
    const here = childPath(path, key);
    const had = Object.hasOwn(obj, key);
    const raw = had ? obj[key] : undefined;
    const entry = Object.hasOwn(schema, key) ? schema[key] : undefined;

    let value: unknown;
    if (entry === undefined) {
      if (env.unknown === "drop") {
        env.dropped.add(here);
        continue;
      }
      value = env.dropEmpty ? clean(raw, here, env) : raw;
    } else {
      const ctx: RuleContext = { root: env.root, parent: obj, key, path: here, [ENV]: env };
      value = applyEntry(raw, entry, ctx);
      if (typeof entry === "function" && value !== raw && value !== DROP && value !== undefined) {
        env.changed.add(here);
      }
    }

    if (value === DROP || value === undefined) {
      if (had) env.dropped.add(here);
      continue;
    }
    if (env.dropEmpty && isEmpty(value)) {
      if (had) env.dropped.add(here);
      continue;
    }
    entries.push([key, value]);
  }
  // Define own data properties, including __proto__, without invoking inherited setters.
  return Object.fromEntries(entries);
}

/** Remove empty fields from a value no rule touched. Array elements are kept so indexes don't shift. */
function clean(value: unknown, path: string, env: Env, ancestors = new WeakSet<object>()): unknown {
  if (!Array.isArray(value) && !isPlainObject(value)) return value;
  // Leave cycles for final validation; a later pipeline stage may still remove them.
  if (ancestors.has(value)) return value;
  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => clean(item, `${path}[]`, env, ancestors));
    ancestors.delete(value);
    return result;
  }
  const entries: [string, unknown][] = [];
  for (const [key, child] of Object.entries(value)) {
    const here = childPath(path, key);
    const cleaned = clean(child, here, env, ancestors);
    if (cleaned === undefined || isEmpty(cleaned)) {
      env.dropped.add(here);
      continue;
    }
    entries.push([key, cleaned]);
  }
  ancestors.delete(value);
  return Object.fromEntries(entries);
}
