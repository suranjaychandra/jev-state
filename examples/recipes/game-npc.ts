import { band, count, each, pipe, project, prune, time } from "../../src/index.js";

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
