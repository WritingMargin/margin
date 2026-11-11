import { checklistExample } from "../shared/checklist";
import { codeLanguage, codeLanguages } from "../shared/code-languages";
import { newMediaTag, type MediaDefaults } from "../shared/media-defaults";
import {
  contentTags, modelTag, figmaTag,
  resolveContentTag,
  taggedBlock,
} from "../shared/content-tags";
import { tabsExample } from "../shared/tabs";
import { fontIds, typography } from "../shared/typography";
import { blockExamples } from "./blocks/examples";

export type Completion = {
  id: string;
  label: string;
  description: string;
  text: string;
  placeholder?: string;
  family?: string;
};
export type CompletionContext = {
  start: number;
  end: number;
  kind: "font" | "command";
  items: Completion[];
};

const codeCommands: Completion[] = codeLanguages.map(([language, label]) => ({
  id: `code-${language}`, label: `${label} code`, description: `Fenced ${label} code block`,
  text: `\`\`\`${language}\nCode here\n\`\`\``, placeholder: "Code here",
}));
const commands: Completion[] = [
  { id: "soundcloud", label: "SoundCloud", description: "A SoundCloud recording with artwork", text: '[SoundCloud src="https://soundcloud.com/forss/flickermood" mode="preview"]', placeholder: "https://soundcloud.com/forss/flickermood" },
  { id: "link", label: "Link preview", description: "A website preview card", text: '[Link url="https://example.com" mode="preview" title="Page title" description="A short preview"]', placeholder: "https://example.com" },
  { id: "audio", label: "Audio", description: "A voice recording or podcast alongside your text", text: '[Audio src="https://example.com/episode.mp3" title="Listen to this article"]', placeholder: "https://example.com/episode.mp3" },
  { id: "spotify", label: "Spotify", description: "A Spotify episode, show, or music player", text: '[Spotify src="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5"]', placeholder: "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" },
  { id: "checklist", label: "Interactive checklist", description: "Reader-ticked tasks, optionally floating while reading", text: checklistExample(), placeholder: "Your checklist" },
  {
    id: "citation",
    label: "Citation",
    description: "Highlight a passage and attach its source",
    text: '[Citation url="https://example.com" title="Source title"]Quoted text[/Citation]',
    placeholder: "Quoted text",
  },
  {
    id: "tabs",
    label: "Horizontal tabs",
    description: "Tabbed Markdown with a horizontal tab bar",
    text: tabsExample("horizontal"),
    placeholder: "Introduce your idea here.",
  },
  {
    id: "vertical-tabs",
    label: "Vertical tabs",
    description: "Tabbed Markdown with a vertical sidebar",
    text: tabsExample("vertical"),
    placeholder: "Introduce your idea here.",
  },
  {
    id: "tab",
    label: "Tab panel",
    description: "A Markdown panel inside Tabs",
    text: '[Tab title="New tab"]\nContent\n[/Tab]',
    placeholder: "Content",
  },
  {
    id: "font",
    label: "Font",
    description: "Give a passage its own typeface",
    text: '[Font="Caveat"]Text[/Font]',
    placeholder: "Text",
  },
  {
    id: "callout",
    label: "Callout",
    description: "A note that stands out",
    text: '[Callout tone="note"]\nText\n[/Callout]',
    placeholder: "Text",
  },
  {
    id: "image",
    label: "Image",
    description: "Framed image with a caption",
    text: '[Image src="https://example.com/image.jpg" frame="border" caption="Caption"]',
    placeholder: "https://example.com/image.jpg",
  },
  {
    id: "social",
    label: "Social post",
    description: "X, Instagram or LinkedIn card with an optional embed",
    text: '[Social url="https://x.com/username/status/123456789" title="A post worth reading"]',
    placeholder: "https://x.com/username/status/123456789",
  },
  {
    id: "video",
    label: "Video",
    description: "YouTube, Vimeo, Mux, Cloudinary, or a video file",
    text: '[Video src="https://example.com/video.mp4" frame="border"]',
    placeholder: "https://example.com/video.mp4",
  },
  {
    id: "carousel",
    label: "Image carousel",
    description: "A gallery of image slides",
    text: '[Carousel title="Image gallery" fit="contain"]\n[Image src="https://example.com/image.jpg" caption="Caption"]\n[/Carousel]',
    placeholder: "https://example.com/image.jpg",
  },
  {
    id: "mark",
    label: "Highlight",
    description: "Highlight a phrase",
    text: "[Highlight]Text[/Highlight]",
    placeholder: "Text",
  },
  {
    id: "columns",
    label: "Columns",
    description: "Two columns of Markdown",
    text: '[Columns ratio="equal"]\n[Column]\nLeft column\n[/Column]\n[Column]\nRight column\n[/Column]\n[/Columns]',
    placeholder: "Left column",
  },
  {
    id: "widget",
    label: "Widget",
    description: "Control a block’s width and alignment",
    text: '[Widget width="half" align="left"]\nText\n[/Widget]',
    placeholder: "Text",
  },
  {
    id: "column",
    label: "Column",
    description: "A cell inside Columns",
    text: "[Column]\nText\n[/Column]",
    placeholder: "Text",
  },
  {
    id: "widgets",
    label: "Widgets",
    description: "A row of visual blocks",
    text: '[Widgets columns="2"]\n[Widget]\nText\n[/Widget]\n[/Widgets]',
    placeholder: "Text",
  },
  {
    id: "clear",
    label: "Clear wrapping",
    description: "Continue below a wrapped visual",
    text: "[Clear]",
  },
  {
    id: "divider",
    label: "Divider",
    description: "Separate two sections",
    text: "[Divider]",
  },
  {
    id: "heading",
    label: "Heading",
    description: "Start a new section",
    text: "## Heading",
    placeholder: "Heading",
  },
  {
    id: "quote",
    label: "Quote",
    description: "A block quotation",
    text: "> Quote",
    placeholder: "Quote",
  },
  {
    id: "task",
    label: "Task list",
    description: "A Markdown checklist",
    text: "- [ ] Task",
    placeholder: "Task",
  },
  { id: "model", label: "3D model", description: "An uploaded or hosted model with an optional animation clip", text: modelTag("/assets/model.glb", "3D model"), placeholder: "/assets/model.glb" },
  { id: "figma", label: "Figma embed", description: "An interactive Figma design, prototype or FigJam board", text: figmaTag("https://www.figma.com/design/FILEKEY", "Design"), placeholder: "https://www.figma.com/design/FILEKEY" },
  ...blockExamples.map((example) => ({
    id: example.language,
    label: example.language === "mermaid" ? "Diagram" : example.title,
    description: example.description,
    text: taggedBlock(example.language, example.source).trim(),
  })),
  ...codeCommands,
];

const propertyOptions: Record<string, string[]> = {
  width: ["full", "two-thirds", "half", "third"],
  height: ["240", "360", "480", "640"],
  align: ["left", "center", "right"],
  wrap: ["true", "false"],
  sticky: ["true", "false"],
  orientation: ["horizontal", "vertical"],
  variant: ["underline", "pills", "boxed"],
  spacing: ["comfortable", "compact"],
  initial: ["1", "2", "3"],
  accent: ["#242424", "#3b5ccc", "#38734b"],
  radius: ["0", "4", "8", "12", "24"],
  tone: ["note", "tip", "warning"],
  frame: ["auto", "plain", "border", "polaroid"],
  fit: ["contain", "cover"],
  columns: ["2", "3"],
  ratio: ["equal", "wide-left", "wide-right"],
  url: ["https://x.com/username/status/123456789"],
  src: ["https://example.com/image.jpg"],
  alt: ["Description"],
  caption: ["Caption"],
  title: ["Image gallery"],
};
const fixedTagProperties: Record<string, string[]> = {
  Model: ["src", "title", "clip", "description", "width", "height", "align", "wrap"],
  Figma: ["url", "title", "width", "height", "align", "wrap"],
  Social: ["url", "title"], Checklist: ["title", "floating"], Callout: ["tone"], Tab: ["title"], Carousel: ["title", "fit"],
};
const propertiesFor = (tag: string): string[] => {
  if (["Diagram", "Mermaid", "Chart", "Scene", "Illustration", "Widget"].includes(tag))
    return ["width", "height", "align", "wrap"];
  if (tag === "Video")
    return [
      "src",
      "title",
      "caption",
      "frame",
      "width",
      "align",
      "wrap",
      "ratio",
      "sticky",
    ];
  if (["Audio", "Spotify", "SoundCloud"].includes(tag)) return ["src", "title", "caption", "width", "align", "mode"];
  if (tag === "Link") return ["url", "title", "description", "image", "mode"];
  if (tag === "Image")
    return ["src", "alt", "caption", "frame", "width", "align"];
  if (["Columns", "Widgets"].includes(tag)) return ["columns", "ratio"];
  if (tag === "Tabs")
    return [
      "orientation",
      "title",
      "variant",
      "spacing",
      "initial",
      "accent",
      "radius",
    ];
  return fixedTagProperties[tag] ?? [];
};
const tagValues: Record<string, Record<string, string[]>> = {
  Audio: { mode: ["player", "preview"], src: ["https://example.com/episode.mp3"], title: ["Listen to this article"], width: ["full", "wide", "small"] },
  Spotify: { mode: ["player", "preview"], src: ["https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5"], title: ["Listen on Spotify"], width: ["full", "wide", "small"] },
  Image: { width: ["full", "wide", "small"] },
  Video: {
    width: [
      "full",
      "wide",
      "two-thirds",
      "half",
      "third",
      "small",
      "75%",
      "40%",
    ],
    ratio: ["auto", "16:9", "4:3", "1:1", "9:16", "21:9"],
    title: ["Video title"],
    src: ["https://example.com/video.mp4"],
  },
  SoundCloud: { mode: ["player", "preview"], src: ["https://soundcloud.com/forss/flickermood"] },
  Model: { src: ["/assets/model.glb"], title: ["3D model"], clip: ["/assets/animation.json"], description: ["Describe the model"] },
  Figma: { url: ["https://www.figma.com/design/FILEKEY"], title: ["Design"] },
  Link: { mode: ["link", "preview", "figma"], url: ["https://example.com"], title: ["Page title"], description: ["A short preview"], image: ["https://example.com/image.jpg"] },
  Checklist: { title: ["Your checklist"], floating: ["false", "true"] },
  Tabs: { title: ["Explore the idea"] },
  Tab: { title: ["Overview", "Details", "Takeaways"] },
};
const valuesFor = (tag: string, name: string) =>
  tagValues[tag]?.[name] || propertyOptions[name];

function propertyCompletions(
  line: string,
  lineStart: number,
  text: string,
  caret: number,
): CompletionContext | null {
  const match = /\[([a-z]+)\s+([^\]\n]*)$/i.exec(line);
  const tag = match && resolveContentTag(match[1]);
  if (!match || !tag) return null;
  const start = lineStart + match.index;
  if (escaped(text, start) || inCode(text, start)) return null;
  const properties = propertiesFor(tag);
  const value = /([a-z]+)\s*=\s*(["']?)([^"']*)$/i.exec(match[2]);
  const name = value?.[1].toLowerCase();
  if (value && name && properties.includes(name)) {
    return valueCompletions(tag, name, value, text, caret);
  }
  const query = /[a-z]*$/i.exec(match[2])![0].toLowerCase();
  const used = new Set(
    [...match[2].matchAll(/([a-z]+)\s*=\s*(?:"[^"]*"|'[^']*')/gi)].map((attr) =>
      attr[1].toLowerCase(),
    ),
  );
  return {
    start: caret - query.length,
    end: caret,
    kind: "command",
    items: properties
      .filter((name) => !used.has(name) && name.startsWith(query))
      .map((name) => {
        const values = valuesFor(tag, name);
        const value = values[0];
        return {
          id: name,
          label: name,
          description: `${tag} · ${values.join(", ")}`,
          text: `${name}="${value}"`,
          placeholder: value,
        };
      }),
  };
}

function escaped(text: string, at: number) {
  let count = 0;
  while (at > 0 && text[--at] === "\\") count++;
  return count % 2 === 1;
}

// Ignore fenced/indented code and inline code; an unfinished opening fence is a command trigger.
function inCode(text: string, at: number) {
  const before = text.slice(0, at);
  const lines = before.split("\n");
  const fence = openFence(lines.slice(0, -1));
  if (fence || /^(?: {4}|\t)/.test(lines.at(-1)!)) return true;
  let ticks = 0;
  for (const match of before.matchAll(/`+/g)) {
    if (escaped(before, match.index!)) continue;
    if (!ticks) ticks = match[0].length;
    else if (ticks === match[0].length) ticks = 0;
  }
  return ticks > 0;
}

export function getCompletions(
  text: string,
  caret: number,
  selectionEnd = caret,
): CompletionContext | null {
  if (caret !== selectionEnd) return null;
  const before = text.slice(0, caret);
  const lineStart = before.lastIndexOf("\n") + 1;
  const line = before.slice(lineStart);
  const rawTag = rawTagAt(before.slice(0, lineStart));
  if (rawTag && !/^\s*\[\//.test(line)) return null;
  const property = propertyCompletions(line, lineStart, text, caret);
  if (property) return property;
  return (
    fontCompletions(line, lineStart, text, caret) ||
    closingCompletions(line, lineStart, text, caret, rawTag) ||
    tagCompletions(line, lineStart, text, caret) ||
    commandCompletions(line, lineStart, text, caret)
  );
}

export function applyCompletion(
  text: string,
  context: CompletionContext,
  item: Completion,
) {
  const content =
    text.slice(0, context.start) + item.text + text.slice(context.end);
  const placeholder = item.placeholder
    ? item.text.indexOf(item.placeholder)
    : -1;
  const start =
    context.start + (placeholder >= 0 ? placeholder : item.text.length);
  return {
    content,
    start,
    end: start + (placeholder >= 0 ? item.placeholder!.length : 0),
  };
}

function valueCompletions(
  tag: string,
  name: string,
  value: RegExpExecArray,
  text: string,
  caret: number,
): CompletionContext {
  const query = value[3].toLowerCase();
  const tail = value[2]
    ? /^[^"'\]\n]*["']/.exec(text.slice(caret))?.[0] || ""
    : "";
  return {
    start: caret - value[0].length,
    end: caret + tail.length,
    kind: "command",
    items: valuesFor(tag, name)
      .filter((option) => option.toLowerCase().includes(query))
      .map((option) => ({
        id: `${name}-${option}`,
        label: option,
        description: `${tag} · ${name}`,
        text: `${name}="${option}"`,
      })),
  };
}

function openFence(lines: string[]) {
  let fence = "";
  let length = 0;
  for (const line of lines) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    if (!fence) {
      fence = match[1][0];
      length = match[1].length;
    } else if (
      match[1][0] === fence &&
      match[1].length >= length &&
      !match[2].trim()
    )
      fence = "";
  }

  return fence;
}

function fontCompletions(
  line: string,
  lineStart: number,
  text: string,
  caret: number,
): CompletionContext | null {
  const font = /\[(?:f(?:o(?:n(?:t)?)?)?(?:\s*=\s*["']?([^"'\]\n]*))?)$/i.exec(
    line,
  );
  if (font) {
    const start = lineStart + font.index;
    if (escaped(text, start) || inCode(text, start)) return null;
    const query = (font[1] || "").trim().toLowerCase();
    const tail = /^[^\[\]\n]*["']\]/.exec(text.slice(caret));
    const end = caret + (tail?.[0].length || 0);
    let hasClose = hasClosingFont(text, end);
    const items = fontIds
      .filter((id) =>
        `${id} ${typography[id].name} ${typography[id].description}`
          .toLowerCase()
          .includes(query),
      )
      .map((id) => {
        const font = typography[id];
        const opening = `[Font="${font.name}"]`;
        return {
          id,
          label: font.name,
          description: font.description,
          family: font.family,
          text: opening + (tail || hasClose ? "" : "Text[/Font]"),
          placeholder: tail || hasClose ? undefined : "Text",
        };
      });
    return { start, end, kind: "font", items };
  }

  return null;
}

function hasClosingFont(text: string, end: number) {
  let depth = 0;
  let hasClose = false;
  for (const marker of text.slice(end).matchAll(/\[Font\s*=|\[\/Font\]/gi)) {
    if (marker[0][1] !== "/") depth++;
    else if (depth) depth--;
    else {
      hasClose = true;
      break;
    }
  }
  return hasClose;
}

function closingCompletions(
  line: string,
  lineStart: number,
  text: string,
  caret: number,
  rawTag: string,
): CompletionContext | null {
  const close = /\[\/([a-z]*)$/i.exec(line);
  if (
    close &&
    !escaped(text, lineStart + close.index) &&
    !inCode(text, lineStart + close.index)
  ) {
    const names = [
      "Font",
      "Highlight",
      ...Object.keys(contentTags).filter(
        (name) => contentTags[name as keyof typeof contentTags].kind !== "leaf",
      ),
    ];
    return {
      start: lineStart + close.index,
      end: caret + (text[caret] === "]" ? 1 : 0),
      kind: "command",
      items: names
        .filter(
          (name) =>
            name.toLowerCase().startsWith(close[1].toLowerCase()) &&
            (!rawTag || name.toLowerCase() === rawTag),
        )
        .map((name) => ({
          id: `close-${name.toLowerCase()}`,
          label: `Close ${name}`,
          description: `End the ${name.toLowerCase()} section`,
          text: `[/${name}]`,
        })),
    };
  }

  return null;
}

function tagCompletions(
  line: string,
  lineStart: number,
  text: string,
  caret: number,
): CompletionContext | null {
  const tag = /\[([a-z]*)$/i.exec(line);
  if (
    tag &&
    !escaped(text, lineStart + tag.index) &&
    !inCode(text, lineStart + tag.index)
  ) {
    return {
      start: lineStart + tag.index,
      end: caret + (text[caret] === "]" ? 1 : 0),
      kind: "command",
      items: commands.filter(
        (item) =>
          item.text.startsWith("[") &&
          `${item.id} ${item.label} ${item.text.split("]")[0]}`
            .toLowerCase()
            .includes(tag[1].toLowerCase()),
      ),
    };
  }

  return null;
}

function commandCompletions(
  line: string,
  lineStart: number,
  text: string,
  caret: number,
): CompletionContext | null {
  const trigger = /^( {0,3})(\/|:{1,3}|```)([\w #+.-]*)$/.exec(line);
  if (!trigger || inCode(text, lineStart + trigger[1].length)) return null;
  const query = trigger[3].trim().toLowerCase();
  const items = commands.filter((item) => {
    if (
      trigger[2] === "```" &&
      !item.id.startsWith("code-") && !blockExamples.some((example) => example.language === item.id)
    )
      return false;
    if (
      trigger[2].startsWith(":") &&
      ![
        "tabs",
        "vertical-tabs",
        "tab",
        "callout",
        "image",
        "video",
        "carousel",
        "mark",
        "columns",
        "widget",
        "divider",
      ].includes(item.id)
    )
      return false;
    if (item.id === `code-${codeLanguage(query)}`) return true;
    return `${item.id} ${item.label} ${item.description}`
      .toLowerCase()
      .includes(query);
  });
  if (trigger[2] === "```") {
    const existing = existingCodeFence(text, caret, items);
    if (existing) return { ...existing, start: lineStart + trigger[1].length, kind: "command" };
  }
  return {
    start: lineStart + trigger[1].length,
    end: caret,
    kind: "command",
    items,
  };
}

function existingCodeFence(text: string, caret: number, items: Completion[]) {
  const newline = text.indexOf("\n", caret);
  if (newline < 0 || !/^ {0,3}`{3,}[ \t]*$/m.test(text.slice(newline + 1))) return null;
  const meta = /^[\w#+.-]*([ \t].*)?$/.exec(text.slice(caret, newline))?.[1] || "";
  return {
    end: newline,
    items: items.filter(item => item.id.startsWith("code-")).map(item => ({
      ...item, text: "```" + item.id.slice(5) + meta, placeholder: undefined,
    })),
  };
}

function rawTagAt(before: string) {
  let rawTag = "";
  let codeFence = "";
  let codeFenceLength = 0;
  for (const earlier of before.split("\n")) {
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(earlier);
    if (!rawTag && fence) {
      ({ codeFence, codeFenceLength } = advanceFence(
        codeFence,
        fence,
        codeFenceLength,
      ));
      continue;
    }
    if (codeFence) continue;
    const marker =
      /^ {0,3}\[(\/?)(Diagram|Mermaid|Chart|Scene|Illustration)(?:\s[^\]]*)?\]\s*$/i.exec(
        earlier,
      );
    if (!marker) continue;
    if (!rawTag && !marker[1]) rawTag = marker[2].toLowerCase();
    else if (marker[1] && marker[2].toLowerCase() === rawTag) rawTag = "";
  }

  return rawTag;
}

function advanceFence(
  codeFence: string,
  fence: RegExpExecArray,
  codeFenceLength: number,
) {
  if (!codeFence) {
    codeFence = fence[1][0];
    codeFenceLength = fence[1].length;
  } else if (
    fence[1][0] === codeFence &&
    fence[1].length >= codeFenceLength &&
    !fence[2].trim()
  )
    codeFence = "";
  return { codeFence, codeFenceLength };
}

export function mediaCompletion(
  item: Completion,
  defaults: MediaDefaults,
): Completion {
  if (item.id !== "image" && item.id !== "video") return item;
  const src =
    item.placeholder ||
    `https://example.com/${item.id === "image" ? "image.jpg" : "video.mp4"}`;
  return { ...item, text: newMediaTag(item.id, src, defaults) };
}
