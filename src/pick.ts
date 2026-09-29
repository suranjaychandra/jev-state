import type { EntryType } from "./rule.js";

/** Criteria id used for the "none of these" option. */
export const NONE_ID = "none_of_these";

/** Jev's limit on options in one choice question. */
export const MAX_OPTIONS = 255;

export interface PickOptions<T> {
  /** Short name for an item. Becomes its option id after slugging, e.g. "Goblin Archer" -> "goblin_archer". */
  label: (item: T, index: number) => string;
  /** What Jev reads about this option. Default: none (Jev sees only the id). */
  describe?: (item: T, index: number) => EntryType;
  /** Description of the extra "none of these" option, or `false` to leave it out. */
  none?: string | false;
}

/** A choice question shaped like the SDK's `choice()` output. */
export interface PickQuestion {
  type: "choice";
  instructions: EntryType;
  criteria: Record<string, EntryType>;
}

/** The fields of a Jev choice answer that `resolve()` reads. */
export interface ChoiceAnswer {
  choice: string;
  confidence?: number;
}

export interface Pick<T> {
  /** Put this in `questions` for `client.systemOne()`. */
  question: PickQuestion;
  /** Option ids in item order. */
  ids: string[];
  /** Map an option id back to its item. */
  byId: ReadonlyMap<string, T>;
  /**
   * Map Jev's answer back to the original item. Returns `null` for "none of these",
   * an unknown id, or confidence below `minConfidence`.
   */
  resolve(answer: ChoiceAnswer | string, options?: { minConfidence?: number }): T | null;
}

/**
 * Turn a list of candidates into a Jev choice question and map the answer back to the item.
 * Asking "which of these is it?" works better with Jev than asking it to extract a value.
 *
 * @example
 * const target = pick("Which enemy should be attacked first?", enemies, {
 *   label: (e) => e.name,
 *   describe: (e) => `${e.type}, ${e.distance}`,
 * });
 * const { answers } = await client.systemOne({ state, questions: { target: target.question } });
 * const enemy = target.resolve(answers.target, { minConfidence: 0.6 });
 */
export function pick<T>(instructions: EntryType, items: readonly T[], options: PickOptions<T>): Pick<T> {
  const none = options.none ?? "None of the listed options fit.";
  const total = items.length + (none === false ? 0 : 1);
  if (total < 2) throw new RangeError("pick() needs at least two options; add items or keep the `none` option");
  if (total > MAX_OPTIONS) {
    throw new RangeError(`pick() got ${total} options but Jev allows ${MAX_OPTIONS}; prune the list first`);
  }

  const criteria: Record<string, EntryType> = {};
  const byId = new Map<string, T>();
  const ids: string[] = [];
  const taken = new Set<string>(none === false ? [] : [NONE_ID]);

  items.forEach((item, i) => {
    const base = slug(options.label(item, i));
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
    taken.add(id);
    ids.push(id);
    byId.set(id, item);
    criteria[id] = options.describe ? options.describe(item, i) : null;
  });
  if (none !== false) criteria[NONE_ID] = none;

  return {
    question: { type: "choice", instructions, criteria },
    ids,
    byId,
    resolve(answer, opts = {}) {
      const id = typeof answer === "string" ? answer : answer.choice;
      if (typeof answer !== "string" && opts.minConfidence !== undefined) {
        if (answer.confidence === undefined || answer.confidence < opts.minConfidence) return null;
      }
      return byId.get(id) ?? null;
    },
  };
}

function slug(text: string): string {
  const s = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)
    .replace(/_+$/, "");
  return s || "option";
}
