import assert from "node:assert/strict";
import test from "node:test";
import { shareArticle } from "./blog/share";

test("sharing uses the public URL, cancellation stays quiet, and copy has a manual fallback", async () => {
  const url = "https://usefused.com/blog/post/welcome-to-fused-blogs";
  const calls: unknown[] = [];
  const browser = {
    share: async (data: ShareData) => {
      calls.push(data);
    },
    clipboard: {
      writeText: async (text: string) => {
        calls.push(text);
      },
    } as Clipboard,
  };
  assert.equal(await shareArticle("Welcome", url, browser), "shared");
  assert.deepEqual(calls, [{ title: "Welcome", url }]);
  browser.share = async () => {
    throw new DOMException("Cancelled", "AbortError");
  };
  assert.equal(await shareArticle("Welcome", url, browser), "cancelled");
  assert.equal(calls.length, 1);
  browser.share = async () => {
    throw new Error("Unavailable");
  };
  assert.equal(await shareArticle("Welcome", url, browser), "copied");
  assert.equal(calls[1], url);
  browser.clipboard.writeText = async () => {
    throw new Error("Permission denied");
  };
  assert.equal(await shareArticle("Welcome", url, browser), "manual");
});

test("social shares encode mounted URLs and titles without leaking extra query parameters", async () => {
  const { socialShareLinks } = await import("./blog/share");
  const title = "Words & ideas? #1 — café";
  const url =
    "https://example.com/publication/post/caf%C3%A9?tag=one&next=two#section";
  const links = socialShareLinks(title, url);
  assert.deepEqual(
    links.map((link) => link.label),
    ["X", "LinkedIn", "Facebook", "WhatsApp", "Email"],
  );
  for (const link of links) {
    const parsed = new URL(link.href);
    assert.equal(parsed.hash, "");
    assert.equal(parsed.searchParams.has("next"), false);
    if (link.label === "WhatsApp" || link.label === "Email") {
      assert.equal(
        parsed.searchParams.get(link.label === "Email" ? "body" : "text"),
        `${title}\n${url}`,
      );
    } else {
      assert.equal(
        parsed.searchParams.get(link.label === "Facebook" ? "u" : "url"),
        url,
      );
    }
    if (link.label === "X" || link.label === "Email")
      assert.equal(
        parsed.searchParams.get(link.label === "X" ? "text" : "subject"),
        title,
      );
  }
});

test("explicit copy does not invoke native sharing and supports unavailable clipboard", async () => {
  let copied = "";
  assert.equal(
    await shareArticle("Title", "https://example.com/post/test", {
      clipboard: {
        writeText: async (text) => {
          copied = text;
        },
      } as Clipboard,
    }),
    "copied",
  );
  assert.equal(copied, "https://example.com/post/test");
  assert.equal(await shareArticle("Title", copied, {}), "manual");
});

test("DEV sharing creates an unpublished draft with a safely quoted title and the complete article URL", async () => {
  const { devShareLink } = await import("./blog/share");
  const title = 'A "title": café\npublished: true';
  const url = "https://example.com/blog/post/caf%C3%A9?one=1&two=2#heading";
  const link = new URL(devShareLink(title, url));
  assert.equal(link.origin + link.pathname, "https://dev.to/new");
  assert.equal(link.searchParams.size, 1);
  const draft = link.searchParams.get("prefill")!;
  const lines = draft.split("\n");
  assert.equal(JSON.parse(lines[1].slice("title: ".length)), title);
  assert.equal(lines[2], "published: false");
  assert.equal(lines[5], url);
});

test("share menus follow the trigger and flip above when the viewport is tight", async () => {
  const { shareMenuPosition } = await import("./blog/share-position");
  const top = shareMenuPosition({ top: 40, bottom: 80, right: 880 }, { top: 40, bottom: 80, left: 780 }, { width: 240, height: 400 }, { width: 1000, height: 800 });
  assert.deepEqual(top, { left: -140, top: 48, bottom: undefined, maxHeight: 700 });
  const bottom = shareMenuPosition({ top: 700, bottom: 740, right: 880 }, { top: 700, bottom: 740, left: 780 }, { width: 240, height: 400 }, { width: 1000, height: 800 });
  assert.deepEqual(bottom, { left: -140, top: undefined, bottom: 48, maxHeight: 680 });
  const narrow = shareMenuPosition({ top: 100, bottom: 140, right: 90 }, { top: 100, bottom: 140, left: 0 }, { width: 240, height: 600 }, { width: 320, height: 600 });
  assert.equal(narrow.left, 12);
  assert.equal(narrow.top, 48);
  assert.equal(narrow.maxHeight, 440);
  const moved = shareMenuPosition({ top: 500, bottom: 540, right: 300 }, { top: 500, bottom: 540, left: 200 }, { width: 240, height: 600 }, { width: 320, height: 600 });
  assert.equal(moved.left, -140);
  assert.equal(moved.bottom, 48);
  assert.equal(moved.maxHeight, 480);
});
