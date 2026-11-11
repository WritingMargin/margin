import { resolveAudio } from "../../shared/audio";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { tabOptions } from "../../shared/tabs";
import { widgetProperties } from "../blocks/layout";
import { safeMediaUrl, safeVideoUrl } from "../media";

type Attributes = Record<string, string>;
type Directive = {
  type: string;
  name: string;
  attributes?: Attributes;
  data?: Record<string, any>;
  children: Directive[];
};
const choice = (
  value: string | undefined,
  allowed: string[],
  defaultValue: string,
) => (allowed.includes(value || "") ? value! : defaultValue);
function tabs(attrs: Attributes) {
  const options = tabOptions(attrs);
  return {
    className: ["md-tabs"],
    dataTabsOrientation: options.orientation,
    dataTabsTitle: attrs.title || "Tabbed content",
    dataTabsVariant: options.variant,
    dataTabsSpacing: options.spacing,
    dataTabsInitial: options.initial,
    ...(options.accent ? { dataTabsAccent: options.accent } : {}),
    ...(options.radius !== undefined ? { dataTabsRadius: options.radius } : {}),
  };
}
function videoProperties(attrs: Attributes) {
  return {
    dataVideoWidth: attrs.width || "full",
    dataVideoAlign: attrs.align || "center",
    dataVideoWrap: attrs.wrap || "false",
    dataVideoRatio: attrs.ratio || "auto",
  };
}
function mediaElement(name: string, attrs: Attributes, src: string) {
  const properties =
    name === "image"
      ? { src, alt: attrs.alt || "", loading: "lazy" }
      : {
          className: ["md-video"],
          dataVideoSrc: src,
          dataVideoTitle: attrs.title || attrs.alt || attrs.caption || "Video",
          dataVideoRatio: attrs.ratio || "auto",
          dataVideoSticky: attrs.sticky === "true" ? "true" : "false",
        };
  return {
    type: "element",
    tagName: name === "image" ? "img" : "div",
    properties,
    children: [],
  };
}
function audio(attrs: Attributes) {
  return {
    hName: "figure",
    hProperties: { className: ["md-media", `md-width-${choice(attrs.width, ["full", "wide", "small"], "full")}`, `md-align-${choice(attrs.align, ["left", "center", "right"], "center")}`] },
    hChildren: [
      { type: "element", tagName: "div", properties: { className: ["md-audio"], dataAudioSrc: resolveAudio(attrs.src || "") ? attrs.src : "", dataAudioMode: attrs.mode === "preview" ? "preview" : "player", dataAudioTitle: attrs.title || "Listen to this article" }, children: [] },
      ...(attrs.caption ? [{ type: "element", tagName: "figcaption", properties: {}, children: [{ type: "text", value: attrs.caption }] }] : []),
    ],
  };
}
function media(node: Directive, attrs: Attributes) {
  const src = node.name === "video" ? safeVideoUrl(attrs.src) : safeMediaUrl(attrs.src);
  const children: any[] = src
    ? [mediaElement(node.name, attrs, src)]
    : [{ type: "text", value: "Add a valid HTTP or HTTPS media URL." }];
  if (attrs.caption)
    children.push({
      type: "element",
      tagName: "figcaption",
      properties: {},
      children: [{ type: "text", value: attrs.caption }],
    });
  return {
    hName: "figure",
    hProperties: {
      className: [
        "md-media",
        ...(node.name === "video" ? ["md-video-figure"] : []),
        `md-frame-${choice(attrs.frame, ["auto", "plain", "border", "polaroid"], "auto")}`,
        `md-width-${choice(attrs.width, ["full", "wide", "small"], "full")}`,
        `md-align-${choice(attrs.align, ["left", "center", "right"], "center")}`,
      ],
      ...(node.name === "video" ? videoProperties(attrs) : {}),
    },
    hChildren: children,
  };
}
function container(node: Directive, attrs: Attributes) {
  switch (node.name) {
    case "checklist":
      return { hName: "div", hProperties: { className: ["md-checklist"], dataChecklistTitle: (attrs.title || "Checklist").slice(0, 160), dataChecklistFloating: attrs.floating === "true" ? "true" : "false" } };
    case "tabs":
      return { hName: "div", hProperties: tabs(attrs) };
    case "tab":
      return {
        hName: "div",
        hProperties: { className: ["md-tab"], dataTabTitle: attrs.title || "" },
      };
    case "carousel":
      node.children = node.children
        .filter(
          (child) => child.type === "leafDirective" && child.name === "image",
        )
        .slice(0, 20);
      return {
        hName: "div",
        hProperties: {
          className: ["md-carousel"],
          dataCarouselTitle: attrs.title || "Image gallery",
          dataCarouselFit: choice(attrs.fit, ["contain", "cover"], "contain"),
        },
      };
    default:
      if (["widget", "widgets", "column", "columns"].includes(node.name))
        return {
          hName: "div",
          hProperties: widgetProperties(node.name, attrs),
        };
  }
}
function common(node: Directive, attrs: Attributes) {
  switch (node.name) {
    case "social":
      return socialProperties(attrs);
    case "clear":
      if (node.type === "leafDirective")
        return { hName: "div", hProperties: { className: ["widget-clear"] } };
      return;
    case "callout":
      return {
        hName: "aside",
        hProperties: {
          className: [
            "md-callout",
            `md-callout-${choice(attrs.tone, ["note", "tip", "warning"], "note")}`,
          ],
        },
      };
    case "citation":
      return citationProperties(node, attrs);
    case "mark":
      return { hName: "mark" };
    case "divider":
      return { hName: "hr" };
    case "image":
    case "video":
      return media(node, attrs);
  }
}
function leaf(node: Directive, attrs: Attributes) {
  if (node.name === "linkcard") return { hName: "div", hProperties: { className: ["md-link-card"], dataLinkUrl: attrs.url || "", dataLinkTitle: attrs.title || "", dataLinkDescription: attrs.description || "", dataLinkImage: attrs.image || "", dataLinkMode: choice(attrs.mode, ["link", "preview", "figma"], "preview") }, hChildren: [] };
  return node.name === "audio" ? audio(attrs) : common(node, attrs);
}
export default function styledDirectives() {
  return (tree: Root) =>
    visit(tree, (node) => {
      if (
        !["textDirective", "leafDirective", "containerDirective"].includes(
          node.type,
        )
      )
        return;
      const directive = node as unknown as Directive;
      const attrs = directive.attributes || {};
      const data = directive.data || (directive.data = {});
      const rendered =
        directive.type === "containerDirective"
          ? container(directive, attrs)
          : undefined;
      Object.assign(data, rendered || leaf(directive, attrs));
    });
}

function citationProperties(node: Directive, attrs: Attributes) {
  node.children = citationChildren(node.children);
  if (node.type === "textDirective")
    return {
      hName: "span",
      hProperties: {
        dataCitation: JSON.stringify({
          url: attrs.url || "",
          title: attrs.title || "",
          quote: attrs.quote || "",
          page: attrs.page || "",
          rect: attrs.rect || "",
        }),
      },
    };
  return;
}

function citationChildren(nodes: Directive[]): Directive[] {
  return nodes.flatMap((node) => {
    if (["link", "linkReference"].includes(node.type))
      return citationChildren(node.children);
    if (["image", "imageReference"].includes(node.type)) return [];
    if (node.children) node.children = citationChildren(node.children);
    return [node];
  });
}

function socialProperties(attrs: Attributes) {
  return {
    hName: "div",
    hProperties: {
      className: ["md-social"],
      dataSocialUrl: attrs.url || "",
      dataSocialTitle: attrs.title || "",
    },
    hChildren: [],
  };
}
