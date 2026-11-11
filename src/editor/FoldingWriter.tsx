import { useLayoutEffect, useRef, useState } from "react";
import { Annotation, Compartment, EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { useCommandEditor, type CommandKeyEvent } from "./useCommandEditor";
import CommandSuggestions from "./CommandSuggestions";
import { writerCodeFolds } from "./writer-code-folds";
import { writerEditorBridge } from "./writer-editor-bridge";
import "./folding-writer.css";

const externalChange = Annotation.define<boolean>();
export default function FoldingWriter(
  props: Parameters<typeof useCommandEditor>[0],
) {
  const commands = useCommandEditor(props);
  const current = useRef(commands);
  current.current = commands;
  const mount = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const editor = useRef<EditorView>(null);
  const accessibility = useRef(new Compartment());
  useLayoutEffect(() => {
    const view = new EditorView({
      parent: mount.current!,
      state: EditorState.create({
        doc: current.current.value,
        extensions: [
          history(),
          drawSelection(),
          lineNumbers(),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          writerCodeFolds,
          placeholder("Start with a thought… Type / for commands."),
          accessibility.current.of(
            EditorView.contentAttributes.of({
              "aria-label": current.current.ariaLabel,
              "aria-multiline": "true",
              spellcheck: "false",
            }),
          ),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((t) => t.annotation(externalChange))
            )
              current.current.onChange(update.state.doc.toString());
            if (update.docChanged || update.selectionSet)
              requestAnimationFrame(() => {
                const target = current.current.editorRef.current;
                if (target) current.current.refresh(target);
              });
          }),
          Prec.highest(
            EditorView.domEventHandlers({
              keydown(event) {
                const target = current.current.editorRef.current!;
                current.current.onKeyDown({
                  key: event.key,
                  code: event.code,
                  shiftKey: event.shiftKey,
                  metaKey: event.metaKey,
                  ctrlKey: event.ctrlKey,
                  altKey: event.altKey,
                  currentTarget: target,
                  nativeEvent: event,
                  preventDefault: () => event.preventDefault(),
                  stopPropagation: () => event.stopPropagation(),
                } satisfies CommandKeyEvent);
                return event.defaultPrevented;
              },
              blur: () => {
                current.current.dismiss();
              },
              compositionstart: () => {
                current.current.composing.current = true;
                current.current.setContext(null);
              },
              compositionend: () => {
                current.current.composing.current = false;
              },
              scroll: () => {
                if (current.current.open) current.current.reposition();
              },
            }),
          ),
        ],
      }),
    });
    editor.current = view;
    const ref = current.current.editorRef;
    ref.current = writerEditorBridge(view);
    setMounted(true);
    return () => {
      ref.current = null;
      editor.current = null;
      view.destroy();
    };
  }, []);
  useLayoutEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== props.value)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: props.value },
        annotations: externalChange.of(true),
      });
  }, [props.value]);
  useLayoutEffect(() => {
    editor.current?.dispatch({
      effects: accessibility.current.reconfigure(
        EditorView.contentAttributes.of({
          "aria-label": commands.ariaLabel,
          "aria-multiline": "true",
          spellcheck: "false",
          "aria-autocomplete": "list",
          "aria-controls": commands.open ? `${commands.id}-list` : "",
          "aria-activedescendant": commands.open
            ? `${commands.id}-${commands.active}`
            : "",
        }),
      ),
    });
  }, [commands.ariaLabel, commands.open, commands.id, commands.active]);
  return (
    <>
      <div className="folding-writer" ref={mount}>
        {!mounted && (
          <textarea
            readOnly
            aria-label={commands.ariaLabel}
            value={props.value}
          />
        )}
      </div>
      <CommandSuggestions state={commands} />
    </>
  );
}
