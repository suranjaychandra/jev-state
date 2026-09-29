/**
 * Raw state vs jev-state projected state, against the real Jev API.
 *
 *   npm run bench                       # 10 scenarios per action, 3 reruns each
 *   npm run bench -- --per-action 2 --reruns 1   # quick smoke test
 */
import { writeFileSync } from "node:fs";
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { ACTIONS, CRITERIA, INSTRUCTIONS, makeScenarios, projectState, type Action } from "./scenarios.js";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {}
if (!process.env.TYPESAFE_API_KEY?.trim()) {
  console.error("TYPESAFE_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const PER_ACTION = arg("per-action", 10);
const RERUNS = arg("reruns", 3);
const CONCURRENCY = arg("concurrency", 5);

type Variant = "raw" | "projected";
interface Result {
  scenario: string;
  variant: Variant;
  run: number;
  expected: Action;
  got?: string;
  confidence?: number;
  inputTokens?: number;
  latencyMs?: number;
  error?: string;
}

const client = new TypeSafeClient();
let model = "";
const question = choice(INSTRUCTIONS, CRITERIA);
const scenarios = makeScenarios(PER_ACTION);

const jobs: (() => Promise<Result>)[] = [];
for (const s of scenarios) {
  const states: Record<Variant, object> = { raw: s.raw, projected: projectState(s.raw) };
  for (const variant of ["raw", "projected"] as const) {
    for (let run = 0; run < RERUNS; run++) {
      jobs.push(async () => {
        const base = { scenario: s.id, variant, run, expected: s.expected };
        const t0 = performance.now();
        try {
          const res = await client.systemOne({ state: states[variant] as never, questions: { action: question } });
          model ||= res.model;
          return {
            ...base,
            got: res.answers.action.choice,
            confidence: res.answers.action.confidence,
            inputTokens: res.usage.input_tokens,
            latencyMs: performance.now() - t0,
          };
        } catch (err) {
          return { ...base, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
        }
      });
    }
  }
}

console.log(`${scenarios.length} scenarios x 2 variants x ${RERUNS} reruns = ${jobs.length} calls, ${CONCURRENCY} at a time`);
const results: Result[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const r = await jobs[next++]!();
      results.push(r);
      if (results.length % 20 === 0 || results.length === jobs.length) process.stdout.write(`  ${results.length}/${jobs.length}\n`);
    }
  }),
);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : Number.NaN;
};

function summarize(variant: Variant) {
  const rs = results.filter((r) => r.variant === variant);
  const ok = rs.filter((r) => r.got !== undefined);
  const correct = ok.filter((r) => r.got === r.expected);
  const byScenario = new Map<string, Result[]>();
  for (const r of ok) byScenario.set(r.scenario, [...(byScenario.get(r.scenario) ?? []), r]);
  const unstable = [...byScenario.values()].filter((g) => new Set(g.map((r) => r.got)).size > 1).length;
  const buckets = [
    [0, 0.5],
    [0.5, 0.7],
    [0.7, 0.9],
    [0.9, 1.01],
  ].map(([lo, hi]) => {
    const inB = ok.filter((r) => r.confidence! >= lo! && r.confidence! < hi!);
    const avgConf = inB.reduce((a, r) => a + r.confidence!, 0) / (inB.length || 1);
    const acc = inB.filter((r) => r.got === r.expected).length / (inB.length || 1);
    return { range: `${lo}–${hi! > 1 ? 1 : hi}`, n: inB.length, avgConfidence: avgConf, accuracy: acc };
  });
  const perAction = Object.fromEntries(
    ACTIONS.map((a) => {
      const g = ok.filter((r) => r.expected === a);
      return [a, g.filter((r) => r.got === r.expected).length / (g.length || 1)];
    }),
  );
  return {
    calls: rs.length,
    errors: rs.length - ok.length,
    accuracy: correct.length / (ok.length || 1),
    unstableScenarios: unstable,
    scenarios: byScenario.size,
    avgInputTokens: ok.reduce((a, r) => a + r.inputTokens!, 0) / (ok.length || 1),
    p50LatencyMs: quantile(ok.map((r) => r.latencyMs!), 0.5),
    p95LatencyMs: quantile(ok.map((r) => r.latencyMs!), 0.95),
    calibration: buckets,
    perAction,
  };
}

const raw = summarize("raw");
const projected = summarize("projected");
const totalTokens = results.reduce((a, r) => a + (r.inputTokens ?? 0), 0);

const md = `# jev-state benchmark

- Model: \`${model || "unknown"}\`
- Date: ${new Date().toISOString().slice(0, 10)}
- ${scenarios.length} seeded NPC scenarios (${PER_ACTION} per action, seed 42) x ${RERUNS} reruns x 2 variants = ${jobs.length} calls
- Same instructions and options for both variants; only the state differs.
- Total input tokens: ${totalTokens.toLocaleString("en-US")} (about $${((totalTokens / 1e6) * 0.042).toFixed(4)})

| | Raw state | jev-state |
|---|---|---|
| Accuracy | ${pct(raw.accuracy)} | ${pct(projected.accuracy)} |
| Scenarios whose answer changed across reruns | ${raw.unstableScenarios}/${raw.scenarios} | ${projected.unstableScenarios}/${projected.scenarios} |
| Avg input tokens | ${raw.avgInputTokens.toFixed(0)} | ${projected.avgInputTokens.toFixed(0)} |
| p50 latency | ${raw.p50LatencyMs.toFixed(0)} ms | ${projected.p50LatencyMs.toFixed(0)} ms |
| p95 latency | ${raw.p95LatencyMs.toFixed(0)} ms | ${projected.p95LatencyMs.toFixed(0)} ms |
| Errors | ${raw.errors} | ${projected.errors} |

## Accuracy by expected action

| Action | Raw | jev-state |
|---|---|---|
${ACTIONS.map((a) => `| ${a} | ${pct(raw.perAction[a]!)} | ${pct(projected.perAction[a]!)} |`).join("\n")}

## Confidence vs. accuracy

When Jev reports a confidence, how often is it right?

| Confidence | Raw: n / avg conf / accuracy | jev-state: n / avg conf / accuracy |
|---|---|---|
${raw.calibration
  .map((b, i) => {
    const p = projected.calibration[i]!;
    const cell = (x: typeof b) => (x.n ? `${x.n} / ${pct(x.avgConfidence)} / ${pct(x.accuracy)}` : "0");
    return `| ${b.range} | ${cell(b)} | ${cell(p)} |`;
  })
  .join("\n")}
`;

const dir = new URL("./", import.meta.url);
writeFileSync(new URL("results.md", dir), md);
writeFileSync(new URL("results.json", dir), JSON.stringify({ model, raw, projected, results }, null, 2));
console.log(`\n${md}\nWrote bench/results.md and bench/results.json`);
const errs = results.filter((r) => r.error);
if (errs.length) console.log(`First error: ${errs[0]!.error}`);
