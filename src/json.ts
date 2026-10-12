import { isPlainObject } from "./rule.js";

/** Validate only the completed projection; rules may use non-JSON intermediate values. */
export function assertJson(value: unknown, path = "$", ancestors = new WeakSet<object>()): void {
  const fail = (reason: string): never => {
    throw new TypeError(`project() output at ${path} is not JSON-compatible: ${reason}. Convert or drop this value in your schema.`);
  };
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("expected a finite number");
    return;
  }
  if (typeof value !== "object") fail(typeof value);
  const container = value as object;
  if (!Array.isArray(container) && !isPlainObject(container)) fail("expected a plain object or array");
  if (typeof (container as { toJSON?: unknown }).toJSON === "function") fail("custom toJSON method");
  if (ancestors.has(container)) fail("circular reference");
  ancestors.add(container);
  if (Array.isArray(container)) {
    // Visit holes too: JSON.stringify would silently turn them into null.
    for (let index = 0; index < container.length; index++) {
      assertJson(container[index], `${path}[${index}]`, ancestors);
    }
  } else {
    for (const [key, child] of Object.entries(container)) {
      assertJson(child, `${path}[${JSON.stringify(key)}]`, ancestors);
    }
  }
  // A shared object in separate branches is valid; only ancestor references are cycles.
  ancestors.delete(container);
}
