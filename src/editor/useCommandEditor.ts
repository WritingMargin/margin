import type { WriterEditor } from "./editor-handle";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import "../command-editor.css";
import {
  initialMediaDefaults,
  mediaDefaultOptions,
  type MediaDefaults,
  type MediaKind,
} from "../../shared/media-defaults";
import {
  applyCompletion,
  mediaCompletion,
  getCompletions,
  type Completion,
  type CompletionContext,
} from "../editor-completions";
type Props = {
  editorRef: RefObject<WriterEditor | null>;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  mediaDefaults?: MediaDefaults;
  layoutKind?: MediaKind;
};
function caretRect(editor: WriterEditor) {
  if (editor.caretCoordinates) return editor.caretCoordinates();
  const style = getComputedStyle(editor);
  const mirror = document.createElement("div");
  for (const property of [
    "font",
    "letter-spacing",
    "line-height",
    "padding",
    "border",
    "box-sizing",
    "white-space",
    "word-break",
    "overflow-wrap",
    "tab-size",
  ]) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(mirror.style, {
    position: "fixed",
    visibility: "hidden",
    left: "0",
    top: "0",
    width: `${editor.clientWidth}px`,
    height: "auto",
  });
  mirror.textContent = editor.value.slice(0, editor.selectionStart);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  const markerBounds = marker.getBoundingClientRect();
  const bounds = editor.getBoundingClientRect();
  const rect = {
    x: bounds.left + markerBounds.left - editor.scrollLeft,
    y: bounds.top + markerBounds.top - editor.scrollTop,
    height: parseFloat(style.lineHeight) || 24,
    bounds,
  };
  mirror.remove();
  return rect;
}
function isCompletionKey(event: CommandKeyEvent) {
  return (
    (event.key === "Enter" || event.key === "Tab") &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  );
}
export function useCommandEditor({
  editorRef,
  value,
  onChange,
  ariaLabel = "Markdown content",
  mediaDefaults = initialMediaDefaults,
  layoutKind,
}: Props) {
  const id = useId();
  const [context, setContext] = useState<CompletionContext | null>(null);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, visible: false });
  const dismissed = useRef("");
  const composing = useRef(false);
  const popup = useRef<HTMLDivElement>(null);
  const previousQuery = useRef("");
  const open = !!context?.items.length;
  const signature = (el: WriterEditor) => `${el.selectionStart}:${el.value}`;
  const refresh = (el: WriterEditor, force = false) => {
    if (
      composing.current ||
      document.activeElement !== el ||
      (!force && dismissed.current === signature(el))
    ) {
      setContext(null);
      return;
    }
    const next = getCompletions(el.value, el.selectionStart, el.selectionEnd);
    const key = `${next?.start}:${el.value.slice(next?.start, el.selectionStart)}`;
    if (key !== previousQuery.current) {
      setActive(0);
      previousQuery.current = key;
    }
    setContext(layoutCompletions(next, layoutKind));
  };
  const dismiss = () => {
    if (editorRef.current) dismissed.current = signature(editorRef.current);
    setContext(null);
  };
  const reposition = () => {
    const editor = editorRef.current;
    if (!editor || !popup.current) return;
    const rect = caretRect(editor);
    const width = popup.current.offsetWidth;
    const height = popup.current.offsetHeight;
    const below = rect.y + rect.height + 6;
    const top =
      below + height < window.innerHeight - 8
        ? below
        : Math.max(8, rect.y - height - 6);
    setPosition({
      left: Math.max(8, Math.min(rect.x, window.innerWidth - width - 8)),
      top,
      visible:
        rect.y >= rect.bounds.top - rect.height &&
        rect.y < rect.bounds.bottom &&
        rect.bounds.width > 0,
    });
  };
  const accept = (item: Completion) => {
    if (!context || !editorRef.current) return;
    const result = applyCompletion(
      editorRef.current.value,
      context,
      mediaCompletion(item, mediaDefaults),
    );
    onChange(result.content);
    setContext(null);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(result.start, result.end);
      dismissed.current = signature(editor);
    });
  };
  useEffect(() => {
    setContext(null);
  }, [value]);
  useLayoutEffect(() => {
    if (open) reposition();
  }, [context]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  useEffect(() => {
    popup.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const onKeyDown = (event: CommandKeyEvent) => {
    if (isComposing(event, composing.current)) return;
    if (isCompletionShortcut(event)) {
      event.preventDefault();
      dismissed.current = "";
      refresh(event.currentTarget, true);
      return;
    }
    if (!open || !context) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        (index) =>
          (index +
            (event.key === "ArrowDown" ? 1 : -1) +
            context.items.length) %
          context.items.length,
      );
    } else if (isCompletionKey(event)) {
      event.preventDefault();
      accept(context.items[active] || context.items[0]);
    }
  };
  return {
    onKeyDown,
    ariaLabel,
    editorRef,
    value,
    onChange,
    id,
    context,
    setContext,
    active,
    setActive,
    position,
    dismissed,
    composing,
    popup,
    open,
    refresh,
    dismiss,
    reposition,
    accept,
  };
}

function layoutCompletions(
  context: CompletionContext | null,
  kind?: MediaKind,
) {
  if (!context || !kind) return context;
  const keys = Object.keys(mediaDefaultOptions[kind]);
  return {
    ...context,
    items: context.items.filter((item) =>
      keys.some((key) => item.id === key || item.id.startsWith(`${key}-`)),
    ),
  };
}

export type CommandEditorController = ReturnType<typeof useCommandEditor>;

function isCompletionShortcut(event: CommandKeyEvent) {
  return event.ctrlKey && event.code === "Space";
}
function isComposing(event: CommandKeyEvent, composing: boolean) {
  return composing || event.nativeEvent.isComposing;
}

export type CommandKeyEvent = Pick<
  KeyboardEvent,
  | "key"
  | "code"
  | "shiftKey"
  | "metaKey"
  | "ctrlKey"
  | "altKey"
  | "preventDefault"
  | "stopPropagation"
> & { currentTarget: WriterEditor; nativeEvent: { isComposing: boolean } };
