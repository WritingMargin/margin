import { useState } from "react";
import { checklistExample } from "../../shared/checklist";
import Select from "../components/Select";
import { Columns2,Plus } from "lucide-react";
import { taggedBlock } from "../../shared/content-tags";
import { tabsExample } from "../../shared/tabs";
import { blockExamples, taggedExample } from "./examples";
import {
sizeWidget,
textVisualRow,
widgetRow,
type WidgetWidth,
} from "./layout";

import DiagramAssetPicker from "./DiagramAssetPicker";
import { useBlockPicker } from "./useBlockPicker";
export default function BlockPicker(
  props: Parameters<typeof useBlockPicker>[0],
) {
  const state = useBlockPicker(props);
  const [floatingChecklist, setFloatingChecklist] = useState(false);
  const [pollResultTiming, setPollResultTiming] = useState<"after-vote" | "after-close">("after-vote");
  const [pollClosesAt, setPollClosesAt] = useState("");
  const {
    onInsert,
    width,
    setWidth,
    height,
    setHeight,
    align,
    setAlign,
    wrap,
    setWrap,
  } = state;
  function insertSized(content: string) {
    onInsert(width === "full" && height === "auto"
      ? content
      : sizeWidget(content, width, height, align, wrap));
  }
  function insertBlock(language: string, source: string) {
    insertSized(taggedBlock(language, source));
  }
  const pollCloseDate = pollClosesAt ? new Date(pollClosesAt) : null;
  const validPollClose = !!pollCloseDate && Number.isFinite(pollCloseDate.getTime()) && pollCloseDate.getTime() > Date.now();
  return (
    <>
      <div className="widget-size-controls">
        <label>
          Widget width
          <Select
            value={width}
            onChange={(e) => {
              setWidth(e.target.value as WidgetWidth);
              if (e.target.value === "full") setWrap(false);
            }}
          >
            <option value="full">Full width</option>
            <option value="two-thirds">Two thirds</option>
            <option value="half">Half width</option>
            <option value="third">One third</option>
          </Select>
        </label>
        <label>
          Visual height
          <Select value={height} onChange={(e) => setHeight(e.target.value)}>
            <option value="auto">Automatic</option>
            <option value="240">Compact · 240px</option>
            <option value="360">Medium · 360px</option>
            <option value="480">Large · 480px</option>
            <option value="640">Tall · 640px</option>
          </Select>
        </label>
        <label>
          Alignment
          <Select
            value={align}
            onChange={(e) => {
              setAlign(e.target.value);
              if (e.target.value === "center") setWrap(false);
            }}
          >
            <option value="center">Center</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </Select>
        </label>
      </div>
      <label className="widget-wrap-control">
        <input
          type="checkbox"
          checked={wrap}
          onChange={(e) => {
            setWrap(e.target.checked);
            if (e.target.checked) {
              if (width === "full") setWidth("half");
              if (align === "center") setAlign("left");
            }
          }}
        />
        Wrap article text beside this widget
      </label>
      <p className="block-author-note">
        For wrapping, place the widget before your paragraphs. Text fills the
        space alongside it and continues below. Works with left- or
        right-aligned, smaller widgets.
      </p>
      <DiagramAssetPicker insert={insertSized} />
      <fieldset className="checklist-picker">
        <legend>Interactive checklist</legend>
        <label><input type="checkbox" checked={floatingChecklist} onChange={event => setFloatingChecklist(event.target.checked)} /> Float while reading</label>
        <p>Readers can tick tasks in the article. Enable floating to also offer a collapsible panel on published pages.</p>
        <button type="button" className="button" onClick={() => onInsert(`\n\n${checklistExample(floatingChecklist)}\n\n`)}>Insert checklist</button>
      </fieldset>
      <div className="block-picker">
        {(["horizontal", "vertical"] as const).map((orientation) => (
          <button
            key={orientation}
            onClick={() => onInsert(`\n\n${tabsExample(orientation)}\n\n`)}
          >
            <span>CONTENT TABS</span>
            <strong>
              {orientation === "horizontal"
                ? "Horizontal tabs"
                : "Vertical tabs"}
              <Columns2 size={16} />
            </strong>
            <p>
              {orientation === "horizontal"
                ? "A row of tabs above your content."
                : "A column of tabs beside your content."}{" "}
              Each panel supports Markdown, media, and interactive blocks.
            </p>
          </button>
        ))}
        {blockExamples.map((example) => example.language === "poll" ? (
          <div className="block-picker-poll" key={example.language}>
            <span>{example.tag}</span>
            <strong>{example.title}</strong>
            <p>{example.description}</p>
            <label>Show results
              <Select value={pollResultTiming} onChange={(event) => setPollResultTiming(event.target.value as "after-vote" | "after-close")}>
                <option value="after-vote">After a reader votes</option>
                <option value="after-close">When voting closes</option>
              </Select>
            </label>
            <label>Close voting {pollResultTiming === "after-close" ? "(required)" : "(optional)"}
              <input type="datetime-local" value={pollClosesAt} onChange={(event) => setPollClosesAt(event.target.value)} />
            </label>
            <small>Use your local date and time. The article stores it with a timezone.</small>
            {pollClosesAt && !validPollClose && <small role="alert">Choose a future close date and time.</small>}
            <button type="button" className="button" disabled={(pollResultTiming === "after-close" || !!pollClosesAt) && !validPollClose} onClick={() => {
              const source = JSON.stringify({ ...JSON.parse(example.source), resultsVisibility: pollResultTiming,
                ...(pollCloseDate ? { closesAt: pollCloseDate.toISOString() } : {}) }, null, 2);
              insertBlock(example.language, source);
            }}><Plus size={16} /> Insert poll</button>
          </div>
        ) : (
          <button
            key={example.language}
            onClick={() => {
              insertBlock(example.language, example.source);
            }}
          >
            <span>{example.tag}</span>
            <strong>
              {example.title}
              <Plus size={16} />
            </strong>
            <p>{example.description}</p>
          </button>
        ))}
        <button
          onClick={() =>
            onInsert(
              widgetRow(
                [taggedExample("chart"), taggedExample("scene")],
                2,
                height,
              ),
            )
          }
        >
          <span>LAYOUT</span>
          <strong>
            Two widgets side by side
            <Columns2 size={16} />
          </strong>
          <p>
            Insert a chart and a 3D scene in equal columns, using the selected
            visual height. They stack on smaller screens.
          </p>
        </button>
        <button
          onClick={() =>
            onInsert(
              textVisualRow(
                taggedExample("chart"),
                height,
              ),
            )
          }
        >
          <span>LAYOUT</span>
          <strong>
            Text beside a visual
            <Columns2 size={16} />
          </strong>
          <p>
            Put Markdown beside a chart, diagram, 3D scene, image, or video.
            Starts with an explanation and an interactive chart.
          </p>
        </button>
      </div>
      <p className="block-author-note">
        Sizing applies when you insert. Edit the widget wrapper in Markdown to
        resize it later. Visual height controls the chart, diagram, or 3D
        canvas; titles and controls stay visible. Row presets use columns, with
        no text wrapping.
      </p>
    </>
  );
}
