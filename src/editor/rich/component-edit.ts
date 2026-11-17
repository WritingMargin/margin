/**
 * A tiny module-level hand-off between the rich editor and its NodeViews.
 * NodeViews render outside the normal React tree, so they cannot read context
 * or props. The RichWriter registers a callback here; a MarginComponentView
 * calls it with its document position when the author opens settings.
 */
export type ComponentEditRequest = { pos: number };

let handler: ((request: ComponentEditRequest) => void) | null = null;

export function setComponentEditHandler(next: ((request: ComponentEditRequest) => void) | null) {
  handler = next;
}

export function openComponentSettings(request: ComponentEditRequest) {
  handler?.(request);
}
