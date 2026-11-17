import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Box,
  Boxes,
  Columns2,
  Image,
  ListChecks,
  MapPinned,
  Megaphone,
  Minus,
  Vote,
  Workflow,
} from "lucide-react";
import { taggedExample } from "../../blocks/examples";
import { checklistExample } from "../../../shared/checklist";
import { tabsExample } from "../../../shared/tabs";

/**
 * Components a writer can drop into the pad, shared by the shelf beside the
 * pad and the "/" menu. Items with `source` insert directly; items with
 * `action` open an existing picker (media library, tabs builder, all blocks).
 */
export type CatalogAction = "media" | "tabs" | "blocks";

export type CatalogItem = {
  id: string;
  label: string;
  hint: string;
  group: "Media" | "Writing" | "Interactive";
  icon: LucideIcon;
  keywords: string;
  source?: () => string;
  action?: CatalogAction;
};

export const componentCatalog: CatalogItem[] = [
  { id: "media", label: "Image or video", hint: "From your media library", group: "Media", icon: Image, keywords: "image photo picture video upload media", action: "media" },
  { id: "callout", label: "Callout", hint: "A note readers shouldn't miss", group: "Writing", icon: Megaphone, keywords: "callout note tip warning", source: () => '[Callout tone="note"]\nWrite something worth noticing.\n[/Callout]' },
  { id: "checklist", label: "Checklist", hint: "Steps readers can tick off", group: "Writing", icon: ListChecks, keywords: "checklist todo steps tasks", source: () => checklistExample() },
  { id: "tabs", label: "Tabs", hint: "Group content into tabs", group: "Writing", icon: Columns2, keywords: "tabs panels", source: () => tabsExample() },
  { id: "divider", label: "Divider", hint: "A quiet break", group: "Writing", icon: Minus, keywords: "divider separator line break", source: () => "[Divider]" },
  { id: "chart", label: "Chart", hint: "Interactive data", group: "Interactive", icon: BarChart3, keywords: "chart graph data line bar", source: () => taggedExample("chart") },
  { id: "poll", label: "Poll", hint: "Ask readers a question", group: "Interactive", icon: Vote, keywords: "poll vote question survey", source: () => taggedExample("poll") },
  { id: "diagram", label: "Diagram", hint: "Flowcharts and sequences", group: "Interactive", icon: Workflow, keywords: "diagram flowchart mermaid sequence", source: () => taggedExample("mermaid") },
  { id: "scene", label: "3D scene", hint: "Orbit and inspect a model", group: "Interactive", icon: Box, keywords: "3d scene model", source: () => taggedExample("scene") },
  { id: "illustration", label: "Illustration", hint: "Clickable labelled drawing", group: "Interactive", icon: MapPinned, keywords: "illustration labels regions", source: () => taggedExample("illustration") },
  { id: "tab-builder", label: "Tab builder…", hint: "Name and arrange your own tabs", group: "Writing", icon: Columns2, keywords: "tabs builder custom panels", action: "tabs" },
  { id: "more", label: "More blocks…", hint: "Layouts, tab styles, and presets", group: "Interactive", icon: Boxes, keywords: "more blocks layout widgets columns", action: "blocks" },
];

/** MIME type used while a component is dragged from the shelf. */
export const COMPONENT_DRAG_TYPE = "application/x-margin-component";

export function filterCatalog(query: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return componentCatalog;
  return componentCatalog.filter(
    (item) => item.label.toLowerCase().includes(q) || item.keywords.includes(q),
  );
}

let actionHandler: ((action: CatalogAction) => void) | null = null;

/** The editor page registers how to open its pickers (media, tabs, blocks). */
export function setCatalogActionHandler(next: ((action: CatalogAction) => void) | null) {
  actionHandler = next;
}

export function runCatalogAction(action: CatalogAction) {
  actionHandler?.(action);
}
