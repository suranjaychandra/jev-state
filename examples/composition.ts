import { band, pipe, project, prune } from "../src/index.js";

const raw = { npc: { hp: 20, maxHp: 100 } };

// Calculate before removing fields needed by that calculation.
const calculateFirst = project(raw, {
  npc: pipe(
    { hp: band({ max: (ctx) => ctx.parent.maxHp, labels: ["low", "high"] }) },
    prune({ keep: ["hp"] }),
  ),
}).state;

// If an earlier stage already removed maxHp, read it from the original input.
const readFromRoot = project(raw, {
  npc: pipe(
    prune({ keep: ["hp"] }),
    { hp: band({ max: (ctx) => ctx.root.npc.maxHp, labels: ["low", "high"] }) },
  ),
}).state;

console.log(calculateFirst); // { npc: { hp: "low" } }
console.log(readFromRoot);   // { npc: { hp: "low" } }
