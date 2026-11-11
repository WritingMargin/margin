import assert from "node:assert/strict";
import test from "node:test";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { highlightCode } from "./code/highlight";
import { codeFence, selectedCode, replaceCode } from "./editor/code-blocks";
import { indentCode, tabCode } from "./editor/code-indent";
import { codeLanguage } from "../shared/code-languages";
import { codeNoWrap, codeWrapMeta } from "./code/code-wrap";
const parser = unified().use(remarkParse);

test("code fence wrapping is opt-in for horizontal scrolling", () => {
  assert.equal(codeNoWrap("title=example nowrap"), true);
  assert.equal(codeNoWrap("title=nowrap"), false);
  assert.equal(codeWrapMeta("title=example", true), "title=example nowrap");
  assert.equal(codeWrapMeta("title=example nowrap", false), "title=example");
  assert.equal(codeWrapMeta("nowrap", true), "nowrap");
});

test("code insertion and language edits preserve content and surrounding prose", () => {
  const source = '\tconst text = "<script>";\n  console.log(text);\n';
  const article = "Before\n\n" + source + "\nAfter";
  const selection = selectedCode(article, 8, 8 + source.length);
  const inserted = replaceCode(article, selection, source, "javascript");
  const existing = selectedCode(
    inserted.content,
    inserted.start + 20,
    inserted.start + 20,
  );
  assert.equal(existing.existing, true);
  assert.equal(existing.source, source);
  const edited = replaceCode(
    inserted.content,
    existing,
    existing.source,
    "typescript",
  );
  assert.equal(
    edited.content,
    inserted.content.replace("```javascript", "```typescript"),
  );
  assert.throws(
    () => replaceCode("X" + inserted.content, existing, source, "text"),
    /article changed/,
  );
});

test("code fences round-trip embedded fences, whitespace, and empty code", () => {
  for (const source of [
    "",
    "  indented\n\tvalue\n\n",
    "```js\nconst x = 1;\n```",
    "<script>alert(1)</script>",
  ]) {
    const node = parser.parse(codeFence(source, "text")).children[0];
    assert.equal(node.type, "code");
    assert.equal(node.type === "code" && node.value, source);
  }
  const article =
    "Before\n\n~~~py title=example\n  print('hello')\n~~~\n\nAfter";
  const selected = selectedCode(
    article,
    article.indexOf("print"),
    article.indexOf("print") + 5,
  );
  assert.equal(selected.source, "  print('hello')");
  assert.equal(selected.meta, "title=example");
  const updated = replaceCode(article, selected, selected.source, "python");
  assert.equal(
    updated.content,
    "Before\n\n```python title=example\n  print('hello')\n```\n\nAfter",
  );
});

test("nested code cannot be accidentally wrapped into a second fence", () => {
  const article = "> ```js\n> const x = 1;\n> ```";
  const selected = selectedCode(
    article,
    article.indexOf("const"),
    article.indexOf("const"),
  );
  assert.throws(
    () => replaceCode(article, selected, "", "text"),
    /lists or quotes/,
  );
});

test("indented fences and unfenced code retain their semantic indentation when edited", () => {
  for (const block of [
    "  ```py\n    print('hello')\n  ```",
    "    if ready:\n      print('hello')",
  ]) {
    const article = "Before\n\n" + block + "\n\nAfter";
    const caret = article.indexOf("print");
    const selection = selectedCode(article, caret, caret);
    const result = replaceCode(article, selection, selection.source, "python");
    assert.equal(
      selectedCode(result.content, result.start + 12, result.start + 12).source,
      selection.source,
    );
    assert.ok(result.content.startsWith("Before\n\n```python\n"));
    assert.ok(result.content.endsWith("\n```\n\nAfter"));
  }
});

test("indentation controls retain selections and exclude the following line", () => {
  const source = "one\n  two\nthree";
  const indented = indentCode(source, 0, 10);
  assert.equal(indented.content, "  one\n    two\nthree");
  assert.equal(
    indented.content.slice(indented.start, indented.end),
    "one\n    two\n",
  );
  assert.equal(
    indentCode(indented.content, indented.start, indented.end, true).content,
    source,
  );
  assert.deepEqual(indentCode("\tvalue", 1, 1, true), {
    content: "value",
    start: 0,
    end: 0,
  });
  assert.equal(indentCode("no indent", 0, 0, true).content, "no indent");
});

test("highlighting handles language aliases, detection, and safe plain text fallback", () => {
  assert.equal(codeLanguage("TSX"), "typescript");
  assert.equal(codeLanguage("constructor"), "constructor");
  assert.match(
    highlightCode("const count: number = 1;", "ts").html,
    /hljs-keyword/,
  );
  assert.equal(
    highlightCode('def greet(name):\n    print("Hello", name)\n    return True')
      .language,
    "python",
  );
  assert.equal(
    highlightCode('{"enabled": true, "count": 42}').language,
    "json",
  );
  assert.equal(highlightCode("Just a few ordinary words.").language, "text");
  for (const language of ["xml", "text", "unknown", "auto"]) {
    const result = highlightCode('<script>alert("hello")</script>', language);
    assert.doesNotMatch(result.html, /<script>/);
    assert.match(result.html, /&lt;/);
  }
  const large = "<".repeat(50001);
  assert.equal(highlightCode(large).html, "&lt;".repeat(50001));
  assert.equal(highlightCode(large).language, "text");
});

test("Tab inserts at the caret and indents selections without replacing code", () => {
  assert.deepEqual(tabCode("call()", 5, 5), {
    content: "call(  )",
    start: 7,
    end: 7,
  });
  assert.deepEqual(tabCode("", 0, 0), { content: "  ", start: 2, end: 2 });
  const code = "one\ntwo\nthree";
  const indented = tabCode(code, 0, 8);
  assert.equal(indented.content, "  one\n  two\nthree");
  assert.equal(
    tabCode(indented.content, indented.start, indented.end, true).content,
    code,
  );
  assert.deepEqual(tabCode("  one", 2, 2, true), {
    content: "one",
    start: 0,
    end: 0,
  });
  assert.deepEqual(tabCode("one", 0, 0, true), {
    content: "one",
    start: 0,
    end: 0,
  });
});
