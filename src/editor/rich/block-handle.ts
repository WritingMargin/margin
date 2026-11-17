import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

/**
 * A ⋮⋮ handle beside whichever block the pointer is over. Dragging it moves the
 * whole block (paragraph, heading, list, component…) using ProseMirror's own
 * drop handling, so the drop line, undo, and Markdown saving behave as usual.
 * Clicking it selects the block.
 */
export const BlockHandle = Extension.create({
  name: "blockHandle",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockHandle"),
        view: (view) => new HandleView(view),
      }),
    ];
  },
});

type DraggingView = EditorView & { dragging: { slice: Slice; move: boolean } | null };

const GRIP =
  '<svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">' +
  [3, 8, 13].map((y) => `<circle cx="2.5" cy="${y}" r="1.4"/><circle cx="7.5" cy="${y}" r="1.4"/>`).join("") +
  "</svg>";

class HandleView {
  private handle = document.createElement("div");
  private host: HTMLElement | null;
  private pos: number | null = null;
  private hideTimer = 0;

  constructor(private view: EditorView) {
    this.host = view.dom.parentElement;
    this.handle.className = "block-handle";
    this.handle.draggable = true;
    this.handle.title = "Drag to move · Click to select";
    this.handle.innerHTML = GRIP;
    this.handle.addEventListener("dragstart", this.onDragStart);
    this.handle.addEventListener("dragend", this.onDragEnd);
    this.handle.addEventListener("click", this.onClick);
    this.handle.addEventListener("mouseenter", () => window.clearTimeout(this.hideTimer));
    if (!this.host) return;
    if (getComputedStyle(this.host).position === "static") this.host.style.position = "relative";
    this.host.appendChild(this.handle);
    this.host.addEventListener("mousemove", this.onMove);
    this.host.addEventListener("mouseleave", this.scheduleHide);
  }

  update(view: EditorView, previous: EditorState) {
    if (!view.state.doc.eq(previous.doc)) this.hide();
  }

  destroy() {
    window.clearTimeout(this.hideTimer);
    this.host?.removeEventListener("mousemove", this.onMove);
    this.host?.removeEventListener("mouseleave", this.scheduleHide);
    this.handle.remove();
  }

  private onMove = (event: MouseEvent) => {
    // Keep the handle put while a button is held, so a drag can start from it.
    if (event.buttons !== 0) return;
    if (event.target === this.handle || this.handle.contains(event.target as Node)) return;
    const found = this.blockAt(event.clientY);
    if (found) this.show(found.pos, found.dom);
  };

  /** The top-level block whose box spans this height. */
  private blockAt(y: number) {
    let found: { pos: number; dom: HTMLElement } | null = null;
    this.view.state.doc.forEach((_node, offset) => {
      if (found) return;
      const dom = this.view.nodeDOM(offset);
      if (!(dom instanceof HTMLElement)) return;
      const rect = dom.getBoundingClientRect();
      if (y >= rect.top - 6 && y <= rect.bottom + 6) found = { pos: offset, dom };
    });
    return found as { pos: number; dom: HTMLElement } | null;
  }

  private show(pos: number, dom: HTMLElement) {
    if (!this.host) return;
    window.clearTimeout(this.hideTimer);
    this.pos = pos;
    const host = this.host.getBoundingClientRect();
    const rect = dom.getBoundingClientRect();
    const line = parseFloat(getComputedStyle(dom).lineHeight) || 24;
    this.handle.style.top = `${rect.top - host.top + Math.max(0, (Math.min(line, rect.height) - 16) / 2)}px`;
    this.handle.style.left = `${rect.left - host.left - 26}px`;
    this.handle.classList.add("is-visible");
  }

  private scheduleHide = () => {
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), 250);
  };

  private hide() {
    this.handle.classList.remove("is-visible");
    this.pos = null;
  }

  private select() {
    if (this.pos === null || this.pos >= this.view.state.doc.content.size) return null;
    const selection = NodeSelection.create(this.view.state.doc, this.pos);
    this.view.dispatch(this.view.state.tr.setSelection(selection));
    return selection;
  }

  private onClick = () => {
    if (this.select()) this.view.focus();
  };

  private onDragStart = (event: DragEvent) => {
    const selection = this.select();
    if (!selection || !event.dataTransfer) return;
    (this.view as DraggingView).dragging = { slice: selection.content(), move: true };
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", selection.node.textContent);
    const dom = this.view.nodeDOM(selection.from);
    if (dom instanceof HTMLElement) event.dataTransfer.setDragImage(dom, 0, 0);
    this.handle.classList.add("is-dragging");
  };

  private onDragEnd = () => {
    this.handle.classList.remove("is-dragging");
    (this.view as DraggingView).dragging = null;
    this.hide();
  };
}
