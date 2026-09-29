/**
 * Step 1: send the raw state straight to Jev, the way a new user would.
 *
 *   npx tsx 1-raw.ts          # calls Jev
 *   npx tsx 1-raw.ts --dry    # only prints what would be sent
 */
import { compare, run, save } from "./situations.js";

const results = await run("RAW STATE", (s) => s.raw);
save("results-raw.json", results);
compare();
