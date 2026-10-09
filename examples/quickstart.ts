import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { band, count, project, time } from "../src/index.js";

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
