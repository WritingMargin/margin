import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { CompletionContext, insertCompletionText } from "@codemirror/autocomplete";
import { completeDesignJSON, designHelpAt } from "./designer/json-completion";
import { defaultTheme } from "../shared/types";
import { parseDesignConfig, serializeDesignConfig } from "../shared/design-config";

function at(marked: string) {
  const pos = marked.indexOf("|");
  assert.ok(pos >= 0);
  const state = EditorState.create({ doc: marked.replace("|", ""), selection: { anchor: pos }, extensions: [json()] });
  return { state, result: completeDesignJSON(new CompletionContext(state, pos, true)) };
}
function labels(marked: string) { return at(marked).result?.options.map(option => JSON.parse(option.label)) ?? []; }
function insert(marked: string, label: string) {
  const { state: initial, result } = at(marked);
  assert.ok(result);
  const completion = result.options.find(option => option.label === JSON.stringify(label));
  assert.ok(completion, label);
  let state = initial;
  if (typeof completion.apply === "function") {
    const view = { get state() { return state; }, dispatch(spec: TransactionSpec) { state = state.update(spec).state; } } as unknown as EditorView;
    completion.apply(view, completion, result.from, result.to ?? initial.selection.main.head);
  } else {
    state = state.update(insertCompletionText(state, completion.apply ?? completion.label, result.from, result.to ?? state.selection.main.head)).state;
  }
  return state;
}

test("key suggestions follow grouped objects and omit existing siblings", () => {
  assert.deepEqual(labels('{|}'), ["publication", "style", "footer", "homepage", "article", "guide", "comments"]);
  assert.ok(labels('{"homepage":{ | }}').includes("search"));
  assert.deepEqual(labels('{"homepage":{"search":{"position":"above", "|"}}}'), []);
  assert.ok(labels('{"article":{"body":{ | }}}').includes("size"));
  assert.ok(labels('{"comments":{"form":{ | }}}').includes("button"));
  assert.deepEqual(labels('{"unknown":{ | }}'), []);
  assert.deepEqual(labels('{"homepage":[{ | }]}'), []);
});

test("enum and boolean suggestions work in grouped values, not arbitrary strings", () => {
  assert.deepEqual(labels('{"homepage":{"search":{"position":"ab|"}}}'), ["inline", "above", "below"]);
  assert.deepEqual(labels('{"homepage":{"feed":{"count":f|}}}'), [true, false]);
  assert.deepEqual(labels('{"homepage":{"search":{"position": |}}}'), ["inline", "above", "below"]);
  assert.deepEqual(labels('{"homepage":{"hero":{"title":"say position |"}}}'), []);
  assert.deepEqual(labels('{"homepage":{"unknown": |}}'), []);
  assert.deepEqual(labels('{"homepage":{}|}'), []);
});

test("completion preserves values, replaces whole tokens, and avoids duplicate punctuation", () => {
  const wrap = (content: string) => '{"homepage":{"search":{' + content + '}}}';
  const value = (content: string, key: string) => JSON.parse(insert(wrap(content), key).doc.toString()).homepage.search;
  assert.deepEqual(value('"pos|ition":"below"', "position"), { position: "below" });
  assert.deepEqual(value('"position":"ab|"', "above"), { position: "above" });
  assert.deepEqual(value('"po|"', "position"), { position: "inline" });
  assert.deepEqual(value('"po|"\n "visible":false', "position"), { position: "inline", visible: false });
  assert.deepEqual(value('"po|", "visible":false', "position"), { position: "inline", visible: false });
  assert.deepEqual(value(' | "visible":false', "position"), { position: "inline", visible: false });
});

test("inserted groups use valid objects and their nested values expose choices", () => {
  const base = JSON.parse(serializeDesignConfig(defaultTheme));
  delete base.homepage.search;
  const doc = JSON.stringify(base, null, 2).replace('"homepage": {', '"homepage": {\n    "se|",');
  const state = insert(doc, "search");
  assert.equal(parseDesignConfig(state.doc.toString()).error, "");
  assert.deepEqual(JSON.parse(state.doc.toString()).homepage.search, { position: "inline" });
  const nested = insert('{"homepage":{"search":{"po|"}}}', "position");
  const next = completeDesignJSON(new CompletionContext(nested, nested.selection.main.head, false));
  assert.deepEqual(next?.options.map(option => JSON.parse(option.label)), ["inline", "above", "below"]);
  assert.equal(next?.filter, false);
});

test("caret help describes grouped settings and numeric limits", () => {
  assert.match(designHelpAt(at('{"homepage":{"feed":{"pagination":{"size":2|0}}}}').state), /1–100/);
  assert.match(designHelpAt(at('{"homepage":{"hero":{"title":"A|"}}}').state), /Welcome headline/);
  assert.match(designHelpAt(at('{"article":{"style":{"typography":{"headingFont":"se|rif"}}}}').state), /Omit to use this section/);
  assert.match(designHelpAt(at('{"homepage":{"search":{|}}}').state), /Search/);
});

test("nested component and binding completions follow their discriminated schema", () => {
  const hero = labels('{"homepage":{"sections":[{"component":"hero", |}]}}');
  assert.deepEqual(hero.sort(), ["id", "props", "variant"]);
  assert.deepEqual(labels('{"homepage":{"sections":[{"component":"post-feed", |}]}}'), ["id"]);
  assert.deepEqual(labels('{"homepage":{"sections":[{"component":"hero","variant":"|"}]}}'), ["split", "centered", "image-background"]);
  const bound = '{"homepage":{"sections":[{"component":"hero","props":{"image":{"bind":"|"}}}]}}';
  assert.deepEqual(labels(bound), ["blog.logo", "homepage.image", "content.cover"]);
  const result = at('{"homepage":{"sections":[{"id":"stories","component":"post-feed"}, |]}}').result;
  assert.deepEqual(result?.options.map(option => option.label), ["hero", "featured-posts"]);
});

test("inserting sections seeds a valid feed rather than a string", () => {
  const doc = serializeDesignConfig(defaultTheme).replace('"homepage": {', '"homepage": {\n    "sec|",');
  const state = insert(doc, "sections");
  assert.equal(parseDesignConfig(state.doc.toString()).error, "");
  assert.deepEqual(JSON.parse(state.doc.toString()).homepage.sections, [{ id: "stories", component: "post-feed" }]);
});

 test("contents design offers nested settings and style choices", () => {
  assert.ok(labels('{"article":{"tableOfContents":{ | }}}').includes("maxDepth"));
  assert.deepEqual(labels('{"guide":{"tableOfContents":{"style":|}}}'), ["plain", "outlined", "filled"]);
});
