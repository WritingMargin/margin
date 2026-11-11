// Run against a fresh compiled server/web directory. Playwright and Chromium can
// come from the test runner via PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertRichReply,
  assertActionRowAlignment,
} from "./fixtures/writing-reply-checks.mjs";
import {
  startPeerReviewFixture,
  legacyBrief,
  legacyQuestion,
  saveResearchBrief,
  savedAgentSource,
  savedAgentNote,
} from "./fixtures/peer-research-server.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const fixture = await startPeerReviewFixture();
const { base, mailbox } = fixture;
const output =
  process.env.MARGIN_BROWSER_SCREENSHOTS ||
  path.join(fixture.dir, "screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE,
});
const exceptions = [];
let lastPage;
function button(page, name) {
  return page.getByRole("button", {
    name: name === "Context options" ? /^Context options:/ : name,
    exact: true,
  });
}
async function api(context, endpoint, method = "GET", data) {
  const result = await context.request.fetch(base + endpoint, {
    method,
    headers: { Origin: base },
    data,
  });
  assert.ok(
    result.ok(),
    endpoint + " " + result.status() + " " + (await result.text()),
  );
  return result.json();
}
async function capture(page, name) {
  await page.screenshot({
    path: path.join(output, name + ".png"),
    animations: "disabled",
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "horizontal page overflow at " + name,
  );
}
async function clickTab(page, label) {
  const tab = page.getByRole("tab", { name: label, exact: true });
  await tab.click();
}

async function openWritingAssistant(page) {
  await page.getByRole("button", { name: /^(Post|Article) options$/ }).click();
  await button(page, "Writing assistant").click();
  const assistant = page.locator("#writing-companion");
  await assistant.waitFor();
  return assistant;
}
async function closeWritingAssistant(page) {
  await page
    .locator("#writing-companion")
    .getByRole("button", { name: /^Close writing assistant$/i })
    .click();
  await page.locator("#writing-companion").waitFor({ state: "hidden" });
}
async function assertNav(page, expanded) {
  const nav = page.locator("#workspace-navigation");
  await nav.waitFor({ state: expanded ? "visible" : "hidden" });
  const toggle = button(page, expanded ? "Hide navigation" : "Open navigation");
  assert.equal(await toggle.getAttribute("aria-expanded"), String(expanded));
}
async function testWritingNavigation(page) {
  await assertNav(page, true);
  await openWritingAssistant(page);
  await assertNav(page, false);
  // The author can still reach navigation while the assistant is open.
  await button(page, "Open navigation").click();
  await assertNav(page, true);
  await button(page, "Hide navigation").click();
  await assertNav(page, false);
  await closeWritingAssistant(page);
  await assertNav(page, true);
  // Keep a manually collapsed preference even when command-search was used.
  await button(page, "Hide navigation").click();
  await assertNav(page, false);
  await openWritingAssistant(page);
  await assertNav(page, false);
  await page.keyboard.press("Meta+k");
  await assertNav(page, true);
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") === "Search content",
  );
  await closeWritingAssistant(page);
  await assertNav(page, false);
  await button(page, "Open navigation").click();
  await assertNav(page, true);
}

async function assertSideBySide(page) {
  const pad = await page.locator(".editor-card").boundingBox();
  const assistant = await page.locator("#writing-companion").boundingBox();
  const viewport = page.viewportSize();
  assert(pad && assistant && viewport);
  assert(
    pad.width > 200 &&
      assistant.width > 200 &&
      pad.height > 150 &&
      assistant.height > 150,
  );
  assert(pad.x >= 0 && assistant.x + assistant.width <= viewport.width + 1);
  assert(
    pad.x + pad.width <= assistant.x + 1,
    "Assistant must not overlap the editor",
  );
  const commonHeight =
    Math.min(pad.y + pad.height, assistant.y + assistant.height) -
    Math.max(pad.y, assistant.y);
  assert(commonHeight > 150, "Both panels must share a visible row");
}
function messageBox(assistant) {
  return assistant.getByRole("textbox", {
    name: "Message the Writing Assistant",
    exact: true,
  });
}
async function assertComposerVisible(page, assistant) {
  const send = await button(assistant, "Send message").boundingBox();
  const textbox = await messageBox(assistant).boundingBox();
  const viewport = page.viewportSize();
  for (const control of [send, textbox]) {
    assert(
      control &&
        control.x >= 0 &&
        control.x + control.width <= viewport.width + 1,
    );
    assert(
      control.y >= 0 && control.y + control.height <= viewport.height + 1,
      "The message composer is clipped",
    );
  }
}
async function assertComposerGrowth(assistant) {
  const input = messageBox(assistant);
  const height = async () => (await input.boundingBox()).height;
  const empty = await height();
  await input.fill("First line\nSecond line");
  const send = button(assistant, "Send message");
  await send.hover();
  assert.equal(
    await send.locator("svg").evaluate((icon) => getComputedStyle(icon).stroke),
    "rgb(255, 255, 255)",
    "The send arrow should stay white on hover",
  );
  await input.press("Shift+Enter");
  assert(
    (await height()) > empty,
    "A trailing newline should grow the composer",
  );
  await input.fill("A thought worth exploring. ".repeat(14));
  assert((await height()) > empty, "Wrapped text should grow the composer");
  await input.fill("A longer message. ".repeat(200));
  assert(
    await input.evaluate((el) => el.scrollHeight > el.clientHeight),
    "Long messages should scroll within the textbox",
  );
  assert(
    await button(assistant, "Send message").evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ),
      );
    }),
    "Send should remain reachable at maximum message height",
  );
  await input.fill("");
  assert.equal(
    await height(),
    empty,
    "Clearing the message should restore its initial height",
  );
}
async function generateInAssistant(page, text) {
  const assistant = page.locator("#writing-companion");
  const input = messageBox(assistant);
  if (text) await input.fill(text);
  const sentText = await input.inputValue();
  const turnIndex =
    (await assistant
      .getByRole("region", { name: /^Conversation turn / })
      .count()) + 1;
  const done = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/ai/writing" &&
      r.request().method() === "POST",
  );
  await button(assistant, "Send message").click();
  assert.equal((await done).status(), 200);
  const turn = assistant.getByRole("region", {
    name: "Conversation turn " + turnIndex,
    exact: true,
  });
  await turn.waitFor();
  assert((await turn.innerText()).includes(sentText));
  if (sentText === legacyBrief) {
    await turn
      .getByRole("heading", { name: "Compare evidence", exact: true })
      .waitFor();
  } else {
    await turn
      .getByText("Start by comparing the sample size with the uncertainty.", {
        exact: true,
      })
      .waitFor();
  }
  assert.equal(await input.inputValue(), "");
  return fixture.researchInputs.at(-1);
}
async function setLibrary(assistant, open) {
  const toggle = button(assistant, "Research library");
  if ((await toggle.getAttribute("aria-expanded")) !== String(open))
    await toggle.click();
  await assistant
    .getByRole("tab", { name: "Sources", exact: true })
    .waitFor({ state: open ? "visible" : "hidden" });
}
function contextDialog(page) {
  return page.getByRole("dialog", { name: "Writing options", exact: true });
}
async function showContext(assistant, expanded) {
  const toggle = button(assistant, "Context options");
  if ((await toggle.getAttribute("aria-expanded")) !== String(expanded))
    await toggle.click();
  const dialog = contextDialog(assistant.page());
  await dialog.waitFor({ state: expanded ? "visible" : "hidden" });
  await assistant
    .getByRole("button", { name: /^Context options:/, expanded })
    .waitFor();
  return dialog;
}
async function assertContextBounds(page, assistant, dialog) {
  const bounds = await dialog.boundingBox(),
    viewport = page.viewportSize();
  assert(bounds && bounds.width > 0 && bounds.height > 0);
  assert(
    bounds.x >= 0 &&
      bounds.x + bounds.width <= viewport.width + 1 &&
      bounds.y >= 0 &&
      bounds.y + bounds.height <= viewport.height + 1,
    "Context options is clipped: " + JSON.stringify(bounds),
  );
  const panel = await assistant.boundingBox();
  const anchor = await button(assistant, "Context options").boundingBox();
  const triggerTop = anchor.y + Math.max(0, (anchor.height - 26) / 2);
  assert(
    bounds.x >= panel.x &&
      bounds.x + bounds.width <= panel.x + panel.width + 1 &&
      Math.abs(bounds.y + bounds.height - (triggerTop - 4)) <= 1,
    "Context options should sit just above its button, inside the assistant: " +
      JSON.stringify({ bounds, panel, anchor }),
  );
  assert(
    (await assistant.locator(".chat-transcript").isVisible()) ||
      (await assistant.locator(".chat-welcome").isVisible()),
    "Opening context should keep the chat visible",
  );

  assert.equal(await dialog.getByRole("radio").count(), 4);
  assert.equal(
    await assistant.evaluate((el) => el.scrollTop),
    0,
    "Opening options must not scroll the outer panel",
  );
  assert.equal(await dialog.getByRole("checkbox").count(), 0);
  await dialog
    .getByRole("textbox", { name: "Audience", exact: true })
    .waitFor();
}
async function testInlinePassageReview(page, assistant, editor) {
  await editor.focus();
  await editor.evaluate((el) => {
    const quote = "study limitations",
      start = el.value.indexOf(quote);
    if (start < 0) throw Error("Fixture passage is missing");
    el.setSelectionRange(start, start + quote.length);
  });
  await page.getByRole("button", { name: /^Review selection or / }).click();
  const review = assistant.getByRole("region", {
    name: "Editorial feedback",
    exact: true,
  });
  await review.waitFor();
  await contextDialog(page).waitFor({ state: "hidden" });
  await review.getByText("study limitations", { exact: true }).waitFor();
  await button(review, "Evidence").click();
  assert.match(
    await messageBox(assistant).inputValue(),
    /What evidence would strengthen this claim/,
  );
  await button(review, "Clear selection").click();
  await review
    .getByText("study limitations", { exact: true })
    .waitFor({ state: "hidden" });
}
async function testInitialChat(page, assistant) {
  const toggle = button(assistant, "Context options");
  await toggle.waitFor();
  await assistant
    .getByRole("button", { name: /^Context options:/, expanded: false })
    .waitFor();
  await messageBox(assistant).waitFor();
  await button(assistant, "Chat").waitFor();
  assert(await button(assistant, "Send message").isDisabled());
  await assertComposerVisible(page, assistant);
  await capture(page, "writing-chat-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("dialog", { name: "Writing assistant" }).waitFor();
  await assertComposerVisible(page, assistant);
  await capture(page, "writing-chat-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("complementary", { name: "Writing assistant" })
    .waitFor();
  await assertSideBySide(page);
  await toggle.focus();
  await toggle.press("Enter");
  const dialog = contextDialog(page);
  await dialog.waitFor();
  await assistant
    .getByRole("button", { name: /^Context options:/, expanded: true })
    .waitFor();
  await assertContextBounds(page, assistant, dialog);
  const mode = dialog.getByRole("radio", { name: "Structure", exact: true });
  assert(
    await dialog.getByRole("radio", { name: "Ideas", exact: true }).isChecked(),
  );
  await mode.check();
  const audience = dialog.getByRole("textbox", {
    name: "Audience",
    exact: true,
  });
  await audience.fill("Methods reviewers");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await assistant
    .getByRole("button", { name: /^Context options:/, expanded: false })
    .waitFor();
  assert(
    await toggle.evaluate((el) => el === document.activeElement),
    "Escape should focus the Context options trigger",
  );
  await messageBox(assistant).waitFor();
  await showContext(assistant, true);
  assert(await mode.isChecked());
  assert.equal(await audience.inputValue(), "Methods reviewers");
  await messageBox(assistant).click();
  await dialog.waitFor({ state: "hidden" });
  await assistant
    .getByRole("button", { name: /^Context options:/, expanded: false })
    .waitFor();
}
async function testFailedChat(page, assistant, text) {
  const input = messageBox(assistant);
  await button(assistant, "Find an angle").click();
  assert.match(await input.inputValue(), /angle/i);
  await input.fill(text);
  let release;
  const response = new Promise((resolve) => {
    release = resolve;
  });
  const failed = async (route) => {
    await response;
    await route.fulfill({
      status: 503,
      json: { error: "Preview service temporarily unavailable." },
    });
  };
  const path = "**/api/ai/writing";
  await page.route(path, failed);
  await input.press("Shift+Enter");
  assert((await input.inputValue()).includes("\n"));
  await input.fill(text);
  await input.press("Enter");
  await assistant.getByText("Thinking…", { exact: true }).waitFor();
  assert(await button(assistant, "Send message").isDisabled());
  assert.equal(
    await assistant
      .getByRole("region", { name: /^Conversation turn / })
      .count(),
    0,
  );
  release();
  await assistant
    .getByRole("alert")
    .filter({ hasText: "temporarily unavailable" })
    .waitFor();
  assert.equal(await input.inputValue(), text);
  assert.equal(
    await assistant
      .getByRole("region", { name: /^Conversation turn / })
      .count(),
    0,
  );
  await page.unroute(path, failed);
}
async function testResearchLibrary(library) {
  assert.equal(await library.locator("form").count(), 0);
  assert.equal(await button(library, "Add a source").count(), 0);
  assert.equal(await button(library, "Search publications").count(), 0);
  await library
    .getByRole("link", { name: "Fixture field study", exact: true })
    .waitFor();
}
async function testFormattingPreview(page, assistant, editor) {
  const original = await editor.evaluate((el) => el.value);
  await messageBox(assistant).fill("Format this draft with clear emphasis.");
  await button(assistant, "Send message").click();
  const tabs = assistant.getByRole("tablist", {
    name: "Formatting preview views",
  });
  await tabs.waitFor();
  for (const name of ["Changes", "Original", "Preview"]) {
    const tab = tabs.getByRole("tab", { name, exact: true });
    await tab.click();
    assert.equal(await tab.getAttribute("aria-selected"), "true");
  }
  assert.equal(await editor.evaluate((el) => el.value), original);
  await button(assistant, "Apply formatting").click();
  assert(
    (await editor.evaluate((el) => el.value)).includes(
      "**Field measurements were repeated on two days.**",
    ),
  );
  await button(assistant, "Undo formatting").click();
  assert.equal(await editor.evaluate((el) => el.value), original);
}
async function saveDraft(page) {
  const done = page.waitForResponse(
    (r) => r.request().method() === "PUT" && /\/api\/posts\//.test(r.url()),
  );
  await button(page, "Save draft").click();
  assert.equal((await done).status(), 200);
}
async function pageFrom(ctx) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => exceptions.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 500)
      console.error(
        "Server response",
        r.request().method(),
        new URL(r.url()).pathname,
        r.status(),
      );
  });
  lastPage = page;
  return page;
}
const articleBody =
  "## Results\n\nField measurements were repeated on two days.\n\nThe sample was small. We report the observed values and discuss the study limitations.";
const noteBody = "Private review: give the sample size.";
const thinking = savedAgentNote.body;
const notebook = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    {
      cell_type: "markdown",
      id: "intro",
      metadata: {},
      source: ["Measured **samples**"],
    },
    {
      cell_type: "code",
      id: "test",
      metadata: {},
      source: ["print(24)"],
      execution_count: 1,
      outputs: [{ output_type: "stream", name: "stdout", text: ["24\n"] }],
    },
  ],
};
async function google(page, identity) {
  await page.route("https://accounts.google.com/**", async (route) => {
    const state = new URL(route.request().url()).searchParams.get("state");
    await route.fulfill({
      status: 302,
      headers: {
        location:
          base +
          "/reader/auth/callback?state=" +
          encodeURIComponent(state) +
          "&code=" +
          identity,
      },
    });
  });
  await page
    .getByRole("button", {
      name: /Continue with Google|Use another Google account/,
    })
    .click();
}
try {
  const owner = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
  });
  await api(owner, "/api/setup", "POST", {
    email: "owner@example.test",
    password: "fixture-only-password",
    setupToken: "local-review-fixture",
  });
  const draft = await api(owner, "/api/posts", "POST", {
    title: "Field study",
    slug: "field-study",
    excerpt: "What the sample tells us.",
    content: articleBody,
  });
  const page = await pageFrom(owner);
  await page.goto(base + "/admin/posts/" + draft.id + "?mode=write");
  const editor = page.locator('.source-body [role="textbox"]');
  await editor.waitFor();
  await testWritingNavigation(page);
  await editor.focus();
  await editor.evaluate((input) => {
    const start = input.value.indexOf("study limitations");
    input.setSelectionRange(start, start + "study limitations".length);
  });
  await capture(page, "editor-desktop");
  const assistant = await openWritingAssistant(page);
  await assertNav(page, false);
  await testInitialChat(page, assistant);
  const research = assistant.getByRole("checkbox", {
    name: "Research mode",
    exact: true,
  });
  assert(!(await research.isChecked()));
  assert.equal(
    await assistant.getByRole("tab", { name: "Sources", exact: true }).count(),
    0,
  );
  const searches = [],
    writingRequests = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/ai/writing" &&
      request.method() === "POST"
    )
      writingRequests.push(request.postDataJSON());
  });
  // Assistant suggestions come from the Central fixture. A separate result set
  // exercises the explicit publication search without external network access.
  await owner.route("**/api/posts/*/research?*", (route) => {
    searches.push(new URL(route.request().url()).searchParams);
    return route.fulfill({
      json: [
        {
          url: "https://doi.org/10.1000/manual-discovery",
          title: "Publication found manually",
          excerpt: "A separately requested publication search.",
        },
      ],
    });
  });
  const prompt = "How large was the sample?";
  const ordinaryPrompt = "Help me structure a study report.";
  const workingBody =
    articleBody + "\n\nAn additional observation is still being checked.";
  await editor.fill(workingBody);
  await testFailedChat(page, assistant, ordinaryPrompt);
  const plain = await generateInAssistant(page, ordinaryPrompt);
  assert(!Object.hasOwn(writingRequests.at(-1), "researchMode"));
  assert(!Object.hasOwn(plain, "researchMode"));
  assert(!Object.hasOwn(writingRequests.at(-1), "postId"));
  assert(!Object.hasOwn(plain, "postId"));
  assert(!plain.canSaveResearch);
  assert.equal(plain.conversationMode, true);
  assert.deepEqual(writingRequests.at(-1).history, []);
  assert.equal(plain.brief, ordinaryPrompt);
  assert.equal(plain.content, workingBody);
  assert.equal(plain.title, "Field study");
  assert.equal(writingRequests.at(-1).content, workingBody);
  await editor.fill(articleBody);
  assert.equal(plain.mode, "structure");
  assert.equal(plain.audience, "Methods reviewers");
  assert.equal(plain.passage, undefined);
  assert.equal(searches.length, 0);
  await page.reload();
  await openWritingAssistant(page);
  await research.check();
  await button(assistant, "Research library").waitFor();
  assert.equal(searches.length, 0);
  const discovered = await generateInAssistant(page, prompt);
  assert.equal(discovered.content, articleBody);
  assert.equal(discovered.title, "Field study");
  assert.equal(searches.length, 0);
  assert.equal(writingRequests.at(-1).researchMode, true);
  assert.equal(writingRequests.at(-1).brief, prompt);
  assert.equal(discovered.researchMode, true);
  assert.equal(writingRequests.at(-1).postId, draft.id);
  assert.equal(discovered.canSaveResearch, true);
  assert(!Object.hasOwn(discovered, "postId"));
  const sourceCard = (name) =>
    assistant.getByRole("article").filter({ hasText: name }).first();
  await assistant
    .getByRole("heading", { name: "Research sources" })
    .first()
    .waitFor();
  const generated = sourceCard("Fixture field study");
  for (const [width, height, device] of [
    [1440, 900, "desktop"],
    [680, 844, "tablet"],
    [390, 844, "mobile"],
  ]) {
    await page.setViewportSize({ width, height });
    await page
      .getByRole(width > 1050 ? "complementary" : "dialog", {
        name: "Writing assistant",
      })
      .waitFor();
    const cardRow = generated.locator(".research-source-actions");
    const composerSizes = await messageBox(assistant).evaluate((el) => [
      getComputedStyle(el).fontSize,
      getComputedStyle(el, "::placeholder").fontSize,
    ]);
    const dialog = await showContext(assistant, true);
    await assertContextBounds(page, assistant, dialog);
    await button(assistant, "Research library").hover();
    for (const name of ["Context options", "Research library"]) {
      assert.equal(
        await button(assistant, name).evaluate(
          (el) => getComputedStyle(el).backgroundColor,
        ),
        "rgba(0, 0, 0, 0)",
        name + " should have a transparent background when open or hovered",
      );
    }
    if (device !== "tablet") await capture(page, "chat-context-" + device);
    const audience = dialog.getByRole("textbox", {
      name: "Audience",
      exact: true,
    });
    const labelSize = await audience.evaluate(
      (input) => getComputedStyle(input.labels[0]).fontSize,
    );
    assert.deepEqual(composerSizes, ["14px", labelSize]);
    assert.equal(
      await audience.evaluate(
        (input) => getComputedStyle(input, "::placeholder").fontSize,
      ),
      labelSize,
    );
    assert.deepEqual(
      await assistant
        .locator(".chat-tool svg")
        .evaluateAll((icons) =>
          icons.map((icon) => icon.getBoundingClientRect().width),
        ),
      [13],
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert(
      await button(assistant, "Context options").evaluate(
        (el) => el === document.activeElement,
      ),
    );
    await assertComposerGrowth(assistant);
    await cardRow.scrollIntoViewIfNeeded();
    await assertActionRowAlignment(
      page,
      assistant.locator(".chat-compose-tools"),
      device + " composer",
    );
    await assertActionRowAlignment(page, cardRow, device + " source card");
    await capture(page, "chat-action-rows-" + device);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("complementary", { name: "Writing assistant" })
    .waitFor();
  await button(generated, "Read full abstract").click();
  await button(generated, "Insert citation").click();
  assert.match(
    await editor.evaluate((el) => el.value),
    /10\.1000\/review-fixture/,
  );
  assert.equal(
    (await api(owner, "/api/posts/" + draft.id + "/sources")).length,
    0,
  );
  await editor.fill(articleBody);
  await button(generated, "Save source").click();
  await generated.getByText("Saved source", { exact: true }).waitFor();
  await button(generated, "Insert citation").waitFor();
  await generated
    .getByRole("checkbox", { name: /Use .* for AI research/ })
    .check();
  await sourceCard("Independent comparison")
    .getByRole("checkbox", { name: /Use .* for AI research/ })
    .check();
  assert.equal(await editor.evaluate((el) => el.value), articleBody);
  await button(assistant, "Manage sources").first().click();
  const sourcesTab = assistant.getByRole("tab", {
    name: "Sources",
    exact: true,
  });
  assert.equal(await sourcesTab.getAttribute("aria-selected"), "true");
  const library = assistant.locator(".research-workspace");
  await testResearchLibrary(library);
  assert.equal(searches.length, 0);
  await button(assistant, "Back to chat").click();
  await messageBox(assistant).waitFor();
  await editor.fill(workingBody);
  const firstTurn = assistant.getByRole("region", {
    name: "Conversation turn 1",
    exact: true,
  });
  await firstTurn
    .locator("summary")
    .filter({ hasText: "Writing suggestions" })
    .click();
  await button(firstTurn, "Refine suggestion").first().click();
  const composer = messageBox(assistant);
  assert.match(await composer.inputValue(), /Check uncertainty/);
  const comparison = "Compare the uncertainty reported by these sources.";
  const researched = await generateInAssistant(page, comparison);
  assert.equal(writingRequests.at(-1).researchMode, true);
  assert.deepEqual(
    writingRequests.at(-1).researchSources.map((source) => source.url),
    [
      "https://doi.org/10.1000/review-fixture",
      "https://doi.org/10.1000/comparison",
    ],
  );
  assert.equal(researched.researchMode, true);
  assert.match(
    researched.brief,
    /^Compare the uncertainty reported by these sources/,
  );
  assert.deepEqual(
    researched.history.map((item) => item.message),
    [prompt],
  );
  assert.equal(researched.history[0].research, true);
  assert(!researched.feedback);
  assert.match(researched.passage, /Sample variance was recorded/);
  assert.match(researched.passage, /Independent measurements are reported/);
  assert.equal(researched.content, workingBody);
  assert.equal(researched.title, "Field study");
  assert.equal(writingRequests.at(-1).content, workingBody);
  await editor.fill(articleBody);
  assert.doesNotMatch(JSON.stringify(researched), /manual-discovery/);
  assert.equal(searches.length, 0);
  const turns = assistant.getByRole("region", { name: /^Conversation turn / });
  assert.equal(await turns.count(), 2);
  assert((await turns.nth(0).innerText()).includes(prompt));
  assert((await turns.nth(1).innerText()).includes(comparison));
  assert.equal(await turns.nth(0).getByRole("link").count(), 2);
  assert.equal(await turns.nth(1).getByRole("link").count(), 2);
  await assistant
    .getByRole("heading", { name: "Research sources" })
    .last()
    .scrollIntoViewIfNeeded();
  await capture(page, "writing-conversation-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("dialog", { name: "Writing assistant" }).waitFor();
  await assertComposerVisible(page, assistant);
  await capture(page, "writing-conversation-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("complementary", { name: "Writing assistant" })
    .waitFor();
  await turns
    .nth(1)
    .locator("summary")
    .filter({ hasText: "Writing suggestions" })
    .click();
  const kept = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url().endsWith("/writing-notes"),
  );
  await button(turns.nth(1), "Keep insight").first().click();
  assert.equal((await kept).status(), 201);
  await button(assistant, "View context").first().click();
  await assistant
    .getByText(/Consult these sources/)
    .first()
    .waitFor();
  await button(assistant, "Chat").click();
  assert(await research.isChecked());
  for (const name of ["Fixture field study", "Independent comparison"]) {
    const choice = sourceCard(name).getByRole("checkbox", {
      name: "Use " + name + " for AI research",
      exact: true,
    });
    assert(await choice.isChecked());
    await choice.uncheck();
  }
  await generateInAssistant(
    page,
    "Revisit the limits without the previously selected papers.",
  );
  const deselected = writingRequests.at(-1);
  assert.equal(deselected.researchMode, true);
  assert.equal(
    deselected.brief,
    "Revisit the limits without the previously selected papers.",
  );
  assert.deepEqual(
    deselected.history.map((turn) => turn.message),
    [prompt, comparison],
  );
  assert(!deselected.researchSources?.length);
  assert(!deselected.passage);
  assert.doesNotMatch(JSON.stringify(deselected), /doi\.org/);
  await research.uncheck();
  await button(assistant, "Research library").waitFor({ state: "hidden" });
  await sourceCard("Fixture field study").getByRole("link").waitFor();
  assert.equal(
    await sourceCard("Fixture field study").getByRole("checkbox").count(),
    0,
  );
  assert.equal(
    await button(sourceCard("Fixture field study"), "Insert citation").count(),
    0,
  );

  const unchecked = await generateInAssistant(
    page,
    "Return to ordinary planning.",
  );
  assert(!Object.hasOwn(writingRequests.at(-1), "researchMode"));
  assert(!Object.hasOwn(unchecked, "researchMode"));
  assert.deepEqual(
    unchecked.history.map((turn) => turn.message),
    [prompt, comparison, deselected.brief],
  );
  assert(!unchecked.passage);
  assert.equal(unchecked.content, articleBody);
  assert.equal(unchecked.title, "Field study");
  assert.equal(searches.length, 0);
  await research.check();
  await editor.focus();
  await editor.evaluate((input) => {
    const start = input.value.indexOf("study limitations");
    input.setSelectionRange(start, start + "study limitations".length);
  });
  await button(sourceCard("Fixture field study"), "Insert citation").click();
  assert.match(
    await editor.evaluate((el) => el.value),
    /10\.1000\/review-fixture/,
  );
  assert.match(
    await editor.evaluate((el) => el.value),
    /\]study limitations\[\/Citation\]/,
  );
  await generateInAssistant(page, saveResearchBrief);
  await setLibrary(assistant, true);
  await clickTab(page, "Notes");
  assert.equal(
    await assistant
      .getByRole("tabpanel", { name: "Notes", exact: true })
      .locator("form")
      .count(),
    0,
  );
  await page.getByText(thinking, { exact: true }).waitFor();
  await clickTab(page, "Notebook");
  await editor.focus();
  await editor.evaluate((input) =>
    input.setSelectionRange(input.value.length, input.value.length),
  );
  await page.getByLabel("Notebook file").setInputFiles({
    name: "study.ipynb",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(notebook)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('.source-body [role="textbox"]')
      .value.includes("nbformat"),
  );
  assert.match(
    await editor.evaluate((el) => el.value),
    /\]study limitations\[\/Citation\]\.\s*```ipynb/,
  );
  await saveDraft(page);
  await page.reload();
  await openWritingAssistant(page);
  assert(!(await research.isChecked()));
  await research.check();
  await assertSideBySide(page);
  await setLibrary(assistant, true);
  await assistant
    .getByRole("tab", { name: "Sources", exact: true })
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await capture(page, "research-desktop");
  await clickTab(page, "Notes");
  await page.getByText(thinking, { exact: true }).waitFor();
  await clickTab(page, "Sources");
  await button(page, "Insert citation").first().waitFor();
  // Exercise compact panel layout and keyboard dismissal.
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "research-mobile");
  await setLibrary(assistant, false);
  let imageRequests = 0;
  const blockRemoteImage = (route) => {
    imageRequests++;
    return route.abort();
  };
  await page.route("https://fixture.invalid/**", blockRemoteImage);
  await messageBox(assistant).fill(saveResearchBrief);
  const mobile = await generateInAssistant(page);
  assert.equal(mobile.researchMode, true);
  assert.equal(mobile.brief, saveResearchBrief);
  assert.equal(mobile.canSaveResearch, true);
  assert.equal(searches.length, 0);
  await assistant
    .getByText("Saved to this draft: 1 source and 1 thinking note.", {
      exact: true,
    })
    .waitFor();
  await assertRichReply(
    page,
    assistant.getByRole("region", { name: "Conversation turn 1", exact: true }),
    savedAgentSource,
    capture,
  );
  assert.equal(imageRequests, 0);
  await page.unroute("https://fixture.invalid/**", blockRemoteImage);
  await capture(page, "agent-save-confirmation-mobile");
  await assistant
    .getByRole("link", { name: savedAgentSource.title, exact: true })
    .first()
    .waitFor();
  await assistant
    .getByRole("heading", { name: "Saved thinking notes" })
    .waitFor();
  await assistant
    .getByText(savedAgentNote.body, { exact: true })
    .first()
    .waitFor();
  await button(assistant, "Open notes").click();
  assert.equal(
    await assistant
      .getByRole("tab", { name: "Notes", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await clickTab(page, "Sources");
  await assistant
    .locator(".research-library")
    .getByRole("link", { name: savedAgentSource.title, exact: true })
    .waitFor();
  await clickTab(page, "Notes");
  await assistant
    .getByRole("tabpanel", { name: "Notes", exact: true })
    .getByText(savedAgentNote.body, { exact: true })
    .first()
    .waitFor();
  const savedNotes = await api(
    owner,
    "/api/posts/" + draft.id + "/writing-notes",
  );
  assert(
    savedNotes.some(
      (entry) =>
        entry.note.body === savedAgentNote.body &&
        entry.note.title === savedAgentNote.title,
    ),
  );
  const savedSources = await api(owner, "/api/posts/" + draft.id + "/sources");
  assert(savedSources.some((source) => source.url === savedAgentSource.url));
  assert.equal(
    await editor.evaluate((el) => el.value),
    (await api(owner, "/api/posts/" + draft.id)).content,
  );
  await assistant
    .getByRole("tabpanel", { name: "Notes", exact: true })
    .getByText(savedAgentNote.body, { exact: true })
    .first()
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await capture(page, "agent-saved-notes-mobile");
  await page.keyboard.press("Escape");
  await page
    .getByRole("dialog", { name: "Writing assistant" })
    .waitFor({ state: "hidden" });
  await assertNav(page, false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertNav(page, true);
  await openWritingAssistant(page);
  await button(assistant, "New chat").click();
  await assertNav(page, false);
  await assertSideBySide(page);
  await capture(page, "format-after-research-desktop");
  await testFormattingPreview(page, assistant, editor);
  await closeWritingAssistant(page);
  await assertNav(page, true);
  await testInlinePassageReview(page, assistant, editor);
  await closeWritingAssistant(page);
  await button(page, "Peer review").click();
  await page.getByLabel("Reviewer’s Google email").fill("peer@example.test");
  await button(page, "Send invitation").click();
  await page.getByText("Requested", { exact: true }).first().waitFor();
  assert.equal(mailbox.length, 1);
  assert.equal(mailbox[0].to, "peer@example.test");
  const reviewURL = base + "/review/" + mailbox[0].invite;
  const reviewer = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const review = await pageFrom(reviewer);
  await review.goto(reviewURL);
  await button(review, "Continue with Google").waitFor();
  assert(
    !(await review.locator("body").innerText()).includes(
      "The sample was small.",
    ),
  );
  await capture(review, "google-gate-mobile");
  await google(review, "wrong");
  await review
    .getByText(/No active invitation|invited Google account/i)
    .first()
    .waitFor();
  assert(
    !(await review.locator("body").innerText()).includes(
      "The sample was small.",
    ),
  );
  await review.unroute("https://accounts.google.com/**");
  await google(review, "reviewer");
  await review
    .getByRole("heading", { name: "Field study", exact: true })
    .waitFor();
  assert.equal(
    (await reviewer.request.get(base + "/api/posts/" + draft.id)).status(),
    401,
  );
  const paragraph = review
    .getByText(/The sample was small\. We report/)
    .first();
  await paragraph.scrollIntoViewIfNeeded();
  // Use the native selection range with the same events produced by keyboard selection.
  await paragraph.evaluate((p) => {
    const text = p.firstChild;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 21);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Shift", bubbles: true }),
    );
  });
  await button(review, "Add section note").click();
  await review.getByLabel("Your note", { exact: true }).fill(noteBody);
  await capture(review, "passage-composer-mobile");
  await button(review, "Save review note").click();
  await review.getByText("Review note saved.", { exact: true }).waitFor();
  await review
    .locator(".review-note")
    .getByText(noteBody, { exact: true })
    .waitFor();
  assert(await button(review, "Approve this revision").isDisabled());
  await review
    .getByRole("button", { name: /Read 1 review note on this passage/i })
    .click();
  assert(
    await review
      .locator(".review-note")
      .evaluate((el) => document.activeElement === el),
  );
  await capture(review, "passage-note-mobile");
  lastPage = page;
  await page.reload();
  await button(page, "Peer review").click();
  await page.getByText(noteBody, { exact: true }).waitFor();
  assert.match(await editor.evaluate((el) => el.value), /The sample was small/);
  await editor.fill(
    (await editor.evaluate((el) => el.value)).replace(
      "The sample was small.",
      "The sample included 24 observations.",
    ),
  );
  await saveDraft(page);
  const chooseFix = page.getByText("Choose fixing revision", { exact: true });
  await chooseFix.click();
  const picker = page.getByRole("combobox", { name: "Saved revision" });
  await picker.waitFor();
  assert.match(await picker.locator("option:checked").innerText(), /Version 3/);
  await button(page, "Mark addressed").click();
  await page.getByText("Changes made", { exact: true }).waitFor();
  await capture(page, "author-review-desktop");
  lastPage = review;
  await review.setViewportSize({ width: 1280, height: 900 });
  await review.reload();
  await review
    .getByText(/Changes since your last visit/i)
    .first()
    .waitFor();
  await review
    .locator(".review-note")
    .getByText("On an earlier revision", { exact: true })
    .waitFor();
  const fix = review.getByText(/Addressed · View revision/).first();
  await fix.click();
  await review
    .locator(".review-note")
    .getByText(/24 observations/)
    .first()
    .waitFor();
  await capture(review, "returning-reviewer-diff");
  const badgeBox = review.getByRole("checkbox", {
    name: /Show .*Reviewed by.*published post/,
  });
  assert(!(await badgeBox.isChecked()));
  await badgeBox.check();
  await review.getByLabel("Public reviewer name").fill("Dr. Rivera");
  await button(review, "Approve this revision").click();
  await review
    .getByText(/Approved/)
    .first()
    .waitFor();
  lastPage = page;
  const published = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" &&
      new URL(r.url()).pathname === "/api/posts/" + draft.id,
  );
  await page.getByRole("button", { name: /^Publish (post|article)$/ }).click();
  assert.equal((await published).status(), 200);
  const reader = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const publication = await pageFrom(reader);
  lastPage = publication;
  await publication.goto(base + "/post/field-study");
  if (
    (await publication
      .getByText("Reviewed by Dr. Rivera", { exact: true })
      .count()) === 0
  )
    await publication.reload();
  await publication
    .getByText("Reviewed by Dr. Rivera", { exact: true })
    .waitFor();
  const citation = publication.getByRole("link", {
    name: "study limitations",
    exact: true,
  });
  await citation.click();
  await publication
    .getByRole("dialog", { name: "Fixture field study" })
    .waitFor();
  await publication.keyboard.press("Escape");
  const publicBody = await publication.locator("body").innerText();
  assert(!publicBody.includes(noteBody));
  assert(!publicBody.includes(thinking));
  assert(!publicBody.includes(savedAgentNote.body));
  assert(!publicBody.includes(savedAgentSource.title));
  const book = publication.getByRole("region", { name: "Jupyter notebook" });
  await book.waitFor();
  const cells = book.locator("details");
  assert.equal(await cells.count(), 2);
  assert(await cells.nth(0).evaluate((e) => e.open));
  assert.equal(
    await cells.nth(0).locator(".notebook-markdown p").innerText(),
    "Measured samples",
  );
  assert.equal(
    await cells.nth(0).locator(".notebook-markdown p strong").innerText(),
    "samples",
  );
  await cells.nth(1).locator("summary").click();
  await book.getByText("24", { exact: true }).waitFor();
  const download = publication.waitForEvent("download");
  await button(book, "Download .ipynb").click();
  const file = await download;
  assert.deepEqual(
    JSON.parse(await readFile(await file.path(), "utf8")),
    notebook,
  );
  await capture(publication, "published-notebook-badge");
  await review.reload();
  await review.getByText(/No active invitation/i).waitFor();
  assert(
    !(await review.locator("body").innerText()).includes("24 observations"),
  );
  const privateCredit = await api(owner, "/api/posts", "POST", {
    title: "Anonymous peer",
    slug: "anonymous-peer",
    content: "A second observation.",
  });
  const second = await api(
    owner,
    "/api/posts/" + privateCredit.id + "/reviews",
    "POST",
    { email: "peer@example.test" },
  );
  await review.goto(base + "/review/" + second.id);
  await review
    .getByRole("heading", { name: "Anonymous peer", exact: true })
    .waitFor();
  assert(
    !(await review
      .getByRole("checkbox", { name: /Show .*Reviewed by/ })
      .isChecked()),
  );
  await button(review, "Approve this revision").click();
  await review.getByText("Approval saved.", { exact: true }).waitFor();
  await api(
    owner,
    "/api/posts/" + privateCredit.id + "/draft/publish",
    "POST",
    { revision: privateCredit.revision },
  );
  await publication.goto(base + "/post/anonymous-peer");
  await publication
    .getByRole("heading", { name: "Anonymous peer", exact: true })
    .waitFor();
  assert.equal(await publication.locator(".review-badge").count(), 0);
  const unsaved = await pageFrom(owner);
  await unsaved.goto(base + "/admin/posts/new?mode=write");
  const unsavedAssistant = await openWritingAssistant(unsaved);
  await unsavedAssistant
    .getByRole("checkbox", { name: "Research mode", exact: true })
    .check();
  await messageBox(unsavedAssistant).fill(legacyBrief);
  const request = unsaved.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/api/ai/writing"),
  );
  const unsavedResearch = await generateInAssistant(unsaved);
  const outgoing = (await request).postDataJSON();
  assert.equal(outgoing.researchMode, true);
  assert(!Object.hasOwn(outgoing, "postId"));
  assert(!unsavedResearch.canSaveResearch);
  assert(!Object.hasOwn(unsavedResearch, "postId"));
  const legacyTurn = unsavedAssistant.getByRole("region", {
    name: "Conversation turn 1",
    exact: true,
  });
  assert.equal(await legacyTurn.locator(".chat-reply-text").count(), 0);
  const compact = legacyTurn.locator(".reply-markdown-compact");
  assert.equal(await compact.count(), 2);
  assert.equal(await compact.locator("strong").innerText(), "sampling");
  assert.equal(await compact.locator("code").innerText(), "sample_size");
  const appendix = compact.getByRole("link", {
    name: "methods appendix",
    exact: true,
  });
  assert.equal(
    await appendix.getAttribute("href"),
    "https://example.test/methods",
  );
  assert.equal(await appendix.getAttribute("target"), "_blank");
  await button(legacyTurn, "Explore question").click();
  assert(
    (await messageBox(unsavedAssistant).inputValue()).includes(legacyQuestion),
  );
  assert.deepEqual(exceptions, []);
  console.log(
    "PASS: writing assistant research opt-in, desktop navigation auto-collapse/restore, author research, sources, AI, citations, thinking notes, notebook import/download, Google gate and scope, review changes and approval, public badge and privacy, desktop and mobile layout. Screenshots:",
    output,
  );
} catch (e) {
  if (lastPage) {
    await lastPage
      .screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {});
    console.error(
      "Page URL",
      lastPage.url(),
      "visible UI",
      (await lastPage.locator("body").innerText()).slice(-3200),
    );
  }
  throw e;
} finally {
  await browser.close();
  await fixture.close();
}
