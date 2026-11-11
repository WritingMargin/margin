export const widgetWidths = ["full", "two-thirds", "half", "third"] as const;
export type WidgetWidth = (typeof widgetWidths)[number];

/** Only known layout tokens and bounded integer heights reach the renderer. */
export function widgetProperties(
  name: string,
  attributes: Record<string, string | null | undefined>,
): { className: string[]; dataWidgetHeight?: string } {
  if (name === "column") return { className: ["widget-column"] };
  if (name === "widgets" || name === "columns") {
    return gridProperties(attributes);
  }
  const { width, align } = widgetAlignment(attributes);
  const height = widgetHeight(attributes);
  const wrap =
    attributes.wrap === "true" && width !== "full" && align !== "center";
  return {
    className: [
      "widget-frame",
      `widget-width-${width}`,
      `widget-align-${align}`,
      ...(wrap ? [`widget-wrap-${align}`] : []),
    ],
    ...(height >= 200 && height <= 800
      ? { dataWidgetHeight: String(height) }
      : {}),
  };
}

function widgetAlignment(
  attributes: Record<string, string | null | undefined>,
) {
  const width = widgetWidths.includes(attributes.width as WidgetWidth)
    ? attributes.width
    : "full";
  const align = ["left", "center", "right"].includes(attributes.align || "")
    ? attributes.align
    : "center";
  return { width, align };
}

function widgetHeight(attributes: Record<string, string | null | undefined>) {
  return /^\d{3}$/.test(attributes.height || "")
    ? Number(attributes.height)
    : 0;
}

function gridProperties(attributes: Record<string, string | null | undefined>) {
  const columns = attributes.columns === "3" ? "3" : "2";
  const ratio =
    columns === "2" &&
    ["wide-left", "wide-right"].includes(attributes.ratio || "")
      ? attributes.ratio
      : "equal";
  return {
    className: [
      "widget-grid",
      `widget-columns-${columns}`,
      `widget-ratio-${ratio}`,
    ],
  };
}

export function sizeWidget(
  content: string,
  width: WidgetWidth = "full",
  height = "auto",
  align = "center",
  wrap = false,
) {
  return `\n\n[Widget width="${width}"${height === "auto" ? "" : ` height="${height}"`} align="${align}"${wrap ? ' wrap="true"' : ""}]\n${content.trim()}\n[/Widget]\n\n`;
}

export function widgetRow(
  contents: string[],
  columns: 2 | 3 = 2,
  height = "auto",
) {
  return `\n\n[Widgets columns="${columns}"]\n${contents.map((content) => sizeWidget(content, "full", height)).join("\n")}[/Widgets]\n\n`;
}

export function textVisualRow(visual: string, height = "auto") {
  return `\n\n[Columns columns="2" ratio="equal"]\n\n[Column]\n## Explain the idea\n\nGive your reader the context they need, then let the visual demonstrate it.\n\n- Describe what to look for.\n- Explain the important comparison.\n- Connect the result to your conclusion.\n\n**Try it:** interact with the visual beside this text.\n[/Column]\n\n[Column]\n${sizeWidget(visual, "full", height)}[/Column]\n\n[/Columns]\n\n`;
}
