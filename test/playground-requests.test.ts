import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Execute the actual page script with controlled HTTP completions and a minimal DOM.
// These tests cover request ordering and rendered output, not browser layout.
const html = readFileSync(new URL("../playground/public/index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

class Element {
  innerHTML = "";
  textContent: string | number = "";
  disabled = false;
  value = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, on: boolean) => on ? this.classes.add(name) : this.classes.delete(name),
  };
  listeners = new Map<string, (event: unknown) => unknown>();
  addEventListener(name: string, callback: (event: unknown) => unknown) { this.listeners.set(name, callback); }
  emit(name: string, target: object = {}) { return this.listeners.get(name)?.({ target }); }
  focus() {}
  querySelector(selector: string) {
    if (!this.innerHTML.includes('class="answer"')) return null;
    return selector === ".answer" || selector === ".bar > i" ? { style: {} } : null;
  }
  querySelectorAll() { return []; }
}

function result(expected: string) {
  const answer = { choice: expected, confidence: 1, probabilities: { [expected]: 1 }, tokens: 100, ms: 5 };
  return { expected, options: [expected], mock: true,
    raw: { state: { expected }, chars: 20, answer },
    jevState: { state: { expected }, chars: 20, answer } };
}

async function page() {
  const elements = new Map<string, Element>();
  const el = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  };
  const tabs = [new Element(), new Element()];
  tabs[0]!.dataset.domain = "game";
  tabs[1]!.dataset.domain = "ticket";
  const timers = new Map<number, () => unknown>();
  const frames: (() => void)[] = [];
  let nextTimer = 0;
  const requests: { url: string; body: { domain: string; input: Record<string, unknown> };
    complete: (data: unknown, ok?: boolean) => void;
    reject: (error: Error) => void }[] = [];
  runInNewContext(script, {
    document: {
      getElementById: el, querySelectorAll: () => tabs,
      body: new Element(), addEventListener() {},
    },
    structuredClone,
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    setTimeout: (callback: () => unknown) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: (url: string, options: { body: string }) => {
      if (url === "/api/info") return Promise.resolve({ json: async () => ({ mock: true, rules: {} }) });
      return new Promise((resolve, reject) => requests.push({ url, body: JSON.parse(options.body), reject,
        complete: (data, ok = true) => resolve({ ok, json: async () => data }),
      }));
    },
  });
  await flush();
  const tick = () => {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach((callback) => { void callback(); });
  };
  tick();
  requests.shift()!.complete(result("initial"));
  await flush();
  const input = (key = "hp", value = "20") => el("fields").emit("input", { dataset: { key }, value });
  return { el, tabs, requests, tick, input, frames, ask: () => el("ask").emit("click") };
}

describe("playground request ordering", () => {
  it("keeps the newest preview when responses arrive out of order", async () => {
    const p = await page();
    p.input("hp", "20"); p.tick();
    p.input("hp", "30"); p.tick();
    expect(p.requests.map((r) => r.body.input.hp)).toEqual([20, 30]);
    p.requests[1]!.complete(result("newest")); await flush();
    p.requests[0]!.complete(result("older")); await flush();
    expect(p.el("expected").textContent).toBe("newest");
  });

  it("invalidates an old preview immediately, before the new debounce fires", async () => {
    const p = await page();
    p.input(); p.tick();
    p.input("hp", "30");
    p.requests[0]!.complete(result("outdated")); await flush();
    expect(p.el("expected").textContent).not.toBe("outdated");
  });

  it.each(["input", "domain", "preset", "noise", "enemy"])("ignores a decision after a %s change", async (change) => {
    const p = await page();
    const pending = p.ask();
    if (change === "input") p.input();
    if (change === "domain") p.tabs[1]!.emit("click");
    if (change === "preset") p.el("presets").emit("click", { dataset: { preset: "1" } });
    if (change === "noise") p.el("fields").emit("change", { id: "noise-on", checked: true });
    if (change === "enemy") {
      p.el("enemy-input").value = "7.9";
      p.el("fields").emit("click", { id: "enemy-add", dataset: {} });
    }
    p.tick();
    p.requests[1]!.complete(result("current")); await flush();
    p.requests[0]!.complete(result("old-decision")); await pending;
    expect(p.el("expected").textContent).toBe("current");
    expect(p.el("raw-decision").innerHTML).not.toContain("old-decision");
    expect(p.el("s-runs").textContent).not.toBe(1);
    expect(p.el("ask").disabled).toBe(false);
  });

  it("ignores obsolete request errors and releases the ask button", async () => {
    const p = await page();
    const pending = p.ask();
    p.tabs[1]!.emit("click");
    p.requests[0]!.reject(new Error("Old domain failed")); await pending;
    expect(p.el("error").style.display).toBe("none");
    expect(p.el("ask").disabled).toBe(false);
  });

  it("prevents an earlier preview from overwriting a completed decision", async () => {
    const p = await page();
    p.input(); p.tick();
    const pending = p.ask();
    p.requests[1]!.complete(result("decision")); await pending;
    p.requests[0]!.complete(result("earlier-preview")); await flush();
    expect(p.el("expected").textContent).toBe("decision");
    expect(p.el("raw-decision").innerHTML).toContain("decision");
    expect(p.el("s-runs").textContent).toBe(1);
  });

  it("cancels a queued preview and prevents duplicate asks", async () => {
    const p = await page();
    p.input();
    const pending = p.ask();
    await p.ask(); p.tick();
    expect(p.requests.map((r) => r.url)).toEqual(["/api/decide"]);
    p.requests[0]!.complete(result("current")); await pending;
    expect(p.el("s-runs").textContent).toBe(1);
  });

  it("shows current request errors and clears them when inputs change", async () => {
    const p = await page();
    const pending = p.ask();
    p.requests[0]!.complete({ error: "Decision failed" }, false); await pending;
    expect(p.el("error").textContent).toBe("Decision failed");
    expect(p.el("ask").disabled).toBe(false);
    p.input();
    expect(p.el("error").style.display).toBe("none");
    p.tick();
    p.requests[1]!.complete({ error: "Preview failed" }, false); await flush();
    expect(p.el("error").textContent).toBe("Preview failed");
  });

  it("handles a domain change before the decision animation frame", async () => {
    const p = await page();
    const pending = p.ask();
    p.requests[0]!.complete(result("current")); await pending;
    p.tabs[1]!.emit("click");
    expect(() => p.frames.forEach((frame) => frame())).not.toThrow();
  });
});
