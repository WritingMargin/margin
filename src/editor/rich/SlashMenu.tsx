import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { filterCatalog, runCatalogAction, type CatalogItem } from "./component-catalog";
import { insertComponentAtSelection } from "./insert-component";
import "../editor-menu.css";

/** "/query" typed at the start of an otherwise empty top-level paragraph. */
type Slash = { from: number; to: number; query: string };

function slashAt(editor: Editor): Slash | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.depth !== 1 || $from.parent.type.name !== "paragraph") return null;
  if ($from.parentOffset !== $from.parent.content.size) return null;
  const match = /^\/([\w-]{0,24})$/.exec($from.parent.textContent);
  return match ? { from: $from.start(), to: $from.pos, query: match[1] } : null;
}

function choose(editor: Editor, slash: Slash, item: CatalogItem) {
  editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
  if (item.source) insertComponentAtSelection(editor, item.source());
  else if (item.action) runCatalogAction(item.action);
}

type MenuState = Slash & { items: CatalogItem[]; index: number; top: number; left: number };

/**
 * Typing "/" on an empty line lists the same components as the shelf.
 * Arrow keys move, Enter or Tab inserts, Escape closes.
 */
export function useSlashMenu(editor: Editor | null, host: RefObject<HTMLElement | null>) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const dismissed = useRef<number | null>(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  useEffect(() => {
    if (!editor) return;
    const refresh = () => setMenu((current) => nextMenu(editor, host.current, current, dismissed));
    editor.on("transaction", refresh);
    return () => {
      editor.off("transaction", refresh);
    };
  }, [editor, host]);

  const pick = useCallback(
    (item: CatalogItem) => {
      const current = menuRef.current;
      if (!editor || !current) return;
      setMenu(null);
      choose(editor, current, item);
    },
    [editor],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const current = menuRef.current;
      if (!current) return false;
      return handleKey(event, current, setMenu, pick, dismissed);
    },
    [pick],
  );

  return { menu, pick, onKeyDown };
}

function nextMenu(
  editor: Editor,
  host: HTMLElement | null,
  current: MenuState | null,
  dismissed: { current: number | null },
): MenuState | null {
  const slash = slashAt(editor);
  if (!slash) {
    dismissed.current = null;
    return null;
  }
  if (dismissed.current === slash.from || !host) return null;
  const items = filterCatalog(slash.query);
  if (!items.length) return null;
  const caret = editor.view.coordsAtPos(slash.to);
  const box = host.getBoundingClientRect();
  const index = current && current.query === slash.query ? Math.min(current.index, items.length - 1) : 0;
  return { ...slash, items, index, top: caret.bottom - box.top + 6, left: caret.left - box.left };
}

function handleKey(
  event: KeyboardEvent,
  menu: MenuState,
  setMenu: (next: MenuState | null) => void,
  pick: (item: CatalogItem) => void,
  dismissed: { current: number | null },
) {
  const count = menu.items.length;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const step = event.key === "ArrowDown" ? 1 : count - 1;
    setMenu({ ...menu, index: (menu.index + step) % count });
    return true;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    pick(menu.items[menu.index]);
    return true;
  }
  if (event.key === "Escape") {
    dismissed.current = menu.from;
    setMenu(null);
    return true;
  }
  return false;
}

export default function SlashMenu({
  menu,
  pick,
}: {
  menu: MenuState;
  pick: (item: CatalogItem) => void;
}) {
  return (
    <div
      className="slash-menu editor-button-surface"
      role="listbox"
      aria-label="Insert a component"
      style={{ top: menu.top, left: menu.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {menu.items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === menu.index}
          className="editor-menu-item"
          onClick={() => pick(item)}
        >
          <item.icon size={16} aria-hidden="true" />
          <span>
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
