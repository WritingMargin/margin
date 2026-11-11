import type { Post } from "../../shared/types";

export function visibilityChange(previous: Post["status"] | undefined, next: Post["status"], label: string) {
  if (!previous || previous === next) return null;
  if (next === "published") return { action: `Publish ${label}`, detail: "Save this change to make it publicly readable.", success: "Published. It is now live for readers." };
  if (next === "archived") return { action: `Archive ${label}`, detail: "Save this change to make it private and archived.", success: "Archived. It is not publicly visible." };
  if (previous === "published") return { action: `Unpublish ${label}`, detail: "Still live until you unpublish. Your content will be kept as a private draft.", success: "Unpublished. Your content is kept as a private draft." };
  return { action: "Restore to draft", detail: "Save this change to restore a private draft.", success: "Restored to a private draft." };
}
