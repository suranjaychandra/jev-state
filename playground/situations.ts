/**
 * The test data, shared by the scripts and the playground so the only difference between
 * "raw" and "jev-state" is the state format. Correct answers come from the same rules Jev is given.
 */
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const HOUR = 3_600_000;

// ---------- Game: what should the NPC do? ----------

export const GAME_RULES = `You control a soldier NPC. Choose its next action.
Definitions:
- Health is "critical" below 20% of max health and "low" below 50% of max health.
- An enemy is "near" when it is closer than 10 meters.
- A noise is "recent" when it was heard less than one minute ago.
Apply the FIRST rule that matches, in this order:
1. retreat: health is critical and at least one enemy is near.
2. heal: health is critical or low, the NPC has at least one medkit, and no enemy is near.
3. attack: at least one enemy is visible and the NPC has ammo.
4. investigate: no enemies are visible and there was a recent noise.
5. patrol: none of the above.`;

export const GAME_QUESTION = choice(GAME_RULES, { retreat: null, heal: null, attack: null, investigate: null, patrol: null });

export interface GameInput {
  hp: number;
  maxHp: number;
  ammo: number;
  medkits: number;
  /** Meters to each visible enemy. */
  enemyDistances: number[];
  /** Seconds since the last noise, or null for none. */
  noiseSecondsAgo: number | null;
}

const ENEMY_TYPES = ["rifleman", "sniper", "grenadier", "scout", "heavy"];

/** The raw state a game engine would typically have: exact numbers, epoch times, and engine noise. */
export function gameRaw(g: GameInput, now = Date.now()): Record<string, unknown> {
  return {
    npc: {
      id: "npc_7", hp: g.hp, maxHp: g.maxHp, ammo: g.ammo, medkits: g.medkits, magazineSize: 30,
      position: { x: 12.4, y: 0, z: -88.1 }, rotationDeg: 270.5, animState: "aim", meshId: "mesh_soldier_2", lodLevel: 1,
    },
    enemies: g.enemyDistances.map((distance, i) => ({
      entityId: `ent_${i}`, type: ENEMY_TYPES[i % ENEMY_TYPES.length], distance, hp: 60, maxHp: 100,
      position: { x: 3.1 + i, y: 0, z: 9.8 - i }, velocity: { x: 0.5, y: 0, z: -0.2 }, lastUpdateTick: 48213,
    })),
    lastNoiseAt: g.noiseSecondsAgo === null ? null : now - g.noiseSecondsAgo * 1000,
    currentTime: now,
    world: { tick: 48213, weather: "fog", fps: 90 },
    debug: { frameMs: 11.2, drawCalls: 1432 },
  };
}

export function gamePolicy(g: GameInput): string {
  const ratio = g.hp / g.maxHp;
  const near = g.enemyDistances.some((d) => d < 10);
  if (ratio < 0.2 && near) return "retreat";
  if (ratio < 0.5 && g.medkits > 0 && !near) return "heal";
  if (g.enemyDistances.length > 0 && g.ammo > 0) return "attack";
  if (g.enemyDistances.length === 0 && g.noiseSecondsAgo !== null && g.noiseSecondsAgo < 60) return "investigate";
  return "patrol";
}

// ---------- Support: how urgent is this ticket? ----------

export const TICKET_RULES = `You triage customer support tickets. Choose the ticket's priority.
Definitions:
- A "big order" has an order total of $500 or more.
- A ticket is "waiting long" when it was opened more than 24 hours ago.
- A "repeat contact" means the customer has contacted support 3 or more times about this order.
Apply the FIRST rule that matches, in this order:
1. urgent: big order and waiting long.
2. high: waiting long, or repeat contact.
3. normal: big order.
4. low: none of the above.`;

export const TICKET_QUESTION = choice(TICKET_RULES, { urgent: null, high: null, normal: null, low: null });

export interface TicketInput {
  /** Order total in dollars. */
  orderTotal: number;
  hoursOpen: number;
  contacts: number;
}

/** The raw state a helpdesk export would typically have: cents, ISO timestamps, a contact log, sync metadata. */
export function ticketRaw(t: TicketInput, now = Date.now()): Record<string, unknown> {
  return {
    ticket: {
      id: "T-48213", subject: "Where is my order?", channel: "email",
      createdAt: new Date(now - t.hoursOpen * HOUR).toISOString(), tags: ["shipping"], internalRef: "zd_99812",
    },
    order: { id: "ORD-7731", totalCents: Math.round(t.orderTotal * 100), currency: "USD", warehouse: "SFO-2", skuCount: 3 },
    contacts: Array.from({ length: t.contacts }, (_, i) => ({
      at: new Date(now - Math.max(0, t.hoursOpen - i) * HOUR).toISOString(), channel: i % 2 ? "chat" : "email",
    })),
    now: new Date(now).toISOString(),
    meta: { schemaVersion: 4, source: "helpdesk-sync", shard: 12 },
  };
}

export function ticketPolicy(t: TicketInput): string {
  const big = t.orderTotal >= 500;
  const waitingLong = t.hoursOpen > 24;
  const repeat = t.contacts >= 3;
  if (big && waitingLong) return "urgent";
  if (waitingLong || repeat) return "high";
  if (big) return "normal";
  return "low";
}

// ---------- The six fixed situations used by 1-raw.ts and 2-jev-state.ts ----------

export interface Situation {
  id: string;
  domain: "game" | "ticket";
  story: string;
  expected: string;
  raw: Record<string, unknown>;
}

const NOW = Date.parse("2026-09-29T12:00:00Z");
const game = (id: string, story: string, g: GameInput): Situation =>
  ({ id, domain: "game", story, expected: gamePolicy(g), raw: gameRaw(g, NOW) });
const ticket = (id: string, story: string, t: TicketInput): Situation =>
  ({ id, domain: "ticket", story, expected: ticketPolicy(t), raw: ticketRaw(t, NOW) });

export const SITUATIONS: Situation[] = [
  game("game-1", "Health 38 of 250 (15%), an enemy 7.9 m away",
    { hp: 38, maxHp: 250, ammo: 12, medkits: 1, enemyDistances: [7.9, 45], noiseSecondsAgo: 30 }),
  game("game-2", "Health 90 of 500 (18%), enemies 25 m and 60 m away, has a medkit",
    { hp: 90, maxHp: 500, ammo: 20, medkits: 1, enemyDistances: [25.4, 60.2], noiseSecondsAgo: null }),
  game("game-3", "No enemies, last noise 150 seconds ago",
    { hp: 200, maxHp: 250, ammo: 25, medkits: 0, enemyDistances: [], noiseSecondsAgo: 150 }),
  ticket("ticket-1", "$649 order, opened 30 hours ago, 1 contact", { orderTotal: 649, hoursOpen: 30, contacts: 1 }),
  ticket("ticket-2", "$120 order, opened 2 hours ago, 3 contacts", { orderTotal: 120, hoursOpen: 2, contacts: 3 }),
  ticket("ticket-3", "$899 order, opened 5 hours ago, 1 contact", { orderTotal: 899, hoursOpen: 5, contacts: 1 }),
];

// ---------- Runner for the scripts ----------

const RUNS = 3;

export interface Result {
  id: string;
  expected: string;
  answers: string[];
  confidences: number[];
  inputTokens: number;
}

export function loadKey() {
  try {
    process.loadEnvFile(".env");
  } catch {}
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    console.error("TYPESAFE_API_KEY is missing. Copy .env.example to .env, paste your key, and save the file.");
    process.exit(1);
  }
}

/** Send every situation to Jev RUNS times, using `toState` to build what gets sent. */
export async function run(label: string, toState: (s: Situation) => unknown): Promise<Result[]> {
  const dry = process.argv.includes("--dry");
  if (!dry) loadKey();
  const client = dry ? null : new TypeSafeClient();

  console.log(`\n=== ${label}: ${SITUATIONS.length} situations x ${RUNS} runs ===\n`);
  const results: Result[] = [];
  for (const s of SITUATIONS) {
    const state = toState(s);
    if (dry) {
      console.log(`${s.id} (${s.story}) sends ${JSON.stringify(state).length} chars:\n${JSON.stringify(state)}\n`);
      continue;
    }
    const question = s.domain === "game" ? GAME_QUESTION : TICKET_QUESTION;
    const calls = await Promise.all(
      Array.from({ length: RUNS }, () => client!.systemOne({ state: state as never, questions: { answer: question } })),
    );
    const r: Result = {
      id: s.id,
      expected: s.expected,
      answers: calls.map((c) => c.answers.answer.choice),
      confidences: calls.map((c) => c.answers.answer.confidence),
      inputTokens: calls[0]!.usage.input_tokens,
    };
    results.push(r);
    const marks = r.answers.map((a) => (a === s.expected ? "✅" : "❌")).join(" ");
    console.log(`${s.id.padEnd(9)} expected ${s.expected.padEnd(8)} got ${r.answers.join(", ").padEnd(30)} ${marks}`);
  }
  if (dry) return results;

  const all = results.flatMap((r) => r.answers.map((a) => a === r.expected));
  console.log(`\nCorrect: ${all.filter(Boolean).length}/${all.length}`);
  return results;
}

export function save(file: string, results: Result[]) {
  if (results.length) writeFileSync(file, JSON.stringify(results, null, 2));
}

/** Write results.md comparing both runs, once both result files exist. */
export function compare() {
  if (!existsSync("results-raw.json") || !existsSync("results-jev-state.json")) return;
  const raw: Result[] = JSON.parse(readFileSync("results-raw.json", "utf8"));
  const js: Result[] = JSON.parse(readFileSync("results-jev-state.json", "utf8"));
  const score = (r: Result) => r.answers.filter((a) => a === r.expected).length;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const total = (rs: Result[]) => rs.reduce((a, r) => a + score(r), 0);
  const runs = raw.reduce((a, r) => a + r.answers.length, 0);

  const rows = SITUATIONS.map((s) => {
    const a = raw.find((r) => r.id === s.id)!;
    const b = js.find((r) => r.id === s.id)!;
    return `| ${s.story} | **${s.expected}** | ${a.answers.join(", ")} (${score(a)}/${a.answers.length}) | ${b.answers.join(", ")} (${score(b)}/${b.answers.length}) | ${a.inputTokens} -> ${b.inputTokens} |`;
  });
  const md = `# Jev: raw state vs jev-state

Same questions, same rules, same model. Only the state format changes. Each situation ran ${RUNS} times.

| Situation | Correct | Raw state | With jev-state | Input tokens |
|---|---|---|---|---|
${rows.join("\n")}

**Correct answers:** raw ${total(raw)}/${runs}, jev-state **${total(js)}/${runs}**
**Avg confidence:** raw ${avg(raw.flatMap((r) => r.confidences)).toFixed(2)}, jev-state ${avg(js.flatMap((r) => r.confidences)).toFixed(2)}
**Avg input tokens:** raw ${avg(raw.map((r) => r.inputTokens)).toFixed(0)}, jev-state ${avg(js.map((r) => r.inputTokens)).toFixed(0)}
`;
  writeFileSync("results.md", md);
  console.log(`\n${md}\nSaved results.md`);
}
