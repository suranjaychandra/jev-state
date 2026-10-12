# jev-state: detailed behavior

The [README](../README.md) covers everyday use. This page explains the edge cases.

## `meta.changed` and `meta.dropped`

`meta` summarizes what the schema did. It is not a complete diff of input and output.

| Metadata | What it records | Limits |
|---|---|---|
| `changed` | A schema field whose function rule returned a different value or object reference, excluding `DROP` and `undefined`. | A new object counts as changed even if its contents are equal. Cleanup alone doesn't add entries. |
| `dropped` | Fields removed by the schema, by `unknown: "drop"`, by a rule returning `DROP` or `undefined`, or by `dropEmpty`. | Fields removed inside `prune()` or your own rules, and array elements removed by `each()`, are not listed one by one. |

Paths are deduplicated, and array elements share a `[]` path such as `enemies[].distance`. A path can appear in both lists, for example when a rule returns an empty array and `dropEmpty` then removes the field.

For example, `prune()` removes `debug` here, and `meta` records only that `profile` changed:

```ts
import { project, prune } from "jev-state";

const { state, meta } = project(
  { profile: { name: "Rex", note: null, debug: true } },
  { profile: prune({ keep: ["name", "note"] }) },
);
console.log(state);        // { profile: { name: "Rex", note: null } }
console.log(meta.changed); // ["profile"]
console.log(meta.dropped); // []
```

To find out why a field is missing:

- Removed by `unknown: "drop"`: name it in the schema, with `keep()` if it should pass through unchanged.
- Removed by `dropEmpty` because it was empty: `keep()` alone won't help; set `dropEmpty: false`.
- Removed by `prune()`: change that rule's `keep`, `omit`, or array options.

## `dropEmpty`

`dropEmpty` (default `true`) is not one final recursive pass over the output:

- A schema field that ends as `null`, `""`, `[]`, or `{}` is removed, including a field using `keep()`.
- A field no rule touches (kept by `unknown: "keep"`) is cleaned recursively. Empty properties are removed, including inside array elements. Array elements themselves stay in place so indexes don't shift.
- An object or array returned by a function rule is not cleaned inside. This includes `keep()`, `prune()`, and your own functions. In the example above, `note: null` survives because it is inside the object `prune()` returned.
- To clean inside an object on purpose, give it a nested schema such as `profile: {}`, or `items: each({})` for objects in an array.
- With `dropEmpty: false`, a field rule returning `DROP` or `undefined` still removes that field.

## `strict`

With `project(raw, schema, { strict: true })`, the finished state is checked before it is returned. It must contain only strings, booleans, finite numbers, `null`, arrays, and plain objects. Otherwise `project()` throws a `TypeError` with the path, such as `$["items"][0]["id"]`. The message doesn't include the value itself.

It rejects `BigInt`, `Date`, `Map`, `Set`, class instances, functions, symbols, `NaN` and `Infinity`, `undefined` array elements or holes, custom `toJSON()` methods, and circular references.

`strict` is off by default, so state that worked in 0.1.1 keeps working. Without it, `JSON.stringify` decides what Jev receives: a `Date` becomes a string, `NaN` and `Infinity` become `null`, and a cycle throws when the request is sent.

Only the finished state is checked. Raw input and values between `pipe()` stages may hold any type, so you can convert them in your schema: `id: (value) => String(value)` for a `BigInt`, or `createdAt: time()` for a date.

## `band()` edge cases

- Cuts must be finite and strictly ascending, one fewer than labels. With `max`, they must be between `0` and `1`. Invalid cuts throw a `RangeError` when you create the rule.
- A value exactly on a cut gets the higher label.
- `NaN` and non-numbers pass through unchanged. `Infinity` gets the top label and `-Infinity` the bottom one.
- With `max`, the resolved `min` and `max` must be finite with a positive difference. Otherwise the value passes through unchanged rather than getting a misleading label.

## Pipelines and `ctx`

| What a rule reads | Meaning |
|---|---|
| `value` | The input to this rule; inside `pipe()`, the previous stage's output. |
| `ctx.parent` | The object or array holding this field or element. A nested schema sees its current input object; an `each()` callback sees its current input array. |
| `ctx.root` | The original object passed to `project()`, including fields an earlier stage removed. |

Rules in the same schema read the same input object, so one rule can read a sibling another rule drops. A schema inside `pipe()` reads the previous stage's output instead.

After sorting or filtering an array, `each()` uses the current index, not the original one. Don't use the index to look up the original item; calculate before removing fields, or keep a stable id. See [`examples/composition.ts`](../examples/composition.ts) for both ways to read `maxHp` after `prune()`.

## `pick().resolve()` and `minConfidence`

- The threshold applies only when you pass the full answer object (`answers.target`). A string id is mapped without checking confidence.
- A missing or non-finite confidence counts as below the threshold and returns `null`.
- An answer exactly at the threshold is accepted.

## Which demo rules apply?

The library transforms state; it doesn't define one NPC policy. The benchmark, the playground, and the game each use their own rules, and raw and projected state are judged against those rules.

| Comparison | Actions, in priority order | Retreat when | Policy source |
|---|---|---|---|
| Seeded NPC benchmark | 7: retreat, take_cover, heal, reload, attack, investigate, patrol | Health below 20% and an enemy **near** (under 10 m) | [`bench/scenarios.ts`](../bench/scenarios.ts) |
| Playground Game NPC | 5: retreat, heal, attack, investigate, patrol | Health below 20% and an enemy **near** (under 10 m) | [`playground/situations.ts`](../playground/situations.ts) |
| Two Bots, One Brain | 5: retreat, heal, attack, investigate, patrol | Health below 20% and any enemy **visible** | [`brain.ts`](https://github.com/suranjaychandra/two-bots-one-brain/blob/main/brain.ts) |

For example, with health `15/100`, ammo `10`, one medkit, one enemy at `25 m`, and no noise, the benchmark and playground expect `heal`, while the game expects `retreat`.

The benchmark's accuracy numbers apply to its seven-action evaluation only, not to the interactive demos. The playground's support-ticket domain has its own four priorities: `urgent`, `high`, `normal`, `low`.
