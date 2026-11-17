import type { DragEvent, RefObject } from "react";
import { X } from "lucide-react";
import type { WriterEditor } from "./editor-handle";
import {
  COMPONENT_DRAG_TYPE,
  componentCatalog,
  runCatalogAction,
  type CatalogItem,
} from "./rich/component-catalog";

const groups: CatalogItem["group"][] = ["Writing", "Interactive", "Media"];

/**
 * Components beside the pad. Drag one into the text (a line shows where it
 * lands) or click it to add it where the caret is.
 */
export default function ComponentShelf({ editor, onClose }: { editor: RefObject<WriterEditor | null>; onClose: () => void }) {
  function onDragStart(event: DragEvent<HTMLButtonElement>, item: CatalogItem) {
    if (!item.source) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(COMPONENT_DRAG_TYPE, item.id);
    event.dataTransfer.setData("text/plain", "");
    editor.current?.startComponentDrag?.(item.source());
  }

  function add(item: CatalogItem) {
    if (item.source) editor.current?.insertComponent?.(item.source());
    else if (item.action) runCatalogAction(item.action);
  }

  return (
    <aside id="component-shelf" className="component-shelf" aria-label="Components">
      <div className="component-shelf-head">
        <p className="component-shelf-title">Insert</p>
        <button type="button" className="component-shelf-close" aria-label="Close components" title="Close" onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <p className="component-shelf-hint">Drag into your writing, or click to add at the cursor.</p>
      {groups.map((group) => (
        <div key={group} className="component-shelf-group">
          <p className="component-shelf-group-name">{group}</p>
          {componentCatalog
            .filter((item) => item.group === group)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className="component-shelf-item"
                draggable={!!item.source}
                title={item.source ? `Drag ${item.label} into your writing, or click to add it` : item.hint}
                onDragStart={(event) => onDragStart(event, item)}
                onDragEnd={() => editor.current?.endComponentDrag?.()}
                onClick={() => add(item)}
              >
                <item.icon size={16} aria-hidden="true" />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </button>
            ))}
        </div>
      ))}
    </aside>
  );
}
