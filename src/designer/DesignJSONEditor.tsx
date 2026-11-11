import { useEffect, useRef, useState } from "react";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers, tooltips } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, foldEffect, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, startCompletion } from "@codemirror/autocomplete";
import { completeDesignJSON, designHelpAt, type DesignCompletion } from "./json-completion";
import "./design-json-editor.css";

const externalUpdate = Annotation.define<boolean>();
type Props = { value: string; onChange: (value: string) => void; disabled: boolean; invalid: boolean };
function accessibility(disabled: boolean, invalid: boolean) {
  return [EditorState.readOnly.of(disabled), EditorView.editable.of(!disabled), EditorView.contentAttributes.of({
    id: "design-json", "aria-label": "Design JSON", "aria-describedby": "design-json-help design-json-caret-help design-json-status",
    "aria-invalid": String(invalid), "aria-disabled": String(disabled), spellcheck: "false", autocapitalize: "off", autocorrect: "off",
  })];
}
function completionDescription(completion: DesignCompletion) {
  const node = document.createElement("span");
  node.className = "design-completion-description";
  node.textContent = completion.description;
  return node;
}
function collapseGroups(view: EditorView) {
  const root = syntaxTree(view.state).topNode.firstChild;
  const effects = [];
  for (const property of root?.getChildren("Property") ?? []) {
    const object = property.getChild("Object");
    if (!object) continue;
    const key = property.getChild("PropertyName")!;
    const groups = view.state.sliceDoc(key.from, key.to) === '"homepage"'
      ? object.getChildren("Property").map(child => child.getChild("Object")).filter(child => child !== null)
      : [object];
    for (const group of groups) {
      if (group.to - group.from > 2) effects.push(foldEffect.of({ from: group.from + 1, to: group.to - 1 }));
    }
  }
  view.dispatch({ effects });
}
export default function DesignJSONEditor({ value, onChange, disabled, invalid }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const initial = useRef(value);
  const access = useRef(new Compartment());
  const [help, setHelp] = useState("Type a setting or value to see suggestions. Ctrl+Space opens all available choices.");
  useEffect(() => {
    if (!container.current) return;
    const view = new EditorView({
      parent: container.current,
      state: EditorState.create({ doc: initial.current, extensions: [
        json(), history(), lineNumbers(), foldGutter(), drawSelection(), highlightActiveLine(),
        bracketMatching(), indentOnInput(), syntaxHighlighting(defaultHighlightStyle), closeBrackets(),
        autocompletion({
          override: [completeDesignJSON], icons: false, maxRenderedOptions: 20, filterStrict: true,
          activateOnCompletion: completion => completion.type === "property",
          tooltipClass: () => "design-json-completions",
          addToOptions: [{ position: 90, render: completion => completionDescription(completion as DesignCompletion) }],
        }),
        keymap.of([{ key: "Tab", run: acceptCompletion }, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
        tooltips({ parent: document.body }),
        access.current.of(accessibility(false, false)),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalUpdate))) callback.current(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) setHelp(designHelpAt(update.state));
        }),
      ] }),
    });
    collapseGroups(view);
    editor.current = view;
    return () => { view.destroy(); editor.current = null; };
  }, []);
  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value }, annotations: externalUpdate.of(true) });
      collapseGroups(view);
    }
  }, [value]);
  useEffect(() => {
    editor.current?.dispatch({ effects: access.current.reconfigure(accessibility(disabled, invalid)) });
  }, [disabled, invalid]);
  const suggest = () => { if (editor.current) { editor.current.focus(); startCompletion(editor.current); } };
  return <>
    <div className="design-json-toolbar"><label htmlFor="design-json">Design JSON</label>
      <button type="button" className="text-link" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={suggest}>Suggest <kbd>Ctrl Space</kbd></button>
    </div>
    <div className="design-json-editor" ref={container} />
    <p id="design-json-caret-help" className="design-json-caret-help">{help}</p>
    <p className="design-json-shortcuts">↑↓ choose · Enter / Tab insert · Esc dismiss · Gutter arrows fold objects</p>
  </>;
}
