import {
  DROP,
  ENV,
  type Env,
  type ProjectOptions,
  type Rule,
  type RuleContext,
  type Schema,
  childPath,
  isEmpty,
  isPlainObject,
} from "./rule.js";

export interface Projection<T = Record<string, unknown>> {
  /** The state to send to Jev. */
  state: T;
  meta: {
    /** Paths a rule rewrote or added. */
    changed: string[];
    /** Paths removed by `drop()`, `unknown: "drop"`, or `dropEmpty`. */
    dropped: string[];
  };
}

/**
 * Apply a schema of rules to raw state and return the state to send to Jev.
 *
 * The input is never mutated. Every rule sees raw values, so a rule can read a sibling
 * (for example `maxHp`) even when another rule drops that sibling.
 */
export function project<T = Record<string, unknown>>(
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
  return { state, meta: { changed: [...env.changed], dropped: [...env.dropped] } };
}

/** Run a rule or nested schema against one value. Used by `project()`, `each()`, and `pipe()`. */
export function applyEntry(value: unknown, entry: Rule | Schema, ctx: RuleContext): unknown {
  if (typeof entry === "function") return entry(value, ctx);
  if (isPlainObject(value)) return applySchema(value, entry, ctx.path, ctx[ENV]);
  return value;
}

function applySchema(obj: Record<string, unknown>, schema: Schema, path: string, env: Env) {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(obj), ...Object.keys(schema)]);

  for (const key of keys) {
    const here = childPath(path, key);
    const had = Object.hasOwn(obj, key);
    const raw = obj[key];
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
    out[key] = value;
  }
  return out;
}

/** Remove empty fields from a value no rule touched. Array elements are kept so indexes don't shift. */
function clean(value: unknown, path: string, env: Env): unknown {
  if (Array.isArray(value)) return value.map((item) => clean(item, `${path}[]`, env));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const here = childPath(path, key);
    const cleaned = clean(child, here, env);
    if (cleaned === undefined || isEmpty(cleaned)) {
      env.dropped.add(here);
      continue;
    }
    out[key] = cleaned;
  }
  return out;
}
