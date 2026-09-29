import { type Rule, isPlainObject } from "./rule.js";

export interface PruneOptions<T = any> {
  /** Only these fields survive on each object. */
  keep?: readonly string[];
  /** These fields are removed from each object. */
  omit?: readonly string[];
  /** Arrays only: drop elements that fail this test. Runs first. */
  filter?: (item: T) => boolean;
  /** Arrays only: order elements before `max` applies. The input isn't mutated. */
  sortBy?: (a: T, b: T) => number;
  /** Arrays only: keep at most this many elements. */
  max?: number;
}

/**
 * Cut state down to what the question needs, since Jev gets worse as irrelevant state grows.
 * On an array it filters, sorts, and truncates, then prunes each object element.
 * On an object it prunes that object's fields.
 */
export function prune<T = any>(options: PruneOptions<T>): Rule {
  const { keep, omit, filter, sortBy, max } = options;
  if (keep && omit) throw new TypeError("prune() takes `keep` or `omit`, not both");
  if (max !== undefined && !(Number.isInteger(max) && max >= 0)) throw new RangeError("prune() max must be a whole number >= 0");

  const fields = (obj: Record<string, unknown>) => {
    if (keep) return Object.fromEntries(keep.filter((k) => Object.hasOwn(obj, k)).map((k) => [k, obj[k]]));
    if (omit) return Object.fromEntries(Object.entries(obj).filter(([k]) => !omit.includes(k)));
    return obj;
  };

  return (value) => {
    if (Array.isArray(value)) {
      let items = filter ? value.filter(filter) : [...value];
      if (sortBy) items.sort(sortBy);
      if (max !== undefined) items = items.slice(0, max);
      return items.map((item) => (isPlainObject(item) ? fields(item) : item));
    }
    if (isPlainObject(value)) return fields(value);
    return value;
  };
}
