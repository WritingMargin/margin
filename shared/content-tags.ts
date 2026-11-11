/** Author-facing tags share the existing Markdown renderers and their validation. */
export const contentTags = {
  Model: { kind: "leaf", target: "scene" },
  Figma: { kind: "leaf", target: "linkcard" },
  Social: { kind: "leaf", target: "social" },
  Diagram: { kind: "raw", target: "mermaid" },
  Mermaid: { kind: "raw", target: "mermaid" },
  Chart: { kind: "raw", target: "chart" },
  Scene: { kind: "raw", target: "scene" },
  Illustration: { kind: "raw", target: "illustration" },
  Poll: { kind: "raw", target: "poll" },
  Checklist: { kind: "container", target: "checklist" },
  Callout: { kind: "container", target: "callout" },
  Carousel: { kind: "container", target: "carousel" },
  Tabs: { kind: "container", target: "tabs" },
  Tab: { kind: "container", target: "tab" },
  Widget: { kind: "container", target: "widget" },
  Widgets: { kind: "container", target: "widgets" },
  Columns: { kind: "container", target: "columns" },
  Column: { kind: "container", target: "column" },
  Image: { kind: "leaf", target: "image" },
  Audio: { kind: "leaf", target: "audio" },
  SoundCloud: { kind: "leaf", target: "audio" },
  Link: { kind: "leaf", target: "linkcard" },
  Spotify: { kind: "leaf", target: "audio" },
  Video: { kind: "leaf", target: "video" },
  Divider: { kind: "leaf", target: "divider" },
  Clear: { kind: "leaf", target: "clear" },
} as const;
export type ContentTag = keyof typeof contentTags;
export const resolveContentTag = (name: string) =>
  (Object.keys(contentTags) as ContentTag[]).find(
    (tag) => tag.toLowerCase() === name.toLowerCase(),
  );
export const tagAttributes = (attributes: Record<string, string>) =>
  Object.entries(attributes)
    .map(
      ([name, value]) =>
        ` ${name}=${JSON.stringify(value.replace(/[\r\n]/g, " "))}`,
    )
    .join("");
export function modelTag(src: string, title: string, clip?: string) {
  return `[Model${tagAttributes({ src, title, ...(clip ? { clip } : {}) })}]`;
}
export function figmaTag(url: string, title: string) {
  return `[Figma${tagAttributes({ url, title })}]`;
}

export const taggedBlock = (language: string, source: string) => {
  const tag =
    language === "illustration"
      ? "Illustration"
      : language === "poll"
        ? "Poll"
        : language === "mermaid"
          ? "Diagram"
          : language === "scene"
            ? "Scene"
            : "Chart";
  return `\n\n[${tag}]\n${source}\n[/${tag}]\n\n`;
};

type Marker = {
  tag: ContentTag;
  close: boolean;
  attributes: Record<string, string>;
};
export function marker(line: string): Marker | null {
  const match = /^ {0,3}\[(\/?)([a-z]+)([^\r\n]*)\][ \t]*$/i.exec(line);
  if (!match) return null;
  const tag = resolveContentTag(match[2]);
  if (!tag) return null;
  const attributes: Record<string, string> = Object.create(null);
  let rest = match[3];
  if (match[1]) return rest.trim() ? null : { tag, close: true, attributes };
  rest = rest.replace(/\s*\/\s*$/, "");
  while (rest.trim()) {
    const attr =
      /^\s+([a-z][a-z0-9_-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/i.exec(
        rest,
      );
    if (!attr) return null;
    try {
      attributes[attr[1].toLowerCase()] =
        attr[2][0] === '"'
          ? JSON.parse(attr[2])
          : attr[2].slice(1, -1).replace(/\\(['\\])/g, "$1");
    } catch {
      return null;
    }
    rest = rest.slice(attr[0].length);
  }
  return { tag, close: false, attributes };
}

const directiveAttributes = (attributes: Record<string, string>) => {
  const encoded = Object.entries(attributes)
    .map(
      ([key, value]) =>
        `${key}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;")}"`,
    )
    .join(" ");
  return encoded ? `{${encoded}}` : "";
};
const longerFence = (body: string, character: ":" | "`", minimum: number) => {
  let length = minimum;
  for (const match of body.matchAll(character === ":" ? /:+/g : /`+/g))
    length = Math.max(length, match[0].length + 1);
  return character.repeat(length);
};

type Frame = { marker?: Marker; start: number; output: string[] };

class TagExpansion {
  stack: Frame[] = [{ start: 0, output: [] }];
  fence = "";
  fenceLength = 0;
  inlineTicks = 0;
  get current() {
    return this.stack.at(-1)!;
  }

  raw(line: string, token: Marker | null) {
    const current = this.current;
    if (!current.marker || contentTags[current.marker.tag].kind !== "raw")
      return false;
    if (token?.close && token.tag === current.marker.tag) {
      this.stack.pop();
      this.current.output.push(`\n${renderRaw(current, token)}\n`);
    } else current.output.push(line);
    return true;
  }

  code(line: string) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (this.fence) {
      this.current.output.push(line);
      if (
        match &&
        match[1][0] === this.fence &&
        match[1].length >= this.fenceLength &&
        !match[2].trim()
      )
        this.fence = "";
      return true;
    }
    if (!match || this.inlineTicks) return false;
    this.fence = match[1][0];
    this.fenceLength = match[1].length;
    this.current.output.push(line);
    return true;
  }

  tag(token: Marker | null, index: number) {
    if (!token || this.inlineTicks) return false;
    const spec = contentTags[token.tag];
    if (token.close) return this.closeTag(token);
    if (spec.kind === "leaf") {
      this.current.output.push(`\n${renderLeaf(token, spec.target)}\n`);
      return true;
    }
    if (this.stack.length >= 33) return false;
    this.stack.push({ marker: token, start: index, output: [] });
    return true;
  }

  closeTag(token: Marker) {
    const current = this.current;
    if (current.marker?.tag !== token.tag) return false;
    this.stack.pop();
    const body = current.output.join("\n");
    const colons = longerFence(body, ":", 3);
    this.current.output.push(
      `\n${colons}${contentTags[token.tag].target}${directiveAttributes(current.marker.attributes)}\n\n${body}\n\n${colons}\n`,
    );
    return true;
  }

  literal(line: string) {
    this.current.output.push(line);
    if (/^(?: {4}|\t)/.test(line)) return;
    for (const ticks of line.matchAll(/(?<!\\)(?:\\\\)*(`+)/g)) {
      if (!this.inlineTicks) this.inlineTicks = ticks[1].length;
      else if (this.inlineTicks === ticks[1].length) this.inlineTicks = 0;
    }
    if (!line.trim()) this.inlineTicks = 0;
  }
}

function renderRaw(current: Frame, token: Marker) {
  const body = current.output.join("\n");
  const ticks = longerFence(body, "`", 3);
  const rendered = `${ticks}${contentTags[token.tag].target}\n${body}\n${ticks}`;
  return withLayout(rendered, current.marker!.attributes);
}

function renderLeaf(token: Marker, target: string) {
  const attrs = token.attributes;
  if (token.tag === "Model") {
    const title = attrs.title || "3D model";
    const scene = {
      title,
      description: attrs.description,
      objects: [
        {
          shape: "model",
          label: title,
          src: attrs.src,
          animationSrc: attrs.clip,
        },
      ],
    };
    return withLayout("```scene\n" + JSON.stringify(scene) + "\n```", attrs);
  }
  if (token.tag === "Figma") {
    const properties = {
      url: attrs.url || "",
      title: attrs.title || "Open in Figma",
      mode: "figma",
    };
    return withLayout(`::linkcard${directiveAttributes(properties)}`, attrs);
  }
  return `::${target}${directiveAttributes(attrs)}`;
}

function withLayout(rendered: string, attrs: Record<string, string>) {
  const layout = Object.fromEntries(
    Object.entries(attrs).filter(([key]) =>
      ["width", "height", "align", "wrap"].includes(key),
    ),
  );
  if (!Object.keys(layout).length) return rendered;
  const colons = longerFence(rendered, ":", 3);
  return `${colons}widget${directiveAttributes(layout)}\n\n${rendered}\n\n${colons}`;
}

/** Convert standalone block tags. Code samples, raw payloads, and unknown/unclosed tags remain literal. */
export function expandContentTags(content: string): string {
  const lines = content.split(/\r?\n/);
  const parser = new TagExpansion();
  lines.forEach((line, index) => {
    const token = marker(line);
    if (
      parser.raw(line, token) ||
      parser.code(line) ||
      parser.tag(token, index)
    )
      return;
    parser.literal(line);
  });
  if (parser.stack.length > 1)
    parser.stack[0].output.push(...lines.slice(parser.stack[1].start));
  return parser.stack[0].output.join("\n");
}
