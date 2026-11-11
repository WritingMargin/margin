export const normalizePassage = (text: string) =>
  text.replace(/\s+/gu, " ").trim();
const readableBlocks = "p, h1, h2, h3, h4, h5, h6, pre, td, li, a, figcaption, svg text, .rich-block span, .rich-block strong, .rich-block dt, .rich-block dd";
function passageBlocks(root: HTMLElement) {
  return [...root.querySelectorAll(readableBlocks)].filter((block) => {
    if (block.closest(".article-toc, .checklist-dock, .block-source")) return false;
    if (block.matches("a, figcaption, svg text, span, strong, dt, dd") && block.parentElement?.closest("p, h1, h2, h3, h4, h5, h6, pre, td, li, figcaption, a, span, strong, dt, dd")) return false;
    return !block.querySelector("p, li, pre");
  });
}
export function passageText(root: HTMLElement): string {
  return passageBlocks(root).map((block) => blockText(block).text).filter(Boolean).join(" ");
}
// Map normalized text back to DOM offsets without rewriting React-owned content.
export function passageRange(root: HTMLElement, quote: string, occurrence = 0): Range | null {
  const offsets: { node: Node; offset: number }[] = [];
  let text = "";
  for (const block of passageBlocks(root)) {
    const mapped = blockText(block);
    if (text && mapped.offsets.length) {
      text += " ";
      offsets.push(mapped.offsets[0]);
    }
    text += mapped.text;
    offsets.push(...mapped.offsets);
  }
  return mappedRange(text, normalizePassage(quote), offsets, occurrence);
}
export function passageSelectionOccurrence(root: HTMLElement, range: Range, quote: string): number {
  let text = "";
  let selected = -1;
  for (const block of passageBlocks(root)) {
    const mapped = blockText(block);
    if (text && mapped.offsets.length) text += " ";
    if (selected < 0 && block.contains(range.startContainer)) {
      const index = mapped.offsets.findIndex(({ node, offset }) => range.comparePoint(node, offset) === 0);
      if (index >= 0) selected = text.length + index;
    }
    text += mapped.text;
  }
  const needle = normalizePassage(quote);
  return countPassageOccurrences(text, needle, selected);
}
function countPassageOccurrences(text: string, needle: string, selected: number): number {
  let occurrence = 0;
  for (let start = 0; needle && selected >= 0;) {
    const index = text.indexOf(needle, start);
    if (index < 0 || index >= selected) break;
    occurrence++;
    start = index + needle.length;
  }
  return occurrence;
}
// Earlier-version anchors retain an approximate document position. Place their
// marker beside the closest readable block without highlighting replacement text.
export function passagePosition(root: HTMLElement, position: number): Element | null {
  let offset = 0;
  let nearest: Element | null = null;
  for (const block of passageBlocks(root)) {
    nearest = block;
    offset += normalizePassage(block.textContent || "").length + 1;
    if (offset >= position) return block;
  }
  return nearest;
}
function blockText(block: Element) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const offsets: { node: Node; offset: number }[] = [];
  let text = "";
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const source = node.textContent || "";
    for (let offset = 0; offset < source.length; offset++) {
      const char = /\s/u.test(source[offset]) ? " " : source[offset];
      if (char === " " && (!text || text.endsWith(" "))) continue;
      text += char;
      offsets.push({ node, offset });
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    offsets.pop();
  }
  return { text, offsets };
}

function mappedRange(
  text: string,
  quote: string,
  offsets: { node: Node; offset: number }[],
  occurrence: number,
) {
  let start = 0;
  for (let index = 0; index <= occurrence; index++) {
    const found = text.indexOf(quote, start);
    if (!quote || found < 0) return null;
    start = found;
    if (index < occurrence) start += quote.length;
  }
  const first = offsets[start],
    last = offsets[start + quote.length - 1];
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}
