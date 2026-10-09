# Changelog

All notable changes to jev-state. This project follows [semantic versioning](https://semver.org/).

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
