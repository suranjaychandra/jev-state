/** The jev-state rules for both domains. This is the only code a jev-state user writes. */
import { band, count, each, pipe, project, prune, time } from "jev-state";

const HOUR = 3_600_000;

export function toJevState(domain: "game" | "ticket", raw: Record<string, unknown>) {
  if (domain === "game") {
    return project(
      raw,
      {
        npc: {
          hp: band({ max: (ctx) => ctx.parent.maxHp, cuts: [0.2, 0.5], labels: ["critical", "low", "healthy"] }),
          ammo: count({ few: 5, many: 15 }),
          medkits: count(),
        },
        enemiesVisible: pipe((_, ctx) => ctx.root.enemies, count()),
        enemies: pipe(
          prune({ keep: ["type", "distance"], sortBy: (a, b) => a.distance - b.distance, max: 5 }),
          each({ distance: band({ cuts: [10, 30], labels: ["near", "medium", "far"] }) }),
        ),
        lastNoiseAt: time({ now: (ctx) => ctx.root.currentTime }),
      },
      { unknown: "drop" },
    ).state;
  }

  return project(
    raw,
    {
      // Derived fields: computed in code from the raw state, then turned into words.
      orderTotal: pipe(
        (_, ctx) => ctx.root.order.totalCents,
        band({ cuts: [50_000], labels: ["under $500", "$500 or more"] }),
      ),
      waiting: pipe(
        (_, ctx) => (Date.parse(ctx.root.now) - Date.parse(ctx.root.ticket.createdAt)) / HOUR,
        band({ cuts: [1, 24], labels: ["under an hour", "a few hours", "more than 24 hours"] }),
      ),
      contacts: count({ few: 2, many: 3, labels: { none: "0 times", one: "once", few: "twice", many: "3 or more times" } }),
    },
    { unknown: "drop" },
  ).state;
}
