import assert from "node:assert/strict";
import test from "node:test";
import { bundledTemplateCatalog, parseTemplateCatalog } from "../shared/template-catalog";
import { applySectionPreset } from "../shared/design-presets";
import { defaultTheme } from "../shared/types";

test("Central catalogs support new templates without changing the engine or a saved design", () => {
  const remote = structuredClone(bundledTemplateCatalog);
  remote.version = "2026-11-01.1";
  remote.homepage.push({ ...remote.homepage[0], id: "new-journal", name: "New Journal" });
  remote.writing.push({ id: "interview", name: "Interview", description: "Questions and answers.", content: "## Introduction\n\nIntroduce the guest.\n\n## Questions\n\nAsk a question." });
  const parsed = parseTemplateCatalog(remote);
  assert.ok(parsed);
  assert.equal(parsed.writing.at(-1)?.id, "interview");
  const saved = structuredClone(defaultTheme);
  const selected = applySectionPreset(saved, "homepage", parsed.homepage.at(-1)!.design);
  assert.deepEqual(saved, defaultTheme);
  assert.deepEqual(selected.article, saved.article);
  assert.equal(selected.name, saved.name);
});

test("catalog validation rejects incompatible schemas and publication-changing config", () => {
  for (const mutate of [
    (value: any) => { value.schemaVersion = 999; },
    (value: any) => { value.homepage[0].design.name = "Replace the publication"; },
    (value: any) => { value.homepage[0].design.title = "Replace the welcome"; },
    (value: any) => { value.article[0].design.layout = "grid"; },
    (value: any) => { value.article[0].design.background = "red;url(https://bad.example)"; },
    (value: any) => { value.homepage[0].design.font = "unsupported"; },
    (value: any) => { value.writing.push(value.writing[0]); },
    (value: any) => { value.homepage = []; },
    (value: any) => { value.writing[0].content = " "; },
    (value: any) => { value.writing[0].content = "x".repeat(20001); },
    (value: any) => { value.version = ""; },
  ]) {
    const invalid = structuredClone(bundledTemplateCatalog);
    mutate(invalid);
    assert.equal(parseTemplateCatalog(invalid), null);
  }
  assert.equal(parseTemplateCatalog(null), null);
  assert.deepEqual(parseTemplateCatalog(bundledTemplateCatalog), bundledTemplateCatalog);
});
