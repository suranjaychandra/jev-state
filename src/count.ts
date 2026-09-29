import type { Rule } from "./rule.js";

export interface CountOptions {
  /** Largest count still called "a few". Default: 3. */
  few?: number;
  /** Smallest count called "many". Default: 10. */
  many?: number;
  labels?: {
    none?: string;
    one?: string;
    few?: string;
    several?: string;
    many?: string;
  };
}

/**
 * Replace a number or an array with how many there are, in words, since Jev can't count.
 * Default labels: none, one, a few (2..few), several, many (many+).
 */
export function count(options: CountOptions = {}): Rule {
  const few = options.few ?? 3;
  const many = options.many ?? 10;
  if (!(few >= 2 && many > few)) throw new RangeError("count() needs 2 <= few < many");
  const l = { none: "none", one: "one", few: "a few", several: "several", many: "many", ...options.labels };

  return (value) => {
    const n = Array.isArray(value) ? value.length : value;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return value;
    if (n === 0) return l.none;
    if (n === 1) return l.one;
    if (n <= few) return l.few;
    if (n < many) return l.several;
    return l.many;
  };
}
