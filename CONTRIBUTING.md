# Contributing to jev-state

Thanks for your interest. Bug reports, ideas, docs fixes, new rules, and benchmarks are all welcome, whatever your experience level.

## Ways to help

- **Report a bug or ask a question:** [open an issue](https://github.com/suranjaychandra/jev-state/issues). Include the raw state, the schema you used, what you expected, and what you got.
- **Improve the docs:** clearer README wording, more examples, typo fixes.
- **Add a playground preset or domain:** a new situation in [`playground/`](playground) that shows where jev-state helps.
- **Pick an idea from the roadmap** below and open an issue to say you're working on it.

## Roadmap ideas

| Idea | Size |
|---|---|
| `duration()` rule: durations to words ("2 hours left", "30 seconds") | Small |
| `map()` rule: codes and enums to words (`status: 3` -> `"shipped"`) | Small |
| Clearer error messages for invalid schemas | Small |
| A second benchmark domain, such as support tickets or orders | Medium |
| A benchmark against an LLM baseline (accuracy, latency, cost) | Medium |
| A Python port with the same API and benchmark | Large |

## Setup

You need Node.js 22 or newer.

```sh
git clone https://github.com/suranjaychandra/jev-state.git
cd jev-state
npm install
npm test            # unit tests, no network, no API key
npm run typecheck
npm run build
```

The library itself never calls the Jev API, so you don't need a key for library work. You only need a [TypeSafe](https://typesafe.ai) key for `npm run example`, `npm run compare`, `npm run bench`, and the playground. Put it in a `.env` file (copy `.env.example`). `.env` is git-ignored. Never commit a key.

## Project layout

| Path | What it is |
|---|---|
| `src/` | The library. One file per rule (`band.ts`, `count.ts`, `time.ts`, `prune.ts`, `pick.ts`), plus `project.ts` and `compose.ts` |
| `test/` | Unit tests (Vitest) |
| `bench/` | The benchmark: seeded scenarios, and a runner that calls the real API |
| `examples/` | Small runnable examples |
| `playground/` | A local web app that compares raw state and jev-state side by side |

## Guidelines

- **Keep the library dependency-free at runtime.** It only transforms data.
- **Every new rule needs tests,** including edge cases: `null`, wrong types, boundaries, and bad options.
- **Rules must not mutate input,** and should leave values they don't understand unchanged.
- **Keep the API small and consistent** with the existing rules. Options objects, clear defaults, and a `RangeError` for invalid options.
- **Update the README** when you add or change public API.
- **Benchmarks must be reproducible:** seeded data, the same instructions for every variant, and results reported as measured.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Make your change with tests.
3. Run `npm test`, `npm run typecheck`, and `npm run build` locally.
4. Open a pull request that explains what changed and why. CI runs the same checks on Node 22, 24, and 26.
5. Keep each pull request focused on one change.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

## Contact

Suranjay Kumar: [cssuranjaykumar@gmail.com](mailto:cssuranjaykumar@gmail.com), or open an issue on GitHub.

jev-state is an unofficial community project. It is not affiliated with or endorsed by TypeSafe AI.
