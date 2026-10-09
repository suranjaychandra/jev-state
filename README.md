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

## Quick start

```sh
npm install jev-state @typesafe-ai/sdk
export TYPESAFE_API_KEY=your-key   # from TypeSafe
```

Save this as `quickstart.ts` and run it with `npx tsx quickstart.ts`:

<!-- example: examples/quickstart.ts -->
```ts
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { band, count, project, time } from "jev-state";

// 1. The state your app already has: exact numbers, epoch times, extra fields.
const now = Date.now();
const raw = {
  hp: 38,
  maxHp: 250,
  enemies: [{ distance: 7.9 }, { distance: 45 }],
  lastNoiseAt: now - 20_000,
  debug: { frameMs: 11.2, drawCalls: 1432 },
};

// 2. Describe it once. You choose the thresholds; jev-state applies them.
const { state } = project(
  raw,
  {
    hp: band({ max: (ctx) => ctx.parent.maxHp, cuts: [0.2, 0.5], labels: ["critical", "low", "healthy"] }),
    enemies: count(),
    lastNoiseAt: time({ now }),
  },
  { unknown: "drop" },
);
console.log(state);
// { hp: "critical", enemies: "a few", lastNoiseAt: "less than a minute ago" }

// 3. Ask Jev as usual. TypeSafeClient reads TYPESAFE_API_KEY from the environment.
const client = new TypeSafeClient();
const { answers } = await client.systemOne({
  state,
  questions: {
    action: choice("What should the NPC do next?", {
      retreat: "Health is critical and enemies are around.",
      attack: "Health is fine and enemies are around.",
      patrol: "No enemies are around.",
    }),
  },
});
console.log(answers.action.choice, answers.action.confidence);
// retreat 1
```

`project()` returns plain JSON, so `state` goes straight into `client.systemOne()`.

## Which rule should I use?

| Your state has… | Use | Example |
|---|---|---|
| A number whose meaning depends on a range (health, price, score, distance) | `band()` | `hp: 38` of 250 → `"critical"` |
| A list or a count | `count()` | `[3 contacts]` → `"3 or more times"` |
| A timestamp or date | `time()` | `1790678485386` → `"less than a minute ago"` |
| Fields the decision doesn't need (ids, positions, debug data) | `prune()`, `drop()`, or `unknown: "drop"` | `meshId`, `position` → removed |
| A value computed from several fields | `pipe()` with your own function first | cents + hours open → `"$500 or more"`, `"more than 24 hours"` |
| A list Jev should choose from | `pick()` | three tools → `"refund_order"`, mapped back to the tool object |

You choose the thresholds; jev-state applies them the same way on every call.

## Recipes

Each recipe is a runnable file in [`examples/recipes/`](examples/recipes).

### Game NPC

<!-- example: examples/recipes/game-npc.ts -->
```ts
import { band, count, each, pipe, project, prune, time } from "jev-state";

const now = Date.now();
const raw = {
  npc: { hp: 90, maxHp: 500, ammo: 3, medkits: 1, meshId: "soldier_2", position: { x: 12.4, y: 0, z: -88.1 } },
  enemies: [
    { id: "e1", type: "sniper", distance: 62.4, velocity: { x: 0, z: 0.1 } },
    { id: "e2", type: "rifleman", distance: 7.9, velocity: { x: 1.2, z: -0.4 } },
  ],
  lastNoiseAt: now - 4_000,
};

const { state } = project(
  raw,
  {
    npc: {
      // A fraction of each NPC's own max health: 90 of 500 is 18%, so "critical".
      hp: band({ max: (ctx) => ctx.parent.maxHp, cuts: [0.2, 0.5], labels: ["critical", "low", "healthy"] }),
      ammo: count({ few: 5, many: 15 }),
      medkits: count(),
    },
    // Nearest first, at most five, only the fields the decision needs.
    enemies: pipe(
      prune({ keep: ["type", "distance"], sortBy: (a, b) => a.distance - b.distance, max: 5 }),
      each({ distance: band({ cuts: [10, 30], labels: ["near", "medium", "far"] }) }),
    ),
    lastNoiseAt: time({ now }),
  },
  { unknown: "drop" },
);

console.log(state);
// {
//   npc: { hp: "critical", ammo: "a few", medkits: "one" },
//   enemies: [{ type: "rifleman", distance: "near" }, { type: "sniper", distance: "far" }],
//   lastNoiseAt: "just now"
// }
```

### Support ticket, with derived fields

<!-- example: examples/recipes/support-ticket.ts -->
```ts
import { band, count, pipe, project } from "jev-state";

const HOUR = 3_600_000;
const raw = {
  ticket: { id: "T-48213", createdAt: "2026-10-09T06:00:00Z", internalRef: "zd_99812" },
  order: { id: "ORD-7731", totalCents: 64_900, currency: "USD", warehouse: "SFO-2" },
  contacts: [{ channel: "email" }, { channel: "chat" }, { channel: "email" }],
  now: "2026-10-10T12:00:00Z",
};

const { state } = project(
  raw,
  {
    // Derived fields: a rule keyed on a name the input doesn't have adds that field.
    orderTotal: pipe(
      (_, ctx) => ctx.root.order.totalCents,
      band({ cuts: [50_000], labels: ["under $500", "$500 or more"] }),
    ),
    waiting: pipe(
      (_, ctx) => (Date.parse(ctx.root.now) - Date.parse(ctx.root.ticket.createdAt)) / HOUR,
      band({ cuts: [1, 24], labels: ["under an hour", "a few hours", "more than 24 hours"] }),
    ),
    contacts: count({ few: 2, many: 3, labels: { none: "0 times", one: "once", few: "twice", many: "3 or more times" } }),
  },
  { unknown: "drop" },
);

console.log(state);
// { contacts: "3 or more times", orderTotal: "$500 or more", waiting: "more than 24 hours" }
```

### Agent tool choice with `pick()`

<!-- example: examples/recipes/agent-pick.ts -->
```ts
import { pick } from "jev-state";

const tools = [
  { name: "search_docs", description: "Answer a how-to question from the product docs." },
  { name: "refund_order", description: "Refund an order that was charged twice or never arrived." },
  { name: "escalate", description: "Hand off to a human for anything legal, security, or account access." },
];

// A choice question with one option per tool, plus "none of these".
const route = pick("Which tool should handle this request?", tools, {
  label: (t) => t.name,
  describe: (t) => t.description,
  none: "None of these tools fit; reply directly.",
});

// Send route.question to Jev:
//   const { answers } = await client.systemOne({ state: request, questions: { tool: route.question } });
// then map the answer back to the original tool, or null below 60% confidence:
const answer = { choice: "refund_order", confidence: 0.93 }; // stands in for answers.tool
const tool = route.resolve(answer, { minConfidence: 0.6 });

console.log(tool?.name ?? "fallback");
// refund_order
```

## Debugging: what changed?

`project()` also returns `meta`, the paths it rewrote and removed. For the quick start above:

```ts
const { state, meta } = project(raw, schema, { unknown: "drop" });
console.log(meta.changed); // ["hp", "enemies", "lastNoiseAt"]
console.log(meta.dropped); // ["maxHp", "debug"]
```

If a field you need is in `dropped`, add it to the schema (use `keep()` to pass it through unchanged).

## Try it: Playground

[`playground/`](playground) is a local web app that asks Jev the same question twice, side by side: once with raw state, once through jev-state. It covers game NPC decisions and support-ticket priority. Set the numbers yourself and watch the answers, confidence, and tokens change.

```sh
cd playground
npm install
cp .env.example .env    # add your TYPESAFE_API_KEY
npm start               # http://localhost:3000
```

Your key stays in the local server. See [`playground/README.md`](playground/README.md) for details.

## See it in a game: Two Bots, One Brain

[**two-bots-one-brain**](https://github.com/suranjaychandra/two-bots-one-brain) is a small browser game built on jev-state. Two bots share one brain (Jev) and the same rules. One sends its raw game state, the other sends it through `project()`. You fight both at once, and a live meter counts each bot's wrong decisions by the rules.

[![Two Bots, One Brain: raw bot vs jev-state bot, with a live mistakes meter](https://raw.githubusercontent.com/suranjaychandra/two-bots-one-brain/main/docs/gameplay.png)](https://github.com/suranjaychandra/two-bots-one-brain)

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
npm run quickstart  # the quick start; needs TYPESAFE_API_KEY in .env
npm run example   # one NPC decision; calls Jev if TYPESAFE_API_KEY is set
npm run compare   # one situation sent as raw state and as jev-state; edit the numbers in examples/compare.ts
```

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, guidelines, and roadmap ideas.

## License

[MIT](LICENSE) © 2026 Suranjay Kumar
