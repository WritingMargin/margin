import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseDesignConfig } from "../shared/design-config";
import { defaultTheme } from "../shared/types";

test("design JSON round-trips frontend and backend defaults", () => {
  assert.deepEqual(parseDesignConfig(JSON.stringify(defaultTheme)), { theme: defaultTheme, error: "" });
  const backend = JSON.parse(readFileSync(new URL("../backend/internal/blog/default-theme.json", import.meta.url), "utf8"));
  assert.deepEqual(parseDesignConfig(JSON.stringify(backend)), { theme: backend, error: "" });
});

test("design JSON preserves all sections and supports disabling artwork", () => {
  const theme = structuredClone(defaultTheme);
  theme.homepage.showArtwork = false;
  theme.homepage.title = "Fused Engineering Blog";
  theme.article.font = "playfair";
  theme.comments.visible = false;
  assert.deepEqual(parseDesignConfig(JSON.stringify(theme)).theme, theme);
});

test("invalid or incomplete JSON cannot replace the current design", () => {
  for (const text of ["{", "null", "[]", "{}", JSON.stringify({ ...defaultTheme, homepage: null })]) {
    const result = parseDesignConfig(text);
    assert.equal(result.theme, null);
    assert.ok(result.error);
  }
});

test("unknown fields and unsafe values are rejected with their section path", () => {
  const invalid = [
    { font: "unknown" }, { radius: 33 }, { radius: 1.5 }, { pageSize: 0 },
    { showArtwork: "false" }, { artworkImage: "javascript:alert(1)" },
    { title: "a".repeat(201) }, { unknown: true },
  ];
  for (const fields of invalid) {
    const result = parseDesignConfig(JSON.stringify({ ...defaultTheme, homepage: { ...defaultTheme.homepage, ...fields } }));
    assert.equal(result.theme, null);
    assert.match(result.error, /^homepage/);
  }
  assert.equal(parseDesignConfig(JSON.stringify({ ...defaultTheme, extra: true })).theme, null);
  assert.equal(parseDesignConfig(JSON.stringify({ ...defaultTheme, background: "red" })).theme, null);
  for (const url of ["javascript:alert(1)", "//evil.example", "https://user:pass@example.test", "https://"]) {
    assert.equal(parseDesignConfig(JSON.stringify({ ...defaultTheme, footerLinks: [{ label: "Unsafe", url }] })).theme, null);
  }
});
