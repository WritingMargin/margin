import assert from "node:assert/strict";
import test from "node:test";
import { applyCompletion,getCompletions } from "./editor-completions.ts";

test("font suggestions filter by name, alias and style and insert editable content", () => {
  const text = 'A note [Font="dan';
  const context = getCompletions(text, text.length)!;
  assert.deepEqual(
    context.items.map((item) => item.id),
    ["dancing-script"],
  );
  const result = applyCompletion(text, context, context.items[0]);
  assert.equal(result.content, 'A note [Font="Dancing Script"]Text[/Font]');
  assert.equal(result.content.slice(result.start, result.end), "Text");
  assert.ok(getCompletions("[Fo", 3)!.items.length >= 10);
  assert.ok(
    getCompletions('[Font="hand', 11)!.items.some(
      (item) => item.id === "caveat",
    ),
  );
});

test("editing an existing font preserves content, closing tags and surrounding text", () => {
  const text = 'Before [Font="Caveat"]My **words**[/Font] after';
  const context = getCompletions(text, text.indexOf("Caveat") + 2)!;
  const result = applyCompletion(
    text,
    context,
    context.items.find((item) => item.id === "caveat")!,
  );
  assert.equal(result.content, text);
  assert.equal(result.start, text.indexOf("My"));
  assert.equal(result.start, result.end);
  const closing = getCompletions("[/Fo]", 4)!;
  assert.equal(
    applyCompletion("[/Fo]", closing, closing.items[0]).content,
    "[/Font]",
  );
});

test("commands complete slash queries, directives and interactive fence languages", () => {
  for (const [text, expected] of [
    ["/call", "callout"],
    ["::vid", "video"],
    ["```mer", "mermaid"],
    ["/illustration", "illustration"],
  ] as const) {
    const context = getCompletions(text, text.length)!;
    assert.equal(context.items[0].id, expected);
    const result = applyCompletion(
      text + "\nNext paragraph",
      context,
      context.items[0],
    );
    assert.ok(result.content.endsWith("\nNext paragraph"));
    assert.equal(result.content, context.items[0].text + "\nNext paragraph");
  }
  assert.equal(getCompletions("/not-a-command", 14)!.items.length, 0);
});

test("normal prose, selections, escaped syntax and code do not open suggestions", () => {
  for (const text of [
    "A sentence",
    "https://example.com/fo",
    "\\[Fo",
    "`[Fo",
    "```text\n[Fo",
    "~~~md\n/ca",
    "    /ca",
    "\t[Fo",
  ]) {
    assert.equal(getCompletions(text, text.length), null, text);
  }
  assert.equal(getCompletions("[Fo", 2, 3), null);
  const text = '```text\n[Font="Caveat"]\n```\n\n/Fo';
  assert.equal(getCompletions(text, text.length)!.items[0].id, "font");
});

test("bracket tags, their properties and closing tags have contextual suggestions", () => {
  const diagram = getCompletions("[Dia", 4)!;
  assert.equal(diagram.items[0].label, "Diagram");
  assert.match(
    applyCompletion("[Dia", diagram, diagram.items[0]).content,
    /^\[Diagram\]\nflowchart LR/,
  );
  const props = getCompletions("[Diagram ", 9)!;
  assert.deepEqual(
    props.items.map((item) => item.label),
    ["width", "height", "align", "wrap"],
  );
  const source = '[Diagram width="ha';
  const values = getCompletions(source, source.length)!;
  assert.equal(
    applyCompletion(source, values, values.items[0]).content,
    '[Diagram width="half"',
  );
  const close = "[Diagram]\nflowchart LR\n[/Dia";
  assert.deepEqual(
    getCompletions(close, close.length)!.items.map((item) => item.text),
    ["[/Diagram]"],
  );
  const body = "[Diagram]\nflowchart LR\nA[Fo";
  assert.equal(getCompletions(body, body.length), null);
  assert.ok(getCompletions("[", 1)!.items.some((item) => item.id === "chart"));
  const media = '[Image width="';
  assert.deepEqual(
    getCompletions(media, media.length)!.items.map((item) => item.label),
    ["full", "wide", "small"],
  );
  const afterCode = "```md\n[Diagram]\n```\n\n[Cha";
  assert.equal(
    getCompletions(afterCode, afterCode.length)!.items[0].id,
    "chart",
  );
});

test("code language suggestions create blocks and preserve existing bodies", () => {
  assert.ok(getCompletions("/c++", 4)!.items.some(item => item.id === "code-cpp"));
  assert.ok(getCompletions("/c#", 3)!.items.some(item => item.id === "code-csharp"));
  for (const query of ["/python", "```py"]) {
    const context = getCompletions(query, query.length)!;
    const item = context.items.find(item => item.id === "code-python")!;
    assert.ok(item);
    assert.equal(applyCompletion(query, context, item).content, "```python\nCode here\n```");
  }
  const article = "Before\n\n```js title=example\n  const x = 1;\n```\n\nAfter";
  const caret = article.indexOf("js") + 1;
  const context = getCompletions(article, caret)!;
  const item = context.items.find(item => item.id === "code-javascript")!;
  assert.equal(applyCompletion(article, context, item).content, article.replace("```js", "```javascript"));
});


test("illustration tags offer layout attributes and keep JSON payloads raw", () => {
  const property = '[Illustration width="';
  assert.ok(getCompletions(property, property.length)?.items.some(item => item.label === "half"));
  const payload = '[Illustration]\n{"description":"\n/ill';
  assert.equal(getCompletions(payload, payload.length), null);
});

test("model and Figma commands, tag names and attributes are discoverable", () => {
  for (const [query,id] of [["/model","model"], ["[Model","model"], ["/figma","figma"], ["[Fig","figma"]]) {
    const context = getCompletions(query, query.length)!;
    const item = context.items.find(item => item.id === id)!;
    const result = applyCompletion(query, context, item);
    assert.ok(result.content.startsWith(id === "model" ? "[Model " : "[Figma "));
    assert.equal(result.content.slice(result.start,result.end), item.placeholder);
  }
  for (const [query,option] of [['[Model cl','clip'], ['[Model width="ha','half'], ['[Figma ali','align'], ['[Link mode="fi','figma']]) {
    assert.ok(getCompletions(query, query.length)?.items.some(item => item.label === option));
  }
});
