import assert from "node:assert/strict";
import test from "node:test";
import { domainOverride } from "./settings/domain-url";

test("full blog addresses preserve the configured mount exactly once", () => {
  assert.equal(domainOverride("https://usefused.com/blog", "/blog"), "https://usefused.com/");
  assert.equal(domainOverride(" usefused.com/blog/ ", "/blog"), "https://usefused.com/");
  assert.equal(domainOverride("https://example.com/team/blog", "/team/blog"), "https://example.com/");
  assert.equal(domainOverride("https://example.com", ""), "https://example.com");
  assert.equal(domainOverride("  ", "/blog"), "");
});

test("unsupported paths and unsafe URL parts remain subject to server validation", () => {
  assert.equal(domainOverride("https://example.com/other", "/blog"), "https://example.com/other");
  assert.equal(domainOverride("https://example.com/blog", ""), "https://example.com/blog");
  for (const value of ["https://user:secret@example.com/blog", "http://example.com/blog", "https://example.com/blog?x=1", "https://example.com/blog#fragment"]) {
    assert.equal(domainOverride(value, "/blog"), value.replace("/blog", "/"));
  }
});
