import assert from "node:assert/strict";
import test from "node:test";
import { citationText, citationURL, createPassageCitation, parsePassageCitation, resolveCitationOccurrence } from "./blog/passage-citation";

test("citation links preserve Unicode and mounted article paths without sharing unrelated query parameters", () => {
  const quote = "Café ☕ — A&B + #1 <script>\"hello\"</script>";
  const citation = createPassageCitation(`Before ${quote} after`, quote, 0, "revision-1")!;
  const url = new URL(citationURL("https://example.com/journal/post/caf%C3%A9?preview=private#old-heading", citation));
  assert.equal(url.pathname, "/journal/post/caf%C3%A9");
  assert.equal(url.search, "?view=standard");
  assert.deepEqual(parsePassageCitation(url.hash), citation);
  assert.equal(resolveCitationOccurrence(`Before ${quote} after`, citation, "revision-1"), 0);
  assert.equal(citationText(quote, "An article", "A journal", "A. Writer", url.href), `“${quote}”\n— A. Writer · An article · A journal\n${url.href}`);
});

test("repeated passages resolve to the selected occurrence and follow context after edits", () => {
  const quote = "The same sentence.";
  const text = `First: ${quote} ${"Introduction. ".repeat(12)} Target: ${quote} Closing thoughts.`;
  const citation = createPassageCitation(text, quote, 1, "old")!;
  assert.equal(resolveCitationOccurrence(text, citation, "old"), 1);
  const edited = `${quote} New introduction. ${text}`;
  assert.equal(resolveCitationOccurrence(edited, citation, "new"), 2);
  assert.equal(resolveCitationOccurrence(text.replace("First: " + quote, "Changed introduction."), citation, "new"), 0);
  assert.equal(resolveCitationOccurrence("No such sentence remains.", citation, "new"), null);
  assert.equal(resolveCitationOccurrence(`Elsewhere ${quote} Also ${quote}`, citation, "new"), null);
});

test("unique exact quotes survive surrounding edits but changed quotes are not guessed", () => {
  const citation = createPassageCitation("Before. Selected words. After.", "Selected words.", 0)!;
  assert.equal(resolveCitationOccurrence("New introduction. Selected words. New ending.", citation), 0);
  assert.equal(resolveCitationOccurrence("Before. Different words. After.", citation), null);
  assert.equal(createPassageCitation("Some words", "Missing words", 0), null);
  assert.equal(createPassageCitation("Some words", "Some", 1), null);
});

test("invalid and oversized fragments are ignored safely", () => {
  for (const hash of ["", "#heading", "#cite=2&quote=hello&at=0", "#cite=1&quote=&at=0", "#cite=1&quote=hello&at=-1", "#cite=1&quote=hello&at=Infinity", "#cite=1&quote=hello&at=1.5", "#cite=1&quote=hello&at=999999999999999999", "#cite=1&quote=hello&at=0&before=" + "a".repeat(65), "#cite=1&quote=" + "a".repeat(2001) + "&at=0", "#" + "a".repeat(30000)]) {
    assert.equal(parsePassageCitation(hash), null, hash.slice(0, 80));
  }
});
