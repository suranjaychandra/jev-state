import { type Resolvable, type Rule, resolve } from "./rule.js";

export interface BandOptions {
  /** Labels from lowest to highest. At least two. */
  labels: readonly string[];
  /** Finite bottom of the range. Default: 0. */
  min?: Resolvable<number>;
  /** Finite top of the range. May be read from a sibling, e.g. `(ctx) => ctx.parent.maxHp`. */
  max?: Resolvable<number>;
  /**
   * Finite boundaries between labels, strictly ascending; one fewer than `labels`.
   * With `max`, these must be fractions in [0, 1] (0.2 = 20%). Without `max`, they are raw values.
   * Omit to split `min`..`max` into equal bands.
   */
  cuts?: readonly number[];
}

/**
 * Replace a number with a label, since Jev reads numbers as text and can't compare them reliably.
 * NaN and non-numbers pass through unchanged; Infinity gets the top label and -Infinity the bottom one.
 * An invalid resolved range (non-finite bounds, or no positive finite width) leaves the value unchanged.
 * Invalid cuts throw a RangeError when creating the rule.
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
    for (const cut of cuts) {
      if (typeof cut !== "number" || !Number.isFinite(cut)) {
        throw new RangeError("band() cuts must be finite numbers");
      }
    }
    if (cuts.some((c, i) => i > 0 && c <= cuts[i - 1]!)) throw new RangeError("band() cuts must be strictly ascending");
    if (options.max !== undefined && cuts.some((cut) => cut < 0 || cut > 1)) {
      throw new RangeError("band() cuts must be between 0 and 1 when max is set");
    }
  } else if (options.max === undefined) {
    throw new RangeError("band() needs either `max` or `cuts`");
  }

  return (value, ctx) => {
    if (typeof value !== "number" || Number.isNaN(value)) return value;

    let x = value;
    if (options.max !== undefined) {
      const min = resolve(options.min ?? 0, ctx);
      const max = resolve(options.max, ctx);
      if (typeof min !== "number" || !Number.isFinite(min) ||
          typeof max !== "number" || !Number.isFinite(max)) return value;
      const width = max - min;
      if (!(width > 0) || !Number.isFinite(width)) return value;
      x = Math.min(1, Math.max(0, (value - min) / width));
      if (!cuts) return labels[Math.min(Math.floor(x * labels.length), labels.length - 1)];
    }

    let i = 0;
    while (i < cuts!.length && x >= cuts![i]!) i++;
    return labels[i];
  };
}
