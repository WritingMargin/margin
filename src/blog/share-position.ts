export type ShareAnchor = { top: number; bottom: number; right: number };

/** Position relative to the trigger's parent, while keeping the menu on screen. */
export function shareMenuPosition(
  anchor: ShareAnchor,
  parent: { top: number; bottom: number; left: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const gutter = 12;
  const gap = 8;
  const below = Math.max(0, viewport.height - anchor.bottom - gap - gutter);
  const above = Math.max(0, anchor.top - gap - gutter);
  const opensBelow = menu.height <= below || below >= above;
  const left = Math.max(
    gutter,
    Math.min(anchor.right - menu.width, viewport.width - gutter - menu.width),
  );
  return {
    left: left - parent.left,
    top: opensBelow ? anchor.bottom - parent.top + gap : undefined,
    bottom: opensBelow ? undefined : parent.bottom - anchor.top + gap,
    maxHeight: opensBelow ? below : above,
  };
}
