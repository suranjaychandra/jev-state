import { beforeAll, describe, expect, it, vi } from "vitest";
import * as jev from "../src/index.js";
import type { ProjectOptions, Schema } from "../src/index.js";
import { toJevState } from "../playground/project-state.js";
import { ticketPolicy, ticketRaw } from "../playground/situations.js";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 11, 12);
let recipeSchema: Schema;
let recipeOptions: ProjectOptions | undefined;

beforeAll(async () => {
  // Capture the actual standalone recipe's schema without duplicating its rules.
  const projection = vi.spyOn(jev, "project");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await import("../examples/recipes/support-ticket.js");
    expect(projection).toHaveBeenCalledTimes(1);
    [, recipeSchema, recipeOptions] = projection.mock.calls[0]!;
  } finally {
    projection.mockRestore();
    log.mockRestore();
  }
});

describe.each(["playground", "recipe"])("support ticket: %s", (source) => {
  const projectTicket = (raw: Record<string, unknown>) => source === "playground"
    ? toJevState("ticket", raw)
    : jev.project(raw, recipeSchema, recipeOptions).state;

  it("matches the strict 24-hour policy boundary for small and big orders", () => {
    const boundaries = [
      { hoursOpen: 24, waiting: "1 to 24 hours", long: false },
      { hoursOpen: 24 - 1 / HOUR, waiting: "1 to 24 hours", long: false },
      { hoursOpen: 24 + 1 / HOUR, waiting: "more than 24 hours", long: true },
      { hoursOpen: 30, waiting: "more than 24 hours", long: true },
    ];
    for (const orderTotal of [120, 649]) {
      for (const boundary of boundaries) {
        const input = { orderTotal, hoursOpen: boundary.hoursOpen, contacts: 1 };
        const state = projectTicket(ticketRaw(input, NOW));
        const context = `${orderTotal} dollars, ${boundary.hoursOpen} hours`;
        expect(state.waiting, context).toBe(boundary.waiting);
        expect(ticketPolicy(input), context).toBe(boundary.long
          ? (orderTotal === 649 ? "urgent" : "high")
          : (orderTotal === 649 ? "normal" : "low"));
      }
    }
  });

  it("uses precise wording below and at one hour", () => {
    for (const [hoursOpen, waiting] of [
      [0, "under an hour"],
      [1 - 1 / HOUR, "under an hour"],
      [1, "1 to 24 hours"],
      [12, "1 to 24 hours"],
    ] as const) {
      const input = { orderTotal: 649, hoursOpen, contacts: 1 };
      expect(projectTicket(ticketRaw(input, NOW)).waiting, `${hoursOpen} hours`).toBe(waiting);
    }
  });
});
