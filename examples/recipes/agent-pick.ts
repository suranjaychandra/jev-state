import { pick } from "../../src/index.js";

const tools = [
  { name: "search_docs", description: "Answer a how-to question from the product docs." },
  { name: "refund_order", description: "Refund an order that was charged twice or never arrived." },
  { name: "escalate", description: "Hand off to a human for anything legal, security, or account access." },
];

// A choice question with one option per tool, plus "none of these".
const route = pick("Which tool should handle this request?", tools, {
  label: (t) => t.name,
  describe: (t) => t.description,
  none: "None of these tools fit; reply directly.",
});

// Send route.question to Jev:
//   const { answers } = await client.systemOne({ state: request, questions: { tool: route.question } });
// then map the answer back to the original tool, or null below 60% confidence:
const answer = { choice: "refund_order", confidence: 0.93 }; // stands in for answers.tool
const tool = route.resolve(answer, { minConfidence: 0.6 });

console.log(tool?.name ?? "fallback");
// refund_order
