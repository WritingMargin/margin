import { taggedBlock } from "../../shared/content-tags";
export const blockExamples = [
  {
    language: "poll",
    title: "Reader poll",
    tag: "PARTICIPATE",
    description: "Ask one question. Choose when results appear and when voting closes.",
    source: JSON.stringify({
      id: "your-question-1",
      title: "Which topic should we explore next?",
      type: "multiple-choice",
      resultsVisibility: "after-vote",
      options: [
        { id: "history", label: "The history" },
        { id: "future", label: "What comes next" },
      ],
    }, null, 2),
  },
  {
    language: "chart",
    title: "Interactive chart",
    tag: "DATA",
    description:
      "Compare measurements. Readers can switch chart styles, inspect values, and toggle series.",
    source: JSON.stringify(
      {
        title: "Latency as traffic grows",
        description:
          "Illustrative data: compare response times with and without a cache. Toggle a series to isolate it.",
        type: "line",
        xLabel: "Concurrent requests",
        yLabel: "Latency (ms)",
        labels: ["10", "50", "100", "250", "500"],
        series: [
          {
            name: "Without cache",
            values: [24, 42, 78, 160, 310],
            color: "#b8794f",
          },
          {
            name: "With cache",
            values: [12, 16, 21, 32, 48],
            color: "#537c68",
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    language: "mermaid",
    title: "Flowchart & diagrams",
    tag: "SYSTEMS",
    description:
      "Explain architecture with flowcharts, sequence diagrams, state machines, and more.",
    source:
      "flowchart LR\n  A[Client request] --> B{Cache hit?}\n  B -->|Yes| C[Return response]\n  B -->|No| D[Query database]\n  D --> E[Update cache]\n  E --> C",
  },
  {
    language: "scene",
    title: "Interactive 3D scene",
    tag: "SPATIAL",
    description:
      "Build a scene from geometry. Orbit, zoom, inspect objects, and explore the wireframe.",
    source: JSON.stringify(
      {
        title: "Explore the geometry",
        description:
          "Drag to orbit and scroll to zoom. Select an object below to inspect its position.",
        objects: [
          {
            shape: "box",
            label: "Compute node",
            position: [-2, 0, 0],
            color: "#648774",
          },
          {
            shape: "torus",
            label: "Message ring",
            position: [0, 0, 0],
            color: "#b8794f",
          },
          {
            shape: "sphere",
            label: "Data store",
            position: [2, 0, 0],
            color: "#668aaa",
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    language: "illustration",
    title: "Clickable illustration",
    tag: "EXPLORE",
    description: "Explain a drawing with numbered regions, detailed labels, zoom, and an expanded view.",
    source: JSON.stringify({
      title: "Explore a cross-section",
      description: "Select a numbered region to read its explanation.",
      width: 400, height: 300,
      shapes: [
        { path: "M80 60 H320 V240 H80 Z", fill: "#b66c60", region: "outer" },
        { path: "M140 110 H260 V190 H140 Z", fill: "#ebc5ab", region: "inner" },
      ],
      regions: [
        { id: "outer", label: "Outer layer", description: "The outer layer surrounds the core.", x: 105, y: 85 },
        { id: "inner", label: "Inner core", description: "The core sits inside the outer layer.", x: 200, y: 150 },
      ],
    }, null, 2),
  },
] as const;

export const fencedBlock = (language: string, source: string) =>
  `\n\n\`\`\`${language}\n${source}\n\`\`\`\n\n`;

export function taggedExample(language: typeof blockExamples[number]["language"]) {
  return taggedBlock(language, blockExamples.find(example => example.language === language)!.source);
}
