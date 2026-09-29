import { type Resolvable, type Rule, resolve } from "./rule.js";

export interface BandOptions {
  /** Labels from lowest to highest. At least two. */
  labels: readonly string[];
  /** Bottom of the range. Default: 0. */
  min?: Resolvable<number>;
  /** Top of the range. May be read from a sibling, e.g. `(ctx) => ctx.parent.maxHp`. */
  max?: Resolvable<number>;
  /**
   * Boundaries between labels, ascending; one fewer than `labels`.
   * With `max`, these are fractions of the range (0.2 = 20%). Without `max`, they are raw values.
   * Omit to split `min`..`max` into equal bands.
   */
  cuts?: readonly number[];
}

/**
 * Replace a number with a label, since Jev reads numbers as text and can't compare them reliably.
 *
 * @example band({ max: (ctx) => ctx.parent.maxHp, cuts: [0.2, 0.5], labels: ["critical", "low", "healthy"] })
 * @example band({ cuts: [10, 30], labels: ["near", "medium", "far"] })
 */
export function band(options: BandOptions): Rule {
  const { labels, cuts } = options;
  if (labels.length < 2) throw new RangeError("band() needs at least two labels");
  if (cuts) {
    if (cuts.length !== labels.length - 1) {
      throw new RangeError(`band() got ${labels.length} labels, so it needs ${labels.length - 1} cuts, not ${cuts.length}`);
    }
    if (cuts.some((c, i) => i > 0 && c <= cuts[i - 1]!)) throw new RangeError("band() cuts must be strictly ascending");
  } else if (options.max === undefined) {
    throw new RangeError("band() needs either `max` or `cuts`");
  }

  return (value, ctx) => {
    if (typeof value !== "number" || Number.isNaN(value)) return value;

    let x = value;
    if (options.max !== undefined) {
      const min = resolve(options.min ?? 0, ctx);
      const max = resolve(options.max, ctx);
      if (typeof max !== "number" || !(max > min)) return value;
      x = Math.min(1, Math.max(0, (value - min) / (max - min)));
      if (!cuts) return labels[Math.min(Math.floor(x * labels.length), labels.length - 1)];
    }

    let i = 0;
    while (i < cuts!.length && x >= cuts![i]!) i++;
    return labels[i];
  };
}
