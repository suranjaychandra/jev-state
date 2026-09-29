/**
 * Try it yourself: the same situation sent to Jev twice, as raw state and through jev-state.
 * Edit the numbers in `situation` and run again:
 *
 *   npm run compare
 */
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { CRITERIA, INSTRUCTIONS, policy, projectState, type RawState } from "../bench/scenarios.js";

// ✏️ Change these and run again.
const situation = {
  hp: 38, // current health
  maxHp: 250, // max health (38 of 250 is 15%, which the rules call "critical")
  ammo: 12,
  medkits: 1,
  enemyDistances: [7.9, 45], // meters; under 10 counts as "near"
  noiseSecondsAgo: 30, // null for no noise
};

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {}

const now = Date.now();
const raw: RawState = {
  npc: {
    id: "npc_7",
    hp: situation.hp,
    maxHp: situation.maxHp,
    ammo: situation.ammo,
    magazineSize: 30,
    medkits: situation.medkits,
    position: { x: 12.4, y: 0, z: -88.1 },
    rotationDeg: 270.5,
    animState: "aim",
    meshId: "mesh_soldier_2",
    lodLevel: 1,
    lastPathfindMs: 0.812,
  },
  enemies: situation.enemyDistances.map((distance, i) => ({
    entityId: `ent_${i}`,
    type: ["rifleman", "sniper", "scout"][i % 3]!,
    hp: 60,
    maxHp: 100,
    distance,
    position: { x: i * 10, y: 0, z: i * 5 },
    velocity: { x: 0.5, y: 0, z: -0.2 },
    lastUpdateTick: 48213,
  })),
  lastNoiseAt: situation.noiseSecondsAgo === null ? null : now - situation.noiseSecondsAgo * 1000,
  currentTime: now,
  world: { tick: 48213, weather: "fog", fps: 90, seed: 1337 },
  debug: { frameMs: 11.2, drawCalls: 1432, navmeshVersion: "v3.1" },
};
const projected = projectState(raw);

console.log(`\nRaw state (${JSON.stringify(raw).length} characters):`);
console.log(JSON.stringify(raw));
console.log(`\njev-state output (${JSON.stringify(projected).length} characters):`);
console.log(JSON.stringify(projected, null, 2));

const correct = policy(raw);
console.log(`\nCorrect answer by the rules: ${correct}`);

if (!process.env.TYPESAFE_API_KEY?.trim()) {
  console.log("\nSet TYPESAFE_API_KEY in .env to ask Jev.");
  process.exit(0);
}

const client = new TypeSafeClient();
const questions = { action: choice(INSTRUCTIONS, CRITERIA) };
const [a, b] = await Promise.all([
  client.systemOne({ state: raw as never, questions }),
  client.systemOne({ state: projected as never, questions }),
]);

const line = (name: string, r: typeof a) => {
  const got = r.answers.action.choice;
  const mark = got === correct ? "✅" : "❌";
  return `${mark} ${name.padEnd(10)} → ${got.padEnd(12)} confidence ${r.answers.action.confidence.toFixed(2)}, ${r.usage.input_tokens} tokens`;
};
console.log("\nJev's answers:");
console.log(line("Raw", a));
console.log(line("jev-state", b));
