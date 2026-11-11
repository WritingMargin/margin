import assert from "node:assert/strict";
import test from "node:test";
import { loadCaptcha, renderCaptcha } from "./blog/captcha-widget";

class Element {
  children: Element[] = [];
  removed = false;
  clientWidth = 400;
  appendChild(child: Element) {
    this.children.push(child);
  }
  remove() {
    this.removed = true;
  }
}

function fakeBrowser(t: test.TestContext) {
  const scripts: any[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const globals: Record<string, any> = {
    setTimeout: (callback: () => void) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id: number) => timers.delete(id),
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globals,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => new Element(),
      head: { appendChild: (script: unknown) => scripts.push(script) },
    },
  });
  t.after(() => {
    for (const [key, descriptor] of [
      ["window", previousWindow],
      ["document", previousDocument],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return { globals, scripts, timers };
}

test("reCAPTCHA waits for provider readiness, shares script loading, and retries failed loads", async (t) => {
  const { globals, scripts } = fakeBrowser(t);
  const first = loadCaptcha("recaptcha-v2");
  assert.equal(loadCaptcha("recaptcha-v2"), first);
  assert.equal(scripts.length, 1);
  assert.match(
    scripts[0].src,
    /google.com\/recaptcha\/api.js\?render=explicit&onload=marginRecaptchaReady/,
  );
  scripts[0].onerror();
  await assert.rejects(first, /could not load/);
  assert.equal(scripts[0].removed, true);
  const retry = loadCaptcha("recaptcha-v2");
  assert.equal(scripts.length, 2);
  const api = {
    render() {
      return 0;
    },
    reset() {},
  };
  globals.grecaptcha = api;
  globals.marginRecaptchaReady();
  assert.equal(await retry, api);
});

test("Turnstile loading times out and can retry", async (t) => {
  const { globals, scripts, timers } = fakeBrowser(t);
  const first = loadCaptcha("turnstile");
  for (const callback of timers.values()) callback();
  await assert.rejects(first, /could not load/);
  assert.equal(scripts[0].removed, true);
  const retry = loadCaptcha("turnstile");
  const api = {
    render() {
      return "widget";
    },
    reset() {},
  };
  globals.turnstile = api;
  globals.marginTurnstileReady();
  assert.equal(await retry, api);
});

test("managed Turnstile binds action and account data and cleans up its own widget", (t) => {
  fakeBrowser(t);
  let settings: Record<string, any> = {};
  const calls: unknown[] = [];
  const api = {
    render(_container: HTMLElement, options: Record<string, unknown>) {
      settings = options;
      return "widget-1";
    },
    reset(id: string | number) {
      calls.push(["reset", id]);
    },
    remove(id: string | number) {
      calls.push(["remove", id]);
    },
  };
  const host = new Element();
  let token = "";
  let failures = 0;
  const widget = renderCaptcha(
    api,
    "turnstile",
    host as unknown as HTMLElement,
    {
      siteKey: "managed-site",
      action: "margin_comments",
      cData: "account-id",
      token: (value) => {
        token = value;
      },
      failed: () => {
        failures++;
      },
    },
  );
  assert.equal(settings.action, "margin_comments");
  assert.equal(settings.cData, "account-id");
  assert.equal(settings.sitekey, "managed-site");
  assert.equal(settings.size, "flexible");
  settings.callback("verified");
  assert.equal(token, "verified");
  settings["expired-callback"]();
  assert.equal(token, "");
  settings["error-callback"]();
  assert.equal(failures, 1);
  widget.reset();
  widget.remove();
  assert.deepEqual(calls, [
    ["reset", "widget-1"],
    ["remove", "widget-1"],
  ]);
  assert.equal(host.children[0].removed, true);
});

test("reCAPTCHA handles widget ID zero and remounts with a fresh container", (t) => {
  fakeBrowser(t);
  const host = new Element();
  host.clientWidth = 280;
  const containers: HTMLElement[] = [];
  const resets: (string | number)[] = [];
  const api = {
    render(container: HTMLElement, options: Record<string, unknown>) {
      containers.push(container);
      assert.equal(options.size, "compact");
      assert.equal(options.appearance, undefined);
      assert.equal(options.action, undefined);
      return 0;
    },
    reset(id: string | number) {
      resets.push(id);
    },
  };
  const options = {
    siteKey: "google-site",
    action: "",
    cData: "",
    token() {},
    failed() {},
  };
  const first = renderCaptcha(
    api,
    "recaptcha-v2",
    host as unknown as HTMLElement,
    options,
  );
  first.reset();
  first.remove();
  const second = renderCaptcha(
    api,
    "recaptcha-v2",
    host as unknown as HTMLElement,
    options,
  );
  assert.notEqual(containers[0], containers[1]);
  assert.equal(host.children[0].removed, true);
  assert.deepEqual(resets, [0, 0]);
  second.remove();
});
