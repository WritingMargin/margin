import { tagAttributes } from "./content-tags";
export type TabsVariant = "underline" | "pills" | "boxed";
export interface TabsOptions {
  orientation: TabsOrientation;
  variant: TabsVariant;
  spacing: "compact" | "comfortable";
  initial: number;
  accent?: string;
  radius?: number;
}
export function tabOptions(attributes: Record<string, unknown>): TabsOptions {
  const radius = String(attributes.radius ?? "");
  const initial = String(attributes.initial ?? "1");
  return {
    orientation:
      attributes.orientation === "vertical" ? "vertical" : "horizontal",
    variant:
      attributes.variant === "pills" || attributes.variant === "boxed"
        ? attributes.variant
        : "underline",
    spacing: attributes.spacing === "compact" ? "compact" : "comfortable",
    initial: initialTab(initial),
    ...tabAccent(attributes),
    ...(/^\d{1,2}$/.test(radius) && Number(radius) <= 24
      ? { radius: Number(radius) }
      : {}),
  };
}
function tabAccent(
  attributes: Record<string, unknown>,
): Pick<TabsOptions, "accent"> {
  return typeof attributes.accent === "string" &&
    /^#[0-9a-f]{6}$/i.test(attributes.accent)
    ? { accent: attributes.accent }
    : {};
}

function initialTab(initial: string): number {
  return /^\d{1,3}$/.test(initial) &&
    Number(initial) >= 1 &&
    Number(initial) <= 100
    ? Number(initial)
    : 1;
}

export function tabsMarkdown(
  title: string,
  options: TabsOptions,
  panels: { title: string; content: string }[],
): string {
  const safe = tabOptions({ ...options });
  const attributes = Object.fromEntries(
    Object.entries({ title, ...safe }).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
  return `[Tabs${tagAttributes(attributes)}]\n${panels.map((panel) => `[Tab${tagAttributes({ title: panel.title })}]\n${panel.content}\n[/Tab]`).join("\n\n")}\n[/Tabs]`;
}
export type TabsOrientation = "horizontal" | "vertical";
export const tabsExample = (
  orientation: TabsOrientation = "horizontal",
) => `[Tabs orientation="${orientation}" title="Explore the idea"]
[Tab title="Overview"]
## The big picture

Introduce your idea here. Each tab supports **Markdown**, images, and interactive blocks.
[/Tab]

[Tab title="Details"]
## A closer look

- Add a useful detail.
- Explain how it works.
- Share an example.
[/Tab]

[Tab title="Takeaways"]
> Leave your reader with something worth remembering.
[/Tab]
[/Tabs]`;
