// Built into Central's checked-in static assets by packaging/build-home-demo.mjs.
// Reuse the production article renderers so the homepage demonstrates Margin itself.
import { createRoot } from "react-dom/client";
import Scene from "../blocks/Scene";
import Chart from "../blocks/Chart";
import Notebook from "../blocks/Notebook";
import { sceneSchema, chartSchema } from "../blocks/schema";
import "../blocks/blocks.css";
import "../blocks/notebook.css";

const scene = sceneSchema.parse({
  title: "An idea, seen from every side",
  background: "#eef1e8",
  autoRotate: false,
  objects: [
    {
      shape: "sphere",
      label: "The idea",
      color: "#a6b798",
      position: [-1.8, 0.2, 0],
      description:
        "An idea starts with someone noticing something. Your perspective gives it a shape.",
    },
    {
      shape: "torus",
      label: "The conversation",
      color: "#c58f6b",
      position: [0, 0.1, 0],
      rotation: [0.3, 0.4, 0],
      description:
        "A conversation moves around the idea. Turn the ring to see how a different angle changes what you notice.",
    },
    {
      shape: "box",
      label: "A new perspective",
      color: "#8a9eaf",
      position: [1.8, 0, 0],
      rotation: [0.15, 0.4, 0],
      description:
        "A reader brings something of their own. A question or correction can change the shape of what comes next.",
    },
  ],
});
const chart = chartSchema.parse({
  title: "Where readers pause",
  type: "bar",
  xLabel: "Article section",
  yLabel: "Time (seconds)",
  labels: ["Opening", "3D scene", "Conversation", "Notebook"],
  series: [
    { name: "First visit", values: [24, 65, 48, 42], color: "#718a68" },
    { name: "Return visit", values: [12, 40, 62, 58], color: "#bd8c69" },
  ],
});
const notebook = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    kernelspec: {
      display_name: "Python 3",
      language: "python",
      name: "python3",
    },
  },
  cells: [
    {
      id: "intro",
      cell_type: "markdown",
      metadata: {},
      source: [
        "### Follow the thought\n",
        "These are **illustrative figures**, not visitor analytics. The code and saved output stay beside the explanation.",
      ],
    },
    {
      id: "calculation",
      cell_type: "code",
      metadata: {},
      execution_count: 1,
      source: [
        "seconds = [24, 65, 48, 42]\n",
        "sections = ['Opening', '3D scene', 'Conversation', 'Notebook']\n",
        "for section, duration in zip(sections, seconds):\n",
        "    print(f'{section}: {duration / sum(seconds):.0%} of reading time')",
      ],
      outputs: [
        {
          output_type: "stream",
          name: "stdout",
          text: [
            "Opening: 13% of reading time\n3D scene: 36% of reading time\nConversation: 27% of reading time\nNotebook: 23% of reading time\n",
          ],
        },
      ],
    },
  ],
});
export function mountDemoBlock(element: HTMLElement) {
  const kind = element.dataset.demoBlock;
  const root = createRoot(element);
  if (kind === "scene") root.render(<Scene spec={scene} />);
  else if (kind === "chart") root.render(<Chart spec={chart} />);
  else if (kind === "notebook") root.render(<Notebook source={notebook} />);
  else throw new Error("Unknown demo block");
}
