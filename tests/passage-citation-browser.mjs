// Uses the real reader components with an isolated publication fixture.
// PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE may point to an existing browser install.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const dir = await mkdtemp(path.join(tmpdir(), "margin-citation-"));
const quote = "Café ideas & evidence help readers think.";
const paragraphs = [
  `An opening example. ${quote}`,
  ...Array.from({ length: 18 }, (_, index) => `Background ${index + 1}. ${"A thoughtful explanation makes space for questions. ".repeat(5)}`),
  'The selected example. <em>Café ideas</em> &amp; <a href="/evidence">evidence</a> help readers think.',
  "This second paragraph is part of a longer citation.",
  ...Array.from({ length: 8 }, (_, index) => `Closing ${index + 1}. ${"The rest of the article remains readable. ".repeat(5)}`),
];
let fixture = { paragraphs, revision: "original" };
await build({
  stdin: {
    resolveDir: process.cwd(), loader: "tsx",
    contents: `
      import { createRoot } from 'react-dom/client';
      import PassageInteractions from './src/blog/PassageInteractions';
      import { defaultTheme } from './shared/types';
      import './src/fonts';
      import './src/styles.css';
      const data = await fetch('/fixture.json').then(r => r.json());
      const theme = { ...defaultTheme, publicUrl: location.origin + '/publication', name: 'Field Notes', authorProfile: { name: 'Ada Writer' }, comments: { ...defaultTheme.comments, enabled: false, visible: false } };
      const post = { id: 'citation-test', slug: 'caf\u00e9', title: 'Ideas worth sharing', status: 'published', revision: data.revision };
      const interactions = { enabled: false, questionMode: 'hidden', notesEnabled: false, subscriber: false, reactionsEnabled: false, questions: [], reactions: [] };
      createRoot(document.getElementById('root')).render(<main style={{ maxWidth: 680, margin: '100px auto', padding: 20 }}>
        <h1>Ideas worth sharing</h1>
        <PassageInteractions post={post} theme={theme} initialData={interactions}>
          {data.paragraphs.map((html, i) => <p key={i} data-paragraph={i} style={{fontSize: 18, lineHeight: 1.8, marginBottom: 32}} dangerouslySetInnerHTML={{__html: html}} />)}
        </PassageInteractions>
      </main>);
    `,
  },
  bundle: true, format: "esm", jsx: "automatic", outdir: dir, entryNames: "fixture",
  loader: { ".woff2": "dataurl", ".woff": "dataurl" },
});
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/fixture.json") return res.end(JSON.stringify(fixture));
  if (url.pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ reader: null, providers: [] }));
  }
  if (["/fixture.js", "/fixture.css"].includes(url.pathname)) {
    res.setHeader("Content-Type", url.pathname.endsWith(".js") ? "text/javascript" : "text/css");
    return res.end(await readFile(path.join(dir, url.pathname.slice(1))));
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true });
const errors = [];

async function select(page, multi = false) {
  const target = page.locator('[data-paragraph="19"]');
  await target.scrollIntoViewIfNeeded();
  await page.evaluate((multi) => {
    const start = document.querySelector('[data-paragraph="19"] em').firstChild;
    const end = document.querySelector(`[data-paragraph="${multi ? 20 : 19}"]`).lastChild;
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.textContent.length);
    start.parentElement.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    start.parentElement.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    document.dispatchEvent(new Event("selectionchange"));
  }, multi);
  await page.getByRole("button", { name: "Create citation", exact: true }).click();
  await page.getByRole("dialog", { name: "Cite this passage" }).waitFor();
}

async function assertTarget(page) {
  await page.waitForFunction(() => {
    const target = document.querySelector('[data-paragraph="19"]')?.getBoundingClientRect();
    const highlight = document.querySelector(".cited-passage-highlight")?.getBoundingClientRect();
    return target && highlight && highlight.top >= target.top && highlight.top < target.bottom && highlight.top >= 90 && highlight.top < innerHeight / 2;
  }, undefined, { timeout: 10000 });
  const target = await page.locator('[data-paragraph="19"]').boundingBox();
  const highlight = await page.locator(".cited-passage-highlight").first().boundingBox();
  assert.ok(highlight.y >= target.y && highlight.y < target.y + target.height, `highlight selects the second occurrence: ${JSON.stringify({ target, highlight })}`);
  assert.ok(highlight.y >= 90 && highlight.y < page.viewportSize().height / 2, "shared passage scrolls into view");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
}

try {
  for (const width of [1280, 390, 320]) {
    fixture = { paragraphs, revision: "original" };
    const context = await browser.newContext({ viewport: { width, height: 800 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/publication/post/caf%C3%A9?tracking=discard");
    await select(page);
    await page.getByRole("button", { name: "Copy citation", exact: true }).click();
    await page.getByText("Citation copied.", { exact: true }).waitFor();
    const citation = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(citation.startsWith(`“${quote}”\n— Ada Writer · Ideas worth sharing · Field Notes\n`));
    assert.equal(await page.getByRole("button", { name: "Copy link", exact: true }).count(), 0);
    assert.equal(await page.getByRole("link", { name: /Open cited passage/ }).count(), 0);
    const link = citation.split("\n").at(-1);
    assert.equal(new URL(link).pathname, "/publication/post/caf%C3%A9");
    assert.equal(new URL(link).search, "?view=standard");
    assert.equal(new URLSearchParams(new URL(link).hash.slice(1)).get("at"), "1");
    // A new browser context has no author/reader session or prior page state.
    const recipient = await browser.newContext({ viewport: { width, height: 800 } });
    const shared = await recipient.newPage();
    shared.setDefaultTimeout(10000);
    shared.on("pageerror", (error) => errors.push(error.message));
    await shared.goto(link);
    await assertTarget(shared);
    await shared.reload();
    await assertTarget(shared);
    await shared.setViewportSize({ width: width === 1280 ? 390 : 1280, height: 800 });
    await assertTarget(shared);
    if (process.env.MARGIN_BROWSER_SCREENSHOTS) await shared.screenshot({ path: path.join(process.env.MARGIN_BROWSER_SCREENSHOTS, `citation-${width}.png`) });
    await shared.getByRole("button", { name: "Dismiss citation highlight" }).click();
    assert.equal(await shared.locator(".cited-passage-highlight").count(), 0);
    // An ordinary heading hash clears the citation, and hash navigation restores it.
    await shared.evaluate(() => { location.hash = "ordinary-heading"; });
    await shared.evaluate((hash) => { location.hash = hash; }, new URL(link).hash);
    await assertTarget(shared);
    await recipient.close();
    await page.getByRole("button", { name: "Close citation", exact: true }).click();
    await select(page, true);
    await page.getByRole("button", { name: "Copy citation", exact: true }).click();
    await page.getByText("Citation copied.", { exact: true }).waitFor();
    const multiLink = (await page.evaluate(() => navigator.clipboard.readText())).split("\n").at(-1);
    await page.goto(multiLink);
    await assertTarget(page);
    const last = await page.locator(".cited-passage-highlight").last().boundingBox();
    const second = await page.locator('[data-paragraph="20"]').boundingBox();
    assert.ok(last.y >= second.y && last.y < second.y + second.height, "citation spans paragraphs and inline formatting");
    // The quote was removed. Preserve its text and do not highlight a different passage.
    fixture = { paragraphs: paragraphs.map((p) => p.replace("Café ideas", "Different ideas")), revision: "edited" };
    await page.reload();
    await page.getByText("This passage may have changed. The original quote is below.").waitFor();
    assert.equal(await page.locator(".cited-passage-highlight").count(), 0);
    assert.ok((await page.locator(".cited-passage-notice blockquote").textContent()).includes(quote));
    await context.close();
    console.log(`Citation create/copy/open/reload/resize/multi-paragraph/stale quote passed at ${width}px`);
  }
  fixture = { paragraphs, revision: "original" };
  const page = await browser.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("Permission denied"); } } }));
  await page.goto(base + "/publication/post/caf%C3%A9");
  await select(page);
  await page.getByRole("button", { name: "Copy citation", exact: true }).click();
  const manual = page.getByRole("textbox", { name: "Copy manually" });
  await manual.waitFor();
  assert.ok((await manual.inputValue()).includes(quote));
  await manual.focus();
  assert.equal(await manual.evaluate((node) => node.selectionEnd - node.selectionStart), (await manual.inputValue()).length);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.deepEqual(errors, []);
  console.log("Clipboard-denied manual fallback and Escape passed; no browser exceptions");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
