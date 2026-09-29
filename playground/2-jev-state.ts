/**
 * Step 2: the same situations, but the state goes through jev-state first.
 * Run `npm install jev-state` before this. The rules live in project-state.ts.
 *
 *   npx tsx 2-jev-state.ts          # calls Jev
 *   npx tsx 2-jev-state.ts --dry    # only prints what would be sent
 */
import { toJevState } from "./project-state.js";
import { compare, run, save } from "./situations.js";

const results = await run("WITH jev-state", (s) => toJevState(s.domain, s.raw));
save("results-jev-state.json", results);
compare();
