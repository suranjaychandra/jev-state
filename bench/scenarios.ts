/**
 * Seeded NPC scenarios with ground truth from a written policy.
 * Jev gets the same policy as instructions, so both raw and projected runs are graded against rules they were told.
 */
import { band, count, each, pipe, project, prune, time, type Schema } from "../src/index.js";

export const ACTIONS = ["retreat", "take_cover", "heal", "reload", "attack", "investigate", "patrol"] as const;
export type Action = (typeof ACTIONS)[number];

export const INSTRUCTIONS = `You control a soldier NPC. Choose its next action.
Definitions:
- Health is "critical" below 20% of max health and "low" below 50% of max health.
- An enemy is "near" when it is closer than 10 meters.
- "Out of ammo" means ammo is zero.
- A noise is "recent" when it was heard less than one minute ago.
Apply the FIRST rule that matches, in this order:
1. retreat: health is critical and at least one enemy is near.
2. take_cover: out of ammo and at least one enemy is near.
3. heal: health is critical or low, the NPC has at least one medkit, and no enemy is near.
4. reload: out of ammo and no enemy is near.
5. attack: at least one enemy is visible and the NPC has ammo.
6. investigate: no enemies are visible and there was a recent noise.
7. patrol: none of the above.`;

export const CRITERIA: Record<Action, string> = {
  retreat: "Fall back away from enemies.",
  take_cover: "Get behind cover.",
  heal: "Use a medkit.",
  reload: "Reload the weapon.",
  attack: "Shoot at an enemy.",
  investigate: "Go check the noise.",
  patrol: "Continue the patrol route.",
};

export interface RawState {
  npc: {
    id: string;
    hp: number;
    maxHp: number;
    ammo: number;
    magazineSize: number;
    medkits: number;
    position: { x: number; y: number; z: number };
    rotationDeg: number;
    animState: string;
    meshId: string;
    lodLevel: number;
    lastPathfindMs: number;
  };
  enemies: {
    entityId: string;
    type: string;
    hp: number;
    maxHp: number;
    distance: number;
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    lastUpdateTick: number;
  }[];
  lastNoiseAt: number | null;
  currentTime: number;
  world: { tick: number; weather: string; fps: number; seed: number };
  debug: { frameMs: number; drawCalls: number; navmeshVersion: string };
}

export interface Scenario {
  id: string;
  expected: Action;
  raw: RawState;
}

/** The ground truth. Mirrors INSTRUCTIONS exactly. */
export function policy(s: RawState): Action {
  const ratio = s.npc.hp / s.npc.maxHp;
  const critical = ratio < 0.2;
  const low = ratio < 0.5;
  const near = s.enemies.some((e) => e.distance < 10);
  const outOfAmmo = s.npc.ammo === 0;
  const recentNoise = s.lastNoiseAt !== null && s.currentTime - s.lastNoiseAt < 60_000;

  if (critical && near) return "retreat";
  if (outOfAmmo && near) return "take_cover";
  if (low && s.npc.medkits > 0 && !near) return "heal";
  if (outOfAmmo && !near) return "reload";
  if (s.enemies.length > 0) return "attack";
  if (recentNoise) return "investigate";
  return "patrol";
}

/** What jev-state sends instead of the raw state. */
export const SCHEMA: Schema = {
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
};

export const projectState = (raw: RawState) => project(raw, SCHEMA, { unknown: "drop" }).state;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENEMY_TYPES = ["rifleman", "sniper", "grenadier", "scout", "heavy"];
const MAX_HP = [50, 80, 100, 150, 200, 300, 500];

function randomState(rnd: () => number, i: number): RawState {
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pickOne = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
  const vec = (r: number) => ({ x: round((rnd() - 0.5) * r), y: round(rnd() * 5), z: round((rnd() - 0.5) * r) });

  const maxHp = pickOne(MAX_HP);
  const currentTime = Date.UTC(2026, 8, 29, 12, 0, 0) + i * 7_919;
  const enemyCount = rnd() < 0.35 ? 0 : int(1, 8);
  const noise = rnd();

  return {
    npc: {
      id: `npc_${1000 + i}`,
      hp: int(1, maxHp),
      maxHp,
      ammo: rnd() < 0.35 ? 0 : int(1, 30),
      magazineSize: 30,
      medkits: rnd() < 0.4 ? 0 : int(1, 3),
      position: vec(200),
      rotationDeg: round(rnd() * 360, 1),
      animState: pickOne(["idle", "walk", "run", "crouch", "aim"]),
      meshId: `mesh_soldier_${int(1, 4)}`,
      lodLevel: int(0, 3),
      lastPathfindMs: round(rnd() * 3, 3),
    },
    enemies: Array.from({ length: enemyCount }, (_, k) => {
      const eMax = pickOne(MAX_HP);
      return {
        entityId: `ent_${i}_${k}`,
        type: pickOne(ENEMY_TYPES),
        hp: int(1, eMax),
        maxHp: eMax,
        distance: round(rnd() < 0.3 ? 2 + rnd() * 12 : 8 + rnd() * 70, 1),
        position: vec(200),
        velocity: vec(4),
        lastUpdateTick: int(10_000, 99_999),
      };
    }),
    lastNoiseAt: noise < 0.3 ? null : currentTime - int(noise < 0.7 ? 1_000 : 50_000, noise < 0.7 ? 120_000 : 900_000),
    currentTime,
    world: { tick: int(10_000, 99_999), weather: pickOne(["clear", "rain", "fog"]), fps: int(40, 144), seed: int(1, 1e6) },
    debug: { frameMs: round(rnd() * 20, 2), drawCalls: int(200, 3000), navmeshVersion: `v${int(1, 9)}.${int(0, 9)}` },
  };
}

/** `perAction` scenarios for each action, deterministic for a given seed. */
export function makeScenarios(perAction = 10, seed = 42): Scenario[] {
  const rnd = mulberry32(seed);
  const buckets = new Map<Action, Scenario[]>(ACTIONS.map((a) => [a, []]));
  for (let i = 0; [...buckets.values()].some((b) => b.length < perAction); i++) {
    if (i > 200_000) throw new Error("scenario generator could not fill every action");
    const raw = randomState(rnd, i);
    const expected = policy(raw);
    const bucket = buckets.get(expected)!;
    if (bucket.length < perAction) bucket.push({ id: `s${String(i).padStart(5, "0")}`, expected, raw });
  }
  return ACTIONS.flatMap((a) => buckets.get(a)!);
}
