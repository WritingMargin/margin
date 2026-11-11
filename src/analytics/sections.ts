import type { AnalyticsSection } from "../../shared/analytics";
export interface ReadingSection extends AnalyticsSection {
  node: HTMLElement;
}
export function articleSections(content: HTMLElement | null): ReadingSection[] {
  if (!content) return [];
  const headings = [
    ...content.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"),
  ].slice(0, 99);
  return [
    { id: "intro", label: "Introduction", activeMs: 0, node: content },
    ...headings.map((node, index) => ({
      id: `section-${index + 1}`,
      label: (node.textContent?.trim() || "Untitled section").slice(0, 200),
      activeMs: 0,
      node,
    })),
  ];
}
export function visibleSection(
  sections: ReadingSection[],
  content: HTMLElement | null,
): ReadingSection | undefined {
  if (!content) return;
  const bottom = content.getBoundingClientRect().bottom;
  let best: ReadingSection | undefined,
    area = 0;
  sections.forEach((section, index) => {
    const top = section.node.getBoundingClientRect().top;
    const next =
      sections[index + 1]?.node.getBoundingClientRect().top ?? bottom;
    const overlap = Math.max(0, Math.min(innerHeight, next) - Math.max(0, top));
    if (overlap > area) {
      area = overlap;
      best = section;
    }
  });
  return best;
}
export function selectionSection(
  sections: ReadingSection[],
  range: Range,
): string {
  const top = range.getBoundingClientRect().top;
  let id = "intro";
  for (const section of sections) {
    if (section.node.getBoundingClientRect().top <= top + 1) id = section.id;
  }
  return id;
}
