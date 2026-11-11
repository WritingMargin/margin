import { z } from "zod";
import assert from "node:assert/strict";
import test from "node:test";
import { designSchema } from "../shared/design-config";
import { groupedPathFor, optionalDesignBlocks } from "../shared/design-groups";
import { designReference } from "../shared/design-reference";

test("completion descriptions cover every supported JSON field", () => {
  const paths = Object.keys(designSchema.shape).filter(key => !["homepage", "article", "guide", "comments"].includes(key));
  for (const section of ["homepage", "article", "guide", "comments"] as const) {
    paths.push(...Object.keys((designSchema.shape[section] instanceof z.ZodOptional ? designSchema.shape[section].unwrap() : designSchema.shape[section]).shape).map(key => `${section}.${key}`));
  }
  const entries = designReference.flatMap(group => group.fields);
  assert.deepEqual(entries.map(field => field.path).sort(), paths.filter(path => !optionalDesignBlocks.some(block => block.source === path)).map(groupedPathFor).sort());
  for (const field of entries) {
    assert.ok(field.description.length > 0, field.path);
    assert.ok(field.values && !field.values.includes("undefined"), field.path);
  }
  const field = (path: string) => entries.find(entry => entry.path === path)!;
  assert.equal(field("homepage.search.position").required, false);
  assert.equal(field("homepage.feed.layout").required, true);
  assert.equal(field("homepage.feed.pagination.size").values, "Integer · 1–100");
  assert.equal(field("homepage.search.position").values, '"inline" · "above" · "below"');
});
