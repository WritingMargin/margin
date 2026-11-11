import assert from "node:assert/strict";
import test from "node:test";
import { blockExamples } from "./examples";
import { parseBlock } from "./schema";

test("all editor examples are valid rich blocks", () => {
  for (const example of blockExamples)
    assert.equal(
      parseBlock(example.language, example.source).kind,
      example.language,
    );
});
test("polls require stable IDs, unique options, and reasons only for agree/disagree", () => {
  const choice = { id: "roadmap-1", title: "What next?", type: "multiple-choice", options: [
    { id: "a", label: "A" }, { id: "b", label: "B" },
  ] };
  assert.equal(parseBlock("poll", JSON.stringify(choice)).kind, "poll");
  assert.throws(() => parseBlock("poll", JSON.stringify({ ...choice, options: [choice.options[0], choice.options[0]] })), /unique/);
  assert.throws(() => parseBlock("poll", JSON.stringify({ ...choice, id: "Bad ID" })), /stable lowercase/);
  assert.throws(() => parseBlock("poll", JSON.stringify({ ...choice, allowReason: true })), /agree\/disagree/);
  assert.equal(parseBlock("poll", JSON.stringify({ id: "take-1", title: "Do you agree?", type: "agree-disagree", allowReason: true })).kind, "poll");
  assert.equal(parseBlock("poll", JSON.stringify({ ...choice, resultsVisibility: "after-close", closesAt: "2030-01-01T12:00:00Z" })).kind, "poll");
  assert.throws(() => parseBlock("poll", JSON.stringify({ ...choice, resultsVisibility: "after-close" })), /close date/);
  assert.throws(() => parseBlock("poll", JSON.stringify({ ...choice, closesAt: "tomorrow" })), /Invalid/);
});
test("chart data rejects mismatched lengths, duplicate names, and non-finite values", () => {
  const chart = {
    title: "Measurements",
    labels: ["A", "B"],
    series: [{ name: "Latency", values: [1] }],
  };
  assert.throws(
    () => parseBlock("chart", JSON.stringify(chart)),
    /one value per label/,
  );
  chart.series[0].values.push(2);
  chart.series.push(chart.series[0]);
  assert.throws(() => parseBlock("chart", JSON.stringify(chart)), /unique/);
  assert.throws(() =>
    parseBlock(
      "chart",
      '{"title":"Bad","labels":["A"],"series":[{"name":"X","values":[1e999]}]}',
    ),
  );
});
test("blocks reject executable properties, unsupported geometry, and excessive workload", () => {
  const scene = { title: "Scene", objects: [{ label: "Node", shape: "box" }] };
  assert.throws(
    () =>
      parseBlock("scene", JSON.stringify({ ...scene, onClick: "alert(1)" })),
    /Unrecognized/,
  );
  assert.throws(() =>
    parseBlock(
      "scene",
      JSON.stringify({
        ...scene,
        objects: [{ label: "Node", shape: "script" }],
      }),
    ),
  );
  assert.throws(() =>
    parseBlock(
      "scene",
      JSON.stringify({ ...scene, objects: Array(41).fill(scene.objects[0]) }),
    ),
  );
  assert.throws(() =>
    parseBlock(
      "scene",
      JSON.stringify({
        ...scene,
        objects: [
          { label: "Node", shape: "box", color: "url(https://example.com)" },
        ],
      }),
    ),
  );
  assert.throws(() => parseBlock("chart", " ".repeat(50_001)), /under 50,000/);
});
test("Mermaid cannot override renderer configuration", () => {
  assert.throws(
    () =>
      parseBlock(
        "mermaid",
        '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\nA-->B',
      ),
    /configuration/,
  );
  assert.throws(
    () =>
      parseBlock(
        "mermaid",
        "---\nconfig:\n  securityLevel: loose\n---\nflowchart LR\nA-->B",
      ),
    /configuration/,
  );
  assert.throws(() => parseBlock("mermaid", " "), /definition/);
  assert.equal(
    parseBlock("mermaid", "sequenceDiagram\nAlice->>Bob: Hello").kind,
    "mermaid",
  );
});
test("malformed JSON gives authors an actionable error and scene defaults are stable", () => {
  assert.throws(() => parseBlock("chart", '{"title":'), /valid JSON/);
  const result = parseBlock(
    "scene",
    '{"title":"Scene","objects":[{"shape":"box","label":"Node"}]}',
  );
  assert.equal(result.kind, "scene");
  if (result.kind === "scene") {
    assert.deepEqual(result.spec.objects[0].position, [0, 0, 0]);
    assert.equal(result.spec.autoRotate, false);
  }
});
