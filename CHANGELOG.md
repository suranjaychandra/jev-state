# Changelog

All notable changes to jev-state. This project follows [semantic versioning](https://semver.org/).

## 0.1.2 (2026-10-12)

No breaking changes. State that worked in 0.1.1 produces the same output, except for the bug fixes below.

### Added
- `project(raw, schema, { strict: true })` checks that the finished state is plain JSON and throws a `TypeError` with the field path if it holds a `Date`, class instance, `NaN`, `Infinity`, an `undefined` array element, or a cycle. Off by default.

### Fixed
- **Quick start:** runs in CommonJS projects as well as ESM, and prints the real error if the Jev call fails. Tested in both formats without API calls.
- `band()` throws a clear `RangeError` when you create it with non-finite cuts, or with cuts outside `0` to `1` when `max` is set. Before, `band({ max: 100, cuts: [20, 50], ... })` silently gave every value the lowest label. With non-finite `min` or `max`, the value now passes through instead of getting a misleading label.
- `pick().resolve()` with `minConfidence` returns `null` when the confidence is missing or not a finite number. Before, `NaN` passed the threshold.
- `project()` keeps own fields named `__proto__` instead of silently dropping them, and a rule for a missing field such as `constructor` now receives `undefined` instead of a built-in function.
- `project()` no longer overflows the stack on circular input that no rule touches.
- The support-ticket recipe and playground label exactly 24 hours as `"1 to 24 hours"`, matching the policy's "more than 24 hours" rule.
- The playground ignores outdated responses after you change an input, preset, or domain.

### Docs
- Corrected the claim that rules always see raw values: inside `pipe()`, each stage sees the previous stage's output, and `ctx.root` is the original input. Added a tested example ([`examples/composition.ts`](examples/composition.ts)).
- New [docs/semantics.md](docs/semantics.md) with the details of `meta`, `dropEmpty`, `strict`, `band()` edge cases, pipelines, and which rules each demo uses.

### Development
- CI installs the packed package in fresh CommonJS and ESM projects (`npm run check:package`), and typechecks the playground.

## 0.1.1 (2026-10-10)

### Docs
- **Quick start:** raw state to a Jev decision in one file ([`examples/quickstart.ts`](examples/quickstart.ts)).
- **"Which rule should I use?"**: a table mapping kinds of state to `band()`, `count()`, `time()`, `prune()`, `pipe()`, and `pick()`.
- **Recipes** for a game NPC, a support ticket with derived fields, and agent tool choice with `pick()`, each a runnable file in [`examples/recipes/`](examples/recipes).
- **Debugging:** reading `meta.changed` and `meta.dropped`.
- Links to [two-bots-one-brain](https://github.com/suranjaychandra/two-bots-one-brain), a small game built on jev-state.

### Types
- `project()` now returns a JSON object type (`JsonObject`) by default instead of `Record<string, unknown>`, so `state` can be passed to `client.systemOne()` without a cast. Runtime behavior is unchanged.

### Tests
- README code blocks are checked against the runnable example files, so the docs can't drift from code that typechecks.

## 0.1.0 (2026-09-29)

First release.

- `project(raw, schema, options)` with `meta.changed` and `meta.dropped`.
- Rules: `band()`, `count()`, `time()`, `prune()`, `drop()`, `keep()`, `each()`, `pipe()`.
- `pick()` for choice questions that map answers back to the original items, with `minConfidence`.
- Benchmark: 70 seeded NPC scenarios × 3 reruns against `jev-1.13.0`. Accuracy went from 74.3% to 100%, and input tokens fell 43%.
