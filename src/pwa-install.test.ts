import assert from "node:assert/strict";
import test from "node:test";
import {
  createInstallPrompt,
  installInstructions,
  type InstallPromptEvent,
} from "./pwa/install-prompt";

function promptEvent(
  outcome: "accepted" | "dismissed",
  onPrompt: () => void = () => {},
) {
  const event = new Event("beforeinstallprompt", {
    cancelable: true,
  }) as InstallPromptEvent;
  event.prompt = async () => {
    onPrompt();
  };
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

test("capture an early prompt and invoke it only once after the reader requests installation", async () => {
  const browser = new EventTarget();
  const state = createInstallPrompt(browser);
  let prompts = 0;
  const event = promptEvent("dismissed", () => {
    prompts++;
  });
  browser.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(prompts, 0);
  const result = state.install();
  assert.equal(prompts, 1, "prompt must run during the click, before yielding");
  assert.equal(await result, "dismissed");
  assert.equal(await state.install(), "unavailable");
  assert.equal(state.isInstalled(), false);
  browser.dispatchEvent(
    promptEvent("accepted", () => {
      prompts++;
    }),
  );
  assert.equal(await state.install(), "accepted");
  assert.equal(state.isInstalled(), true);
  assert.equal(prompts, 2);
  state.dispose();
});

test("installation events clear prompts and notify UI; failed prompts fall back to instructions", async () => {
  const browser = new EventTarget();
  const state = createInstallPrompt(browser);
  assert.equal(await state.install(), "unavailable");
  const event = promptEvent("dismissed");
  event.prompt = async () => {
    throw new Error("prompt no longer available");
  };
  browser.dispatchEvent(event);
  assert.equal(await state.install(), "unavailable");
  let updates = 0;
  const stop = state.subscribe(() => {
    updates++;
  });
  browser.dispatchEvent(promptEvent("accepted"));
  browser.dispatchEvent(new Event("appinstalled"));
  assert.equal(updates, 1);
  assert.equal(state.isInstalled(), true);
  assert.equal(await state.install(), "unavailable");
  stop();
  state.dispose();
  const disposed = promptEvent("accepted");
  browser.dispatchEvent(disposed);
  assert.equal(disposed.defaultPrevented, false);
});

test("installation instructions distinguish iPhone, desktop-mode iPad, Safari Mac, and other browsers", () => {
  assert.match(
    installInstructions("iPhone Safari", 5),
    /Share.*Add to Home Screen/,
  );
  assert.match(installInstructions("Macintosh Safari", 5), /Share/);
  assert.match(installInstructions("Macintosh Safari", 0), /Add to Dock/);
  assert.match(
    installInstructions("Macintosh Chrome Safari", 0),
    /browser’s menu/,
  );
  assert.match(installInstructions("Android Chrome", 5), /Add to Home Screen/);
});
