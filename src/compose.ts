import { applyEntry } from "./project.js";
import { DROP, ENV, type Rule, type RuleContext, type Schema, childPath } from "./rule.js";

/** Remove the field. */
export const drop = (): Rule => () => DROP;

/** Keep the raw value unchanged. Useful with `unknown: "drop"` to allow a field through. */
export const keep = (): Rule => (value) => value;

/**
 * Schemas inside `each()` and `pipe()` keep fields they don't name, even under `unknown: "drop"`,
 * because they run on values a rule already chose. Trim those with `prune()`.
 */
const keepUnknown = (ctx: RuleContext): RuleContext => ({ ...ctx, [ENV]: { ...ctx[ENV], unknown: "keep" } });

/**
 * Apply a rule or schema to every element of an array.
 * Elements that come back as `DROP` or `undefined` are removed.
 */
export const each =
  (entry: Rule | Schema): Rule =>
  (value, outer) => {
    if (!Array.isArray(value)) return value;
    const ctx = keepUnknown(outer);
    const out: unknown[] = [];
    value.forEach((item, i) => {
      const itemCtx: RuleContext = {
        root: ctx.root,
        parent: value,
        key: i,
        path: childPath(ctx.path, i),
        [ENV]: ctx[ENV],
      };
      const result = applyEntry(item, entry, itemCtx);
      if (result !== DROP && result !== undefined) out.push(result);
    });
    return out;
  };

/** Run rules left to right, each on the previous one's output. Stops at `DROP`. */
export const pipe =
  (...entries: (Rule | Schema)[]): Rule =>
  (value, outer) => {
    const ctx = keepUnknown(outer);
    let current: unknown = value;
    for (const [i, entry] of entries.entries()) {
      if (i > 0 && (current === DROP || current === undefined)) return current;
      current = applyEntry(current, entry, ctx);
    }
    return current;
  };
