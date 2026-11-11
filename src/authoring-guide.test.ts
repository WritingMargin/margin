import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import { blockLanguages, parseBlock, type BlockLanguage } from "./blocks/schema";
import { expandContentTags } from "../shared/content-tags";
import { z } from "zod";
import { chartSchema, sceneSchema, pollSchema } from "./blocks/schema";
import { illustrationSchema } from "./blocks/illustration-schema";
const reference = new URL("../cli/skills/margin-authoring/references/", import.meta.url);

test("authoring reference interactive examples pass the production block parser", async () => {
  const markdown = await readFile(new URL("content.md", reference), "utf8");
  const examples: {language: string;source: string}[] = [];
  const parse = (content: string, depth: number) => {
    const tree = unified().use(remarkParse).parse(expandContentTags(content));
    visit(tree, "code", node => {
      if (blockLanguages.includes(node.lang as BlockLanguage)) examples.push({language:node.lang!,source:node.value});
      else if (depth === 0 && ["text", "markdown"].includes(node.lang || "")) parse(node.value, 1);
    });
  };
  parse(markdown, 0);
  assert.deepEqual(new Set(examples.map(item=>item.language)), new Set(blockLanguages));
  for (const example of examples) assert.equal(parseBlock(example.language as BlockLanguage, example.source).kind, example.language);
});

test("published schemas track renderer validators and every catalog example is valid", async () => {
  const catalog = JSON.parse(await readFile(new URL("blocks.json", reference), "utf8"));
  const schemas = {chart:chartSchema,scene:sceneSchema,illustration:illustrationSchema,poll:pollSchema};
  assert.deepEqual(catalog.blocks.map((block:any)=>block.language), [...blockLanguages]);
  for (const block of catalog.blocks) {
    assert.equal(parseBlock(block.language, block.example).kind, block.language);
    if (block.language !== "mermaid") assert.deepEqual(block.schema, z.toJSONSchema(schemas[block.language as keyof typeof schemas], {io:"input"}));
    assert.ok(block.rules.length, "structural schemas must be accompanied by semantic constraints");
  }
});

test("design resource matches editor validation and its examples are supported", async () => {
  const { designSchema } = await import("../shared/design-config");
  const { homepageSectionsSchema } = await import("../shared/template-sections");
  const catalog = JSON.parse(await readFile(new URL("design.json", reference), "utf8"));
  assert.deepEqual(catalog.schema, z.toJSONSchema(designSchema, { io: "input" }));
  assert.ok(designSchema.safeParse(catalog.defaults).success);
  const guide = await readFile(new URL("design.md", reference), "utf8");
  const tree = unified().use(remarkParse).parse(guide);
  let sections = 0;
  visit(tree, "code", node => {
    if (node.lang !== "json") return;
    const value = JSON.parse(node.value);
    if (Array.isArray(value)) {
      assert.ok(homepageSectionsSchema.safeParse(value).success);
      sections++;
    } else {
      const patch = value.input.changes;
      assert.ok(designSchema.safeParse({ ...catalog.defaults, homepage: { ...catalog.defaults.homepage, ...patch.homepage } }).success);
    }
  });
  assert.equal(sections, 1);
});
