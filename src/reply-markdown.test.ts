import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReplyMarkdown from "./ai/ReplyMarkdown";

const render = (content: string) =>
  renderToStaticMarkup(createElement(ReplyMarkdown, { content }));

test("assistant prose renders GFM as readable semantic content", () => {
  const html = render(
    [
      "## Decide what to compare",
      "",
      "1. Compare **sample size** and *follow-up*.",
      "   - [x] Describe the baseline.",
      "   - [ ] Check the `median`.",
      "",
      "> Distinguish ~~causality~~ association.",
      "",
      "| Result | Source |",
      "| --- | --- |",
      "| Five | [Study][paper] |",
      "",
      "[paper]: https://example.org/study",
      "",
      "```python",
      "print('<ten')",
      "```",
    ].join("\n"),
  );
  for (const pattern of [
    /<h2>Decide what to compare<\/h2>/,
    /<ol>/,
    /<strong>sample size<\/strong>/,
    /<em>follow-up<\/em>/,
    /<ul class="contains-task-list">/,
    /type="checkbox" disabled=""/,
    /checked=""/,
    /<code>median<\/code>/,
    /<blockquote>/,
    /<del>causality<\/del>/,
    /class="md-table-wrap"/,
    /<th>Result<\/th>/,
    /href="https:\/\/example\.org\/study" target="_blank" rel="noopener noreferrer"/,
    /<pre[^>]*><code class="language-python">/,
    /&lt;ten/,
  ])
    assert.match(html, pattern);
});

test("unsafe links and embedded resources remain inert", () => {
  const html = render(
    [
      "![Chart description](https://outside.invalid/pixel.png)",
      "",
      "[script](javascript:alert%281%29) [data](data:text/html,Hi) [local](/admin)",
      "[credentials](https://admin:secret@outside.invalid) [safe](http://example.org/)",
      "",
      "<script>alert('x')</script>",
      "",
      "<iframe src='https://outside.invalid'></iframe>",
      "",
      "~~~mermaid",
      "graph LR",
      "A --> B",
      "~~~",
    ].join("\n"),
  );
  assert.match(html, /Chart description/);
  assert.match(html, /href="http:\/\/example\.org\/"/);
  assert.doesNotMatch(
    html,
    /<(?:img|script|iframe|svg|video|audio|object|embed|link)\b|outside\.invalid|javascript:|data:text|href="\/admin"/,
  );
  assert.match(html, /<pre[^>]*><code class="language-mermaid">/);
});

test("completed scene replies offer copy and preview only for valid self-contained animations", async () => {
  const {default: SceneReply} = await import("./ai/SceneReply");
  const shape = {shape:"box",label:"Lift",keyframes:[{time:1,position:[0,1,0]}]};
  const renderScene = (source: string) => createElement(SceneReply,{source,copied:false,copy:()=>{}});
  const reply = (object: object) => renderToStaticMarkup(createElement(ReplyMarkdown, {
    content: "```scene\n"+JSON.stringify({title:"Lift",objects:[object]})+"\n```",renderScene,
  }));
  const html = reply(shape);
  assert.match(html,/Copy animation/);
  assert.match(html,/Preview animation/);
  assert.match(html,/\[Scene\]/);
  assert.doesNotMatch(reply({...shape,keyframes:[]}),/Copy animation/);
  assert.doesNotMatch(reply({...shape,shape:"model",src:"https:\/\/example.test\/asset.glb"}),/Copy animation|<iframe|<img/);
});
