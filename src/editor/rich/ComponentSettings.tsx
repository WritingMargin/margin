import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import Select from "../../components/Select";
import InnerTabs from "../../components/InnerTabs";
import CodeInput from "../CodeInput";
import { useOverlayFocus } from "../../useOverlayFocus";
import {
  applyLayout,
  codeLanguageFor,
  componentKind,
  currentAttributes,
  isRichPayload,
  propertyFields,
  withAttributes,
} from "./component-props";
import "../../admin/dialog-layout.css";
import "./rich-writer.css";

type Props = {
  src: string;
  label: string;
  /** Node kind; "markdown" marks prose the rich writer can't edit visually. */
  kind?: string;
  hint?: string;
  /** Apply the current source to the component in the editor. */
  onChange: (src: string) => void;
  onClose: () => void;
};

type Tab = "properties" | "code";

const layoutFields: { name: string; label: string; options: string[] }[] = [
  { name: "width", label: "Width", options: ["", "full", "two-thirds", "half", "third"] },
  { name: "height", label: "Height", options: ["", "auto", "240", "360", "480", "640"] },
  { name: "align", label: "Alignment", options: ["", "left", "center", "right"] },
  { name: "wrap", label: "Wrap text beside", options: ["", "true", "false"] },
];

/** Long values (URLs, prose) take the full row; names take two of three columns. */
const wideFields = new Set(["src", "url", "image", "caption", "description"]);
const mediumFields = new Set(["title", "alt"]);

function fieldSize(name: string) {
  if (wideFields.has(name)) return "is-wide";
  return mediumFields.has(name) ? "is-medium" : "";
}

const fieldLabels: Record<string, string> = {
  src: "Source",
  alt: "Alt text",
  caption: "Caption",
  description: "Description",
  url: "URL",
  title: "Title",
  image: "Image URL",
  accent: "Accent colour",
  initial: "Initial tab",
  radius: "Radius",
};

export default function ComponentSettings({ src, label, kind: nodeKind, onChange, onClose, hint }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useOverlayFocus(panel, true, onClose);
  const kind = componentKind(src);
  // Tables, raw HTML, task lists and similar prose only have a Code view.
  const codeOnly = nodeKind === "markdown";
  const [tab, setTab] = useState<Tab>(codeOnly ? "code" : "properties");
  const [code, setCode] = useState(src);
  const [attrs, setAttrs] = useState<Record<string, string>>(() =>
    kind.type === "tag" ? currentAttributes(src) : {},
  );
  const [layout, setLayout] = useState<Record<string, string>>({});

  function commit(next: string) {
    setCode(next);
    onChange(next);
  }

  function updateAttribute(name: string, value: string) {
    const next = { ...attrs, [name]: value };
    setAttrs(next);
    if (kind.type === "tag") commit(withAttributes(code, next));
  }

  function updateLayout(name: string, value: string) {
    const next = { ...layout, [name]: value };
    setLayout(next);
    if (kind.type !== "tag") commit(applyLayout(code, next));
  }

  function switchTab(next: Tab) {
    setTab(next);
    if (next === "properties") {
      setAttrs(kind.type === "tag" ? currentAttributes(code) : {});
      setLayout({});
    }
  }

  return createPortal(
    <div className="modal-backdrop component-settings-backdrop" onClick={onClose}>
      <div
        className={`modal component-settings editor-button-surface${tab === "code" ? " is-code" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${label} settings`}
        ref={panel}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <h2>{label} settings</h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        </header>

        <div className="component-settings-tabs">
        <InnerTabs<Tab>
          label="Component settings"
          numbered={false}
          tabs={
            codeOnly
              ? [{ value: "code", label: "Code" }]
              : [
                  { value: "properties", label: "Properties" },
                  { value: "code", label: "Code" },
                ]
          }
          value={tab}
          onChange={switchTab}
        />
        </div>

        <div className="dialog-body component-settings-body">
          {tab === "properties" ? (
            <Properties
              fields={propertyFields(kind)}
              attrs={attrs}
              layout={layout}
              kind={kind.type}
              richPayload={isRichPayload(kind)}
              updateAttribute={updateAttribute}
              updateLayout={updateLayout}
            />
          ) : (
            <CodeInput
              value={code}
              language={codeOnly ? "markdown" : codeLanguageFor(kind)}
              onChange={commit}
            />
          )}
          {hint && <p className="small-text">{hint}</p>}
        </div>

        <footer className="dialog-footer">
          <button type="button" className="button primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

type Field = ReturnType<typeof propertyFields>[number];

function Properties({
  fields,
  attrs,
  layout,
  kind,
  richPayload,
  updateAttribute,
  updateLayout,
}: {
  fields: Field[];
  attrs: Record<string, string>;
  layout: Record<string, string>;
  kind: "tag" | "fence" | "directive";
  richPayload: boolean;
  updateAttribute: (name: string, value: string) => void;
  updateLayout: (name: string, value: string) => void;
}) {
  if (!fields.length && kind === "tag") {
    return (
      <p className="muted">
        This component has no visual properties. Use Code mode to edit it.
      </p>
    );
  }
  return (
    <>
      {fields.length > 0 && (
        <div className="component-settings-fields">
          {fields.map((field) => (
            <label
              key={field.name}
              className={fieldSize(field.name)}
            >
              {fieldLabels[field.name] ?? field.label}
              {field.type === "select" ? (
                <Select
                  value={attrs[field.name] ?? ""}
                  onChange={(event) =>
                    updateAttribute(field.name, event.target.value)
                  }
                >
                  <option value="">—</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              ) : (
                <input
                  value={attrs[field.name] ?? ""}
                  placeholder={field.placeholder ?? ""}
                  onChange={(event) =>
                    updateAttribute(field.name, event.target.value)
                  }
                />
              )}
            </label>
          ))}
        </div>
      )}
      {kind !== "tag" && (
        <fieldset className="component-layout">
          <legend>Layout</legend>
          <div className="component-settings-fields">
            {layoutFields.map((field) => (
              <label key={field.name}>
                {field.label}
                <Select
                  value={layout[field.name] ?? ""}
                  onChange={(event) =>
                    updateLayout(field.name, event.target.value)
                  }
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option === "" ? "Unchanged" : option}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {richPayload && (
        <p className="small-text">
          The full payload is edited in Code mode. These options set its layout
          without changing the source.
        </p>
      )}
    </>
  );
}
