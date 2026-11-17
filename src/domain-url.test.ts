import assert from "node:assert/strict";
import test from "node:test";
import { domainOverride, setupAddress } from "./settings/domain-url";

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

test("setup accepts a full URL, domain or path on the current domain", () => {
  const current = "https://example.com/existing";
  assert.equal(setupAddress(" blog.example.com ", current), "https://blog.example.com");
  assert.equal(setupAddress("example.com/blog", current), "https://example.com/blog");
  assert.equal(setupAddress("/blog", current), "https://example.com/blog");
  assert.equal(setupAddress("https://other.example/blog", current), "https://other.example/blog");
  assert.equal(setupAddress("", current), "");
});

test("setup does not silently repair unsafe addresses", () => {
  for (const raw of ["//other.example", "https://user:pass@example.com", "http://example.com", "https://example.com/blog?x=1", "https://example.com/#hash"]) {
    assert.equal(setupAddress(raw, "https://example.com"), raw);
  }
  assert.equal(setupAddress("/blog", "invalid"), "/blog");
});
