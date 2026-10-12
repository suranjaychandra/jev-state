# jev-state Playground

Ask Jev the same question twice, side by side: once with raw state, once with state prepared by [jev-state](https://www.npmjs.com/package/jev-state). The questions, rules, and model are identical. Only the state format changes.

It covers two domains:

- **Game NPC:** what the NPC should do, based on health, ammo, medkits, enemy distances, and noise.
- **Support ticket:** a ticket's priority, based on order total, hours open, and contact count.

It uses the published `jev-state` package from npm, the same way any user would.

## Which rules apply here?

The Game NPC domain uses five actions, in priority order: `retreat`, `heal`, `attack`, `investigate`, `patrol`. Retreat requires health below 20% and an enemy closer than 10 m. The full instructions and matching local policy are in [`situations.ts`](situations.ts); the page also shows them under its rules control.

This differs from the library's seven-action benchmark, which also has `take_cover` and `reload`, and from Two Bots, One Brain, where critical health plus any visible enemy triggers retreat. For example, health `15/100`, ammo `10`, one medkit, an enemy at `25 m`, and no noise means `heal` here but `retreat` in the game. These are expected answers from local policies, not measured model responses.

The support-ticket domain uses its own four priorities: `urgent`, `high`, `normal`, `low`. Compare raw and projected answers against the current domain's rules. Benchmark accuracy is not a guarantee for this playground. See the [policy comparison](../docs/semantics.md#which-demo-rules-apply) for all three NPC policies.

## Run it with your own key

You need Node.js 22+ and a [TypeSafe](https://typesafe.ai) API key.

```sh
git clone https://github.com/suranjaychandra/jev-state.git
cd jev-state/playground
npm install
cp .env.example .env     # paste your TYPESAFE_API_KEY into .env and save
npm start
```

Open http://localhost:3000. Pick a preset or set your own values, then press **ASK JEV** (or Cmd+Enter). The page shows:

- **RAW_STATE.json:** Jev's decision on the state your app already has.
- **JEV_STATE.json:** Jev's decision on the same state after `project()`.
- The correct answer by the rules, the confidence, every option's probability, tokens, and latency.
- A running score for the session.

If you change a field, preset, or domain while a request is running, its outdated response will not replace the current preview or decisions. The browser score counts only decisions accepted for the current inputs when they arrive. The ask button becomes available again when the pending decision request finishes. Already sent server requests still complete, may consume API usage, and appear in the terminal log even when the browser ignores their responses.

Every decision is also printed in the terminal. Your API key stays in the local server and is never sent to the browser. Each click makes two Jev calls of roughly 600-1,100 input tokens each.

`npm run start:mock` serves the page with random fake answers, for checking the layout without a key. The page shows a banner in mock mode.

## Scripts: six fixed situations, 3 runs each

```sh
npm run raw          # step 1: raw state
npm run jev-state    # step 2: with jev-state; writes results.md
```

Add `-- --dry` to print what would be sent without calling Jev.

## Files

Request-ordering regression tests run with `npm test` from the repository root. They execute the page's script with controlled responses and a minimal DOM, without an API key or network calls; they do not test browser layout.

From the repository root, `npm run typecheck` checks all playground TypeScript files alongside the library. Install dependencies in both the root and playground first. This check also runs in CI and does not call Jev or read an API key. It does not typecheck the inline browser JavaScript in `public/index.html`.

- `project-state.ts`: the jev-state rules. This is the only code a jev-state user writes.
- `situations.ts`: the rules given to Jev, the raw-state builders, the correct-answer logic, and the six fixed situations.
- `server.ts`: the local server. It builds the state from the numbers the page sends, so it never forwards arbitrary text to Jev.
- `public/index.html`: the page.

This is an unofficial community tool. It is not affiliated with or endorsed by TypeSafe AI.
