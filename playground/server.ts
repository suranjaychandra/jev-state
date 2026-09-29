/**
 * jev-state Playground: a local web app that asks Jev the same question twice,
 * once with raw state and once with state prepared by jev-state.
 *
 *   npm start               # real Jev calls (needs TYPESAFE_API_KEY in .env)
 *   npm start -- --mock     # fake answers, only for checking the page layout
 *
 * The API key stays in this process. The browser only talks to this server.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { toJevState } from "./project-state.js";
import {
  GAME_QUESTION, GAME_RULES, TICKET_QUESTION, TICKET_RULES, gamePolicy, gameRaw, loadKey, ticketPolicy, ticketRaw,
  type GameInput, type TicketInput,
} from "./situations.js";

const MOCK = process.argv.includes("--mock");
const PORT = Number(process.env.PORT) || 3000;
if (!MOCK) loadKey();
const client = MOCK ? null : new TypeSafeClient();

type Domain = "game" | "ticket";

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function readInput(domain: Domain, body: any): GameInput | TicketInput {
  if (domain === "game") {
    const maxHp = num(body.maxHp, 1, 10_000, 250);
    return {
      maxHp,
      hp: num(body.hp, 0, maxHp, maxHp),
      ammo: Math.round(num(body.ammo, 0, 999, 12)),
      medkits: Math.round(num(body.medkits, 0, 99, 0)),
      enemyDistances: (Array.isArray(body.enemyDistances) ? body.enemyDistances : [])
        .map((d: unknown) => num(d, 0, 10_000, Number.NaN))
        .filter((d: number) => Number.isFinite(d))
        .slice(0, 10),
      noiseSecondsAgo: body.noiseSecondsAgo === null || body.noiseSecondsAgo === undefined
        ? null
        : num(body.noiseSecondsAgo, 0, 86_400, 0),
    };
  }
  return {
    orderTotal: num(body.orderTotal, 0, 1_000_000, 0),
    hoursOpen: num(body.hoursOpen, 0, 10_000, 0),
    contacts: Math.round(num(body.contacts, 0, 50, 0)),
  };
}

function build(domain: Domain, input: GameInput | TicketInput) {
  const now = Date.now();
  const raw = domain === "game" ? gameRaw(input as GameInput, now) : ticketRaw(input as TicketInput, now);
  const projected = toJevState(domain, raw);
  const expected = domain === "game" ? gamePolicy(input as GameInput) : ticketPolicy(input as TicketInput);
  const question = domain === "game" ? GAME_QUESTION : TICKET_QUESTION;
  return { raw, projected, expected, question, options: Object.keys(question.criteria) };
}

async function ask(state: unknown, question: typeof GAME_QUESTION | typeof TICKET_QUESTION) {
  const t0 = performance.now();
  if (MOCK) {
    const options = Object.keys(question.criteria);
    const probs = options.map(() => Math.random());
    const sum = probs.reduce((a, b) => a + b, 0);
    const probabilities = Object.fromEntries(options.map((o, i) => [o, probs[i]! / sum]));
    const choice = options[probs.indexOf(Math.max(...probs))]!;
    return { choice, confidence: probabilities[choice]!, probabilities, tokens: Math.round(JSON.stringify(state).length / 3), ms: 5, model: "mock" };
  }
  const res = await client!.systemOne({ state: state as never, questions: { answer: question } });
  const a = res.answers.answer;
  return {
    choice: a.choice as string,
    confidence: a.confidence,
    probabilities: a.probabilities as Record<string, number>,
    tokens: res.usage.input_tokens,
    ms: Math.round(performance.now() - t0),
    model: res.model,
  };
}

// ---------- Terminal log ----------

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function describe(domain: Domain, i: GameInput | TicketInput) {
  if (domain === "game") {
    const g = i as GameInput;
    const enemies = g.enemyDistances.length ? g.enemyDistances.map((d) => `${d}m`).join(", ") : "none";
    const noise = g.noiseSecondsAgo === null ? "none" : `${g.noiseSecondsAgo}s ago`;
    return `hp ${g.hp}/${g.maxHp} · ammo ${g.ammo} · medkits ${g.medkits} · enemies ${enemies} · noise ${noise}`;
  }
  const t = i as TicketInput;
  return `order $${t.orderTotal} · open ${t.hoursOpen}h · contacts ${t.contacts}`;
}

let session = { runs: 0, raw: 0, js: 0 };

function log(domain: Domain, input: GameInput | TicketInput, expected: string, raw: any, js: any) {
  session.runs++;
  if (raw.choice === expected) session.raw++;
  if (js.choice === expected) session.js++;
  const time = new Date().toLocaleTimeString("en-GB");
  const row = (name: string, r: any) =>
    `   ${name.padEnd(10)} ${String(r.choice).padEnd(12)} ${r.confidence.toFixed(2)}  ${String(r.tokens).padStart(5)} tok  ${String(r.ms).padStart(4)} ms  ${r.choice === expected ? c.green("✅ correct") : c.red("❌ wrong")}`;
  console.log(
    `\n${c.dim(`[${time}]`)} ${domain === "game" ? "🎮 Game  " : "🎫 Ticket"} ${describe(domain, input)}` +
      `\n   ${c.dim("correct:")}   ${c.bold(expected)}` +
      `\n${row("RAW", raw)}` +
      `\n${row("JEV-STATE", js)}` +
      `\n   ${c.dim(`session: raw ${session.raw}/${session.runs} · jev-state ${session.js}/${session.runs}`)}`,
  );
}

// ---------- HTTP ----------

const page = () => readFileSync(new URL("./public/index.html", import.meta.url), "utf8");

async function body(req: IncomingMessage): Promise<any> {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100_000) throw new Error("Request too large");
  }
  return data ? JSON.parse(data) : {};
}

function send(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(page());
    }
    if (req.method === "GET" && req.url === "/api/info") {
      return send(res, 200, { mock: MOCK, rules: { game: GAME_RULES, ticket: TICKET_RULES } });
    }
    if (req.method === "POST" && (req.url === "/api/preview" || req.url === "/api/decide")) {
      const b = await body(req);
      const domain: Domain = b.domain === "ticket" ? "ticket" : "game";
      const input = readInput(domain, b.input ?? {});
      const { raw, projected, expected, question, options } = build(domain, input);
      const base = {
        mock: MOCK,
        domain,
        expected,
        options,
        raw: { state: raw, chars: JSON.stringify(raw).length },
        jevState: { state: projected, chars: JSON.stringify(projected).length },
      };
      if (req.url === "/api/preview") return send(res, 200, base);

      const [a, j] = await Promise.all([ask(raw, question), ask(projected, question)]);
      log(domain, input, expected, a, j);
      return send(res, 200, {
        ...base,
        model: a.model,
        raw: { ...base.raw, answer: a },
        jevState: { ...base.jevState, answer: j },
      });
    }
    res.writeHead(404).end("Not found");
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error";
    console.error(c.red(`\n   Error: ${message}`));
    send(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  ${c.bold("jev-state Playground")}  ${MOCK ? c.red("MOCK MODE: answers are fake") : c.green("live Jev")}`);
  console.log(`  Open ${c.cyan(`http://localhost:${PORT}`)}\n`);
});
