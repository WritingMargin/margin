import Accordion from "../Accordion";
import ContentTabs from "./ContentTabs";
import Select from "../components/Select";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { tabsMarkdown, type TabsOptions } from "../../shared/tabs";
import Markdown from "../Markdown";
import "./tabs-picker.css";

import { useTabsPicker } from "./useTabsPicker";
export default function TabsPicker(props: Parameters<typeof useTabsPicker>[0]) {
  const state = useTabsPicker(props);
  const {
    onInsert,
    title,
    setTitle,
    options,
    panels,
    setPanels,
    editing,
    update,
    changePanel,
    selectPanel,
    move,
    remove,
    invalid,
  } = state;
  return (
    <div className="tabs-builder">
      <header>
        <h2>Insert tabs</h2>
      </header>
      <div className="tabs-builder-body">
        <div className="tabs-builder-controls">
          <label>
            Group name
            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Editing tab
            <Select
              value={editing}
              onChange={(e) => selectPanel(Number(e.target.value))}
            >
              {panels.map((panel, index) => (
                <option key={index} value={index}>
                  {index + 1}. {panel.title || "Untitled tab"}
                </option>
              ))}
            </Select>
          </label>
          <div className="tab-edit-actions">
            <button
              type="button"
              className="button"
              disabled={panels.length >= 12}
              onClick={() => {
                setPanels([
                  ...panels,
                  {
                    title: `Tab ${panels.length + 1}`,
                    content: "Write your content here.",
                  },
                ]);
                selectPanel(panels.length);
              }}
            >
              <Plus size={13} />
              Add tab
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Move tab earlier"
              title="Move tab earlier"
              disabled={!editing}
              onClick={() => move(-1)}
            >
              <ArrowUp size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Move tab later"
              title="Move tab later"
              disabled={editing === panels.length - 1}
              onClick={() => move(1)}
            >
              <ArrowDown size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove tab"
              title="Remove tab"
              disabled={panels.length === 1}
              onClick={remove}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <label>
            Tab label
            <input
              value={panels[editing].title}
              maxLength={120}
              onChange={(e) => changePanel({ title: e.target.value })}
            />
          </label>
          <label>
            Tab content
            <textarea
              rows={5}
              value={panels[editing].content}
              onChange={(e) => changePanel({ content: e.target.value })}
              spellCheck={false}
            />
          </label>
          <p className="small-text">Supports Markdown and media.</p>
        </div>
        <div className="tabs-builder-preview">
          <span className="small-text">Preview · select a tab to edit</span>
          <div className="markdown-body">
            <ContentTabs
              {...options}
              title={title}
              selectedIndex={editing}
              onSelect={selectPanel}
            >
              {panels.map((panel, index) => (
                <section
                  key={index}
                  className="md-tab"
                  data-tab-title={panel.title}
                >
                  <Markdown content={panel.content} />
                </section>
              ))}
            </ContentTabs>
          </div>
        </div>
        <Accordion title="Appearance" className="tabs-builder-appearance">
          <div className="tabs-builder-controls">
            <div className="tabs-control-row">
              <label>
                Orientation
                <Select
                  value={options.orientation}
                  onChange={(e) =>
                    update({
                      orientation: e.target.value as TabsOptions["orientation"],
                    })
                  }
                >
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                </Select>
              </label>
              <label>
                Style
                <Select
                  value={options.variant}
                  onChange={(e) =>
                    update({
                      variant: e.target.value as TabsOptions["variant"],
                    })
                  }
                >
                  <option value="underline">Underline</option>
                  <option value="pills">Pills</option>
                  <option value="boxed">Boxed</option>
                </Select>
              </label>
            </div>
            <div className="tabs-control-row">
              <label>
                Spacing
                <Select
                  value={options.spacing}
                  onChange={(e) =>
                    update({
                      spacing: e.target.value as TabsOptions["spacing"],
                    })
                  }
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </Select>
              </label>
              <label>
                Accent color
                <input
                  type="color"
                  value={options.accent || "#242424"}
                  onChange={(e) => update({ accent: e.target.value })}
                />
              </label>
            </div>
            <label>
              Corner radius · {options.radius}px
              <input
                type="range"
                min="0"
                max="24"
                value={options.radius}
                onChange={(e) => update({ radius: Number(e.target.value) })}
              />
            </label>
            <label>
              Initially selected tab
              <Select
                value={options.initial}
                onChange={(e) => {
                  update({ initial: Number(e.target.value) });
                }}
              >
                {panels.map((panel, index) => (
                  <option key={index} value={index + 1}>
                    {panel.title || `Tab ${index + 1}`}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </Accordion>
      </div>
      <footer>
        <span>{invalid ? "Give the group and each tab a label." : ""}</span>
        <button
          className="button primary"
          disabled={invalid}
          onClick={() =>
            onInsert(`\n\n${tabsMarkdown(title, options, panels)}\n\n`)
          }
        >
          <Plus size={15} />
          Insert tabs
        </button>
      </footer>
    </div>
  );
}
