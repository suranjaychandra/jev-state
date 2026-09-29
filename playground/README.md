# jev-state Playground

Ask Jev the same question twice, side by side: once with raw state, once with state prepared by [jev-state](https://www.npmjs.com/package/jev-state). The questions, rules, and model are identical. Only the state format changes.

It covers two domains:

- **Game NPC:** what the NPC should do, based on health, ammo, medkits, enemy distances, and noise.
- **Support ticket:** a ticket's priority, based on order total, hours open, and contact count.

It uses the published `jev-state` package from npm, the same way any user would.

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

Every decision is also printed in the terminal. Your API key stays in the local server and is never sent to the browser. Each click makes two Jev calls of roughly 600-1,100 input tokens each.

`npm run start:mock` serves the page with random fake answers, for checking the layout without a key. The page shows a banner in mock mode.

## Scripts: six fixed situations, 3 runs each

```sh
npm run raw          # step 1: raw state
npm run jev-state    # step 2: with jev-state; writes results.md
```

Add `-- --dry` to print what would be sent without calling Jev.

## Files

- `project-state.ts`: the jev-state rules. This is the only code a jev-state user writes.
- `situations.ts`: the rules given to Jev, the raw-state builders, the correct-answer logic, and the six fixed situations.
- `server.ts`: the local server. It builds the state from the numbers the page sends, so it never forwards arbitrary text to Jev.
- `public/index.html`: the page.

This is an unofficial community tool. It is not affiliated with or endorsed by TypeSafe AI.
