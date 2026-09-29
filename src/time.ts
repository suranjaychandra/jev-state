import { type Resolvable, type Rule, resolve } from "./rule.js";

export interface TimeOptions {
  /** The current time. Default: `Date.now()` when the rule runs. */
  now?: Resolvable<number | Date | string>;
  /** Unit for numeric timestamps. `"auto"` treats values below 1e11 as seconds. Default: `"auto"`. */
  unit?: "ms" | "s" | "auto";
  /** Custom wording. Receives `now - then` in milliseconds (negative for the future). */
  format?: (diffMs: number) => string;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const PAST: [number, string][] = [
  [10 * SECOND, "just now"],
  [MINUTE, "less than a minute ago"],
  [5 * MINUTE, "a few minutes ago"],
  [HOUR, "within the last hour"],
  [DAY, "within the last day"],
  [7 * DAY, "within the last week"],
  [30 * DAY, "within the last month"],
];
const FUTURE: [number, string][] = [
  [10 * SECOND, "any moment now"],
  [MINUTE, "in less than a minute"],
  [5 * MINUTE, "in a few minutes"],
  [HOUR, "within the next hour"],
  [DAY, "within the next day"],
  [7 * DAY, "within the next week"],
  [30 * DAY, "within the next month"],
];

/** Default wording for a time difference. */
export function relativeTime(diffMs: number): string {
  const table = diffMs >= 0 ? PAST : FUTURE;
  const abs = Math.abs(diffMs);
  for (const [limit, label] of table) if (abs < limit) return label;
  return diffMs >= 0 ? "more than a month ago" : "more than a month from now";
}

/**
 * Replace a timestamp (Date, ISO string, or epoch number) with relative wording such as
 * "a few minutes ago", since Jev is unreliable with raw and mixed-format dates.
 */
export function time(options: TimeOptions = {}): Rule {
  const unit = options.unit ?? "auto";
  const format = options.format ?? relativeTime;

  return (value, ctx) => {
    const then = toMs(value, unit);
    if (then === undefined) return value;
    const now = options.now === undefined ? Date.now() : toMs(resolve(options.now, ctx), unit);
    if (now === undefined) return value;
    return format(now - then);
  };
}

function toMs(value: unknown, unit: "ms" | "s" | "auto"): number | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.getTime();
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? undefined : t;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (unit === "s" || (unit === "auto" && Math.abs(value) < 1e11)) return value * 1000;
  return value;
}
