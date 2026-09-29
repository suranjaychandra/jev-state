# jev-state

[![CI](https://github.com/suranjaychandra/jev-state/actions/workflows/ci.yml/badge.svg)](https://github.com/suranjaychandra/jev-state/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Turn raw app and game state into state that [Jev](https://typesafe.ai) reads well.

Jev, TypeSafe AI's System One model, is fast and cheap, and its answers always match the types you ask for. It also has documented weak spots:

- It reads numbers as text, so it can't compare or divide them reliably.
- It can't count.
- It struggles with mixed-format and relative dates.
- Its accuracy drops as irrelevant state piles up.

`jev-state` handles those parts in plain code before the state reaches Jev:

```ts
import { band, count, each, pipe, project, prune, time } from "jev-state";

const { state } = project(
  gameState,
  {
    npc: {
      hp: band({ max: (ctx) => ctx.parent.maxHp, cuts: [0.2, 0.5], labels: ["critical", "low", "healthy"] }),
      ammo: count({ few: 5, many: 15 }),
    },
    enemies: pipe(
      prune({ keep: ["type", "distance"], sortBy: (a, b) => a.distance - b.distance, max: 5 }),
      each({ distance: band({ cuts: [10, 30], labels: ["near", "medium", "far"] }) }),
    ),
    lastNoiseAt: time({ now: Date.now() }),
  },
  { unknown: "drop" },
);
```

```jsonc
// before: 1,700 characters of positions, mesh ids, debug counters, raw numbers and epoch timestamps
// after:
{
  "npc": { "hp": "critical", "ammo": "several" },
  "enemies": [{ "type": "rifleman", "distance": "near" }, { "type": "sniper", "distance": "far" }],
  "lastNoiseAt": "less than a minute ago"
}
```

The library never calls the API and has no runtime dependencies. Pass `state` to [`@typesafe-ai/sdk`](https://www.npmjs.com/package/@typesafe-ai/sdk) as usual.

## Install

```sh
npm install jev-state
```

Node.js 22+. Ships ESM, CommonJS, and TypeScript types.

## `project(raw, schema, options?)`

Returns `{ state, meta }`. `meta.changed` and `meta.dropped` list the paths that were rewritten or removed.

- A **schema** maps field names to rules. Nest objects to reach nested fields.
- Rules always see **raw** values, so `hp` can read `maxHp` even if another rule drops `maxHp`.
- A rule keyed on a field the input lacks adds a **derived field**: `{ nearest: (_, ctx) => ... }`.
- The input is never mutated.

| Option | Default | |
|---|---|---|
| `unknown` | `"keep"` | `"drop"` removes every field of the raw input that the schema doesn't name. Schemas inside `each()` and `pipe()` keep unnamed fields; trim those with `prune()`. |
| `dropEmpty` | `true` | Removes `null`, `""`, `[]`, and `{}` values. |

## Rules

### `band({ labels, max?, min?, cuts? })`: numbers to labels
- `band({ max: 100, labels: ["low", "mid", "high"] })` splits `min`..`max` into equal bands.
- `band({ max: (ctx) => ctx.parent.maxHp, cuts: [0.2, 0.5], labels })`: with `max`, `cuts` are fractions of the range.
- `band({ cuts: [10, 30], labels: ["near", "medium", "far"] })`: without `max`, `cuts` are raw values.

### `count({ few?, many?, labels? })`: numbers or arrays to how many
Returns `none` / `one` / `a few` / `several` / `many`. The defaults are `few: 3` and `many: 10`.

### `time({ now?, unit?, format? })`: timestamps to relative time
Accepts `Date` objects, ISO strings, and epoch milliseconds or seconds. Returns labels like `just now`, `a few minutes ago`, `within the last week` or `in a few minutes`. `now` can be read from state: `time({ now: (ctx) => ctx.root.clock })`.

### `prune({ keep?, omit?, filter?, sortBy?, max? })`: less state
On arrays it filters, then sorts (without mutating), then caps with `max`, then trims each object's fields. On objects it trims fields.

### `drop()`, `keep()`, `each(ruleOrSchema)`, `pipe(...rules)`
- `drop()` removes a field.
- `keep()` passes a field through when `unknown` is `"drop"`.
- `each()` maps over an array.
- `pipe()` chains rules.
- Any function `(value, ctx) => newValue` is a rule. Return `DROP` to remove the field.

## `pick(instructions, items, { label, describe?, none? })`

Jev works better when asked "which of these is it?" than when asked to extract a value. `pick` turns a list into a choice question and maps the answer back to the original item:

```ts
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { pick } from "jev-state";

const target = pick("Which enemy should be attacked first?", enemies, {
  label: (e) => e.name,                    // becomes a stable option id, e.g. "goblin_archer"
  describe: (e) => `${e.type}, ${e.distance}`,
});

const { answers } = await new TypeSafeClient().systemOne({ state, questions: { target: target.question } });
const enemy = target.resolve(answers.target, { minConfidence: 0.6 }); // the original object, or null
```

- `pick` adds a `none_of_these` option by default. Reword it with `none: "Hold fire"` or leave it out with `none: false`.
- Duplicate labels get `_2`, `_3` suffixes.
- It throws if there are fewer than 2 options or more than Jev's 255.

## Benchmark

`bench/` sends 70 seeded NPC scenarios to the real Jev API twice: once as raw state, once through `jev-state`. The instructions and options are the same both times. Both are graded against the rules Jev was given.

On `jev-1.13.0` (2026-09-29): 420 calls, 0 errors, $0.017 total.

| | Raw state | jev-state |
|---|---|---|
| Accuracy | 74.3% | **100.0%** |
| Scenarios whose answer changed across 3 reruns | 6 / 70 | **0 / 70** |
| Avg input tokens | 1,236 | **699** (−43%) |
| p50 / p95 latency | 336 / 422 ms | 335 / 390 ms |

With raw state, accuracy fell furthest on the rules that need arithmetic: `retreat` got 50% (compare hp to 20% of maxHp) and `patrol` got 43% (decide whether a noise was under a minute old). Details and per-action numbers are in [`bench/results.md`](bench/results.md). Every individual answer is in [`bench/results.json`](bench/results.json).

**What this does and doesn't show.** jev-state does the arithmetic in code, so the projected state already says `"critical"` where the raw state says `hp: 38, maxHp: 250`. The benchmark measures what that buys you end to end on the same instructions. It does not show that Jev reasons better in general. It also has limits: one domain, synthetic scenarios, and a policy written for this test.

One more finding: on raw state, Jev's confidence was well calibrated. Answers it rated 70–90% were right 81% of the time (average confidence 82%). That makes `minConfidence` thresholds a reasonable fallback signal.

Reproduce it:

```sh
cp .env.example .env    # add TYPESAFE_API_KEY
npm run bench           # or: npm run bench -- --per-action 2 --reruns 1
```

## Development

```sh
npm install
npm test          # unit tests, no network
npm run typecheck
npm run build
npm run example   # one NPC decision; calls Jev if TYPESAFE_API_KEY is set
npm run compare   # one situation sent as raw state and as jev-state; edit the numbers in examples/compare.ts
```

## License

[MIT](LICENSE) © 2026 Suranjay Kumar
