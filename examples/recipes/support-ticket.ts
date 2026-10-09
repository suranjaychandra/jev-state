import { band, count, pipe, project } from "../../src/index.js";

const HOUR = 3_600_000;
const raw = {
  ticket: { id: "T-48213", createdAt: "2026-10-09T06:00:00Z", internalRef: "zd_99812" },
  order: { id: "ORD-7731", totalCents: 64_900, currency: "USD", warehouse: "SFO-2" },
  contacts: [{ channel: "email" }, { channel: "chat" }, { channel: "email" }],
  now: "2026-10-10T12:00:00Z",
};

const { state } = project(
  raw,
  {
    // Derived fields: a rule keyed on a name the input doesn't have adds that field.
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
);

console.log(state);
// { contacts: "3 or more times", orderTotal: "$500 or more", waiting: "more than 24 hours" }
