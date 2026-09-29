/**
 * One NPC decision with jev-state: project the raw state, ask Jev for an action and a target.
 *
 *   npm run example
 */
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { band, count, each, pick, pipe, project, prune, time } from "../src/index.js";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {}

const now = Date.now();
const raw = {
  npc: { hp: 38, maxHp: 250, ammo: 14, medkits: 1, meshId: "soldier_03", lodLevel: 2 },
  enemies: [
    { id: "e1", type: "sniper", distance: 62.4, hp: 80, velocity: { x: 0, y: 0, z: 0.1 } },
    { id: "e2", type: "rifleman", distance: 7.9, hp: 20, velocity: { x: 1.2, y: 0, z: -0.4 } },
    { id: "e3", type: "grenadier", distance: 18.3, hp: 100, velocity: { x: 0, y: 0, z: 0 } },
  ],
  lastNoiseAt: now - 25_000,
  debug: { frameMs: 11.2, drawCalls: 1432 },
};

const { state, meta } = project(
  raw,
  {
    npc: {
      hp: band({ max: (ctx) => ctx.parent.maxHp, cuts: [0.2, 0.5], labels: ["critical", "low", "healthy"] }),
      ammo: count({ few: 5, many: 15 }),
      medkits: count(),
    },
    enemies: pipe(
      prune({ keep: ["id", "type", "distance", "hp"], sortBy: (a, b) => a.distance - b.distance, max: 5 }),
      each({ distance: band({ cuts: [10, 30], labels: ["near", "medium", "far"] }), hp: band({ max: 100, labels: ["weak", "hurt", "strong"] }) }),
    ),
    lastNoiseAt: time({ now }),
  },
  { unknown: "drop" },
);

console.log("Raw state:      ", JSON.stringify(raw).length, "chars");
console.log("Projected state:", JSON.stringify(state).length, "chars");
console.log(JSON.stringify(state, null, 2));
console.log("Dropped:", meta.dropped.join(", "));

type Enemy = { id: string; type: string; distance: string; hp: string };
const target = pick("Which enemy should the NPC deal with first?", state.enemies as Enemy[], {
  label: (e) => `${e.type} ${e.id}`,
  describe: (e) => `${e.type}, ${e.distance}, ${e.hp}`,
  none: "No enemy needs attention right now.",
});

if (!process.env.TYPESAFE_API_KEY?.trim()) {
  console.log("\nSet TYPESAFE_API_KEY in .env to send this to Jev.");
  process.exit(0);
}

const client = new TypeSafeClient();
const t0 = performance.now();
const { answers, usage, model } = await client.systemOne({
  state: state as never,
  questions: {
    action: choice("What should the NPC do next?", {
      attack: "Shoot at an enemy.",
      take_cover: "Get behind cover.",
      retreat: "Fall back away from enemies.",
      heal: "Use a medkit.",
      reload: "Reload the weapon.",
    }),
    target: target.question,
  },
});
const ms = performance.now() - t0;

const enemy = target.resolve(answers.target, { minConfidence: 0.5 });
console.log(`\nJev (${model}) answered in ${ms.toFixed(0)} ms using ${usage.input_tokens} input tokens`);
console.log(`Action: ${answers.action.choice} (confidence ${answers.action.confidence.toFixed(2)})`);
console.log(`Target: ${enemy ? `${enemy.type} ${enemy.id}` : "none / not confident"} (confidence ${answers.target.confidence.toFixed(2)})`);
