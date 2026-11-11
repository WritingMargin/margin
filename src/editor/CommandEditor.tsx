import CommandSuggestions from "./CommandSuggestions";
import "../command-editor.css";

import { useCommandEditor } from "./useCommandEditor";
export default function CommandEditor(
  props: Parameters<typeof useCommandEditor>[0],
) {
  const state = useCommandEditor(props);
  const {
    onKeyDown,
    ariaLabel,
    editorRef,
    value,
    onChange,
    setContext,
    active,
    id,
    composing,
    open,
    refresh,
    dismiss,
    reposition,
  } = state;
  return (
    <>
      <textarea
        ref={(node) => {
          editorRef.current = node;
        }}
        spellCheck={false}
        wrap="soft"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        placeholder="Start with a thought… Type / for commands."
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
          requestAnimationFrame(() => {
            if (editorRef.current) refresh(editorRef.current);
          });
        }}
        onSelect={(event) => refresh(event.currentTarget)}
        onBlur={dismiss}
        onCompositionStart={() => {
          composing.current = true;
          setContext(null);
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          refresh(event.currentTarget);
        }}
        onScroll={(event) => {
          const gutter = event.currentTarget
            .previousElementSibling as HTMLElement | null;
          if (gutter)
            gutter.style.transform = `translateY(-${event.currentTarget.scrollTop}px)`;
          if (open) reposition();
        }}
        onKeyDown={onKeyDown}
      />
      <CommandSuggestions state={state} />
    </>
  );
}
