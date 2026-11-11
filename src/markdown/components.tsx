import LinkCard from "../LinkCard";
import AudioMedia from "../AudioMedia";
import ContentsLayout from "./ContentsLayout";
import Checklist, { ChecklistInput } from "../blocks/Checklist";
import CodeBlock from "../code/CodeBlock";
import { codeNoWrap } from "../code/code-wrap";
import SocialPostCard from "../social/SocialPostCard";
import Citation from "../citations/Citation";
import type { ComponentProps, CSSProperties } from "react";
import type { Components, ExtraProps } from "react-markdown";
import { resolveFont } from "../../shared/font-markup";
import { tabOptions } from "../../shared/tabs";
import { typography } from "../../shared/typography";
import { videoLayout } from "../../shared/video-layout";
import ContentTabs from "../blocks/ContentTabs";
import ImageCarousel from "../blocks/ImageCarousel";
import RichBlock from "../blocks/RichBlock";
import { blockLanguages, type BlockLanguage } from "../blocks/schema";
import "../markdown.css";
import { safeMediaUrl } from "../media";
import VideoMedia from "../VideoMedia";
export const markdownComponents: Components = {
  input: ChecklistInput,
  figure: ({ node, className, children }) => {
    if (!className?.split(" ").includes("md-video-figure"))
      return <figure className={className}>{children}</figure>;
    const p = node?.properties || {};
    const layout = videoLayout({
      width: p.dataVideoWidth,
      align: p.dataVideoAlign,
      wrap: p.dataVideoWrap,
      ratio: p.dataVideoRatio,
    });
    return (
      <figure
        className={`${className} ${layout.wrap ? `md-video-wrap-${layout.align}` : ""}`}
        style={{ "--video-width": layout.width } as CSSProperties}
      >
        {children}
      </figure>
    );
  },
  // TOC markup and style are generated after sanitization from validated design JSON.
  div: (props) => props.className?.split(" ").includes("article-toc-layout")
    ? <ContentsLayout className={props.className} style={props.style}>{props.children}</ContentsLayout>
    : <MarkdownDiv {...props} />,
  span: ({ node, children }) => {
    if (typeof node?.properties.dataCitation === "string")
      return (
        <Citation source={JSON.parse(node.properties.dataCitation)}>
          {children}
        </Citation>
      );
    const font = resolveFont(String(node?.properties.dataFont || ""));
    return (
      <span
        style={
          font
            ? ({
                fontFamily: typography[font].family,
                "--article-font": typography[font].family,
              } as CSSProperties)
            : undefined
        }
      >
        {children}
      </span>
    );
  },
  pre: ({ node, children }) => {
    const code = node?.children[0];
    if (code?.type === "element" && code.tagName === "code") {
      const classes = code.properties.className;
      const language = Array.isArray(classes)
        ? String(
            classes.find((c) => String(c).startsWith("language-")) || "",
          ).slice(9)
        : "";
      const source = code.children.map(child => child.type === "text" ? child.value : "").join("").replace(/\n$/, "");
      if (blockLanguages.includes(language as BlockLanguage)) {
        return (
          <RichBlock language={language as BlockLanguage} source={source} />
        );
      }
      return <CodeBlock source={source} language={language} nowrap={codeNoWrap(String(code.data?.meta || ""))} />;
    }
    return <pre>{children}</pre>;
  },
  img: ({ src, alt, title }) => {
    const safe = safeMediaUrl(src);
    return safe ? (
      <img src={safe} alt={alt || ""} title={title} loading="lazy" />
    ) : (
      <span className="md-invalid-media">Invalid image URL</span>
    );
  },
  a: ({ href, children, id, className, "aria-label": label }) => (
    <a href={href} id={id} className={className} aria-label={label} rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="md-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

type DivProps = ComponentProps<"div"> & ExtraProps;
function MarkdownDiv(props: DivProps) {
  const classes = (props.className || "").split(" ");
  if (classes.includes("md-social")) return <SocialBlock {...props} />;
  if (classes.includes("md-link-card")) return <LinkBlock {...props} />;
  if (classes.includes("md-audio")) return <AudioBlock {...props} />;
  if (classes.includes("md-video")) return <VideoBlock {...props} />;
  if (classes.includes("md-checklist")) return <ChecklistBlock {...props} />;
  if (classes.includes("md-tabs")) return <TabBlock {...props} />;
  if (classes.includes("md-carousel")) return <CarouselBlock {...props} />;
  return <StyledDiv {...props} />;
}
function LinkBlock({ node }: DivProps) {
  const p = node?.properties || {};
  return <LinkCard url={String(p.dataLinkUrl || "")} title={String(p.dataLinkTitle || "")} description={String(p.dataLinkDescription || "")} image={String(p.dataLinkImage || "")} mode={String(p.dataLinkMode || "preview")} />;
}
function AudioBlock({ node }: DivProps) {
  return <AudioMedia mode={String(node?.properties.dataAudioMode || "player")} src={String(node?.properties.dataAudioSrc || "")} title={String(node?.properties.dataAudioTitle || "Listen to this article")} />;
}
function SocialBlock({ node }: DivProps) {
  return <SocialPostCard url={String(node?.properties.dataSocialUrl || "")} title={String(node?.properties.dataSocialTitle || "")} />;
}
function ChecklistBlock({ node, children }: DivProps) {
  const p = node?.properties || {};
  const source = String(p.dataChecklistItems || "[]");
  return <Checklist key={source} title={String(p.dataChecklistTitle || "Checklist")} floating={p.dataChecklistFloating === "true"} source={source}>{children}</Checklist>;
}
function VideoBlock({ node }: DivProps) {
  const p = node?.properties || {};
  return (
    <VideoMedia
      src={String(p.dataVideoSrc || "")}
      title={String(p.dataVideoTitle || "Video")}
      ratio={String(p.dataVideoRatio || "auto")}
      sticky={p.dataVideoSticky === "true"}
    />
  );
}
function TabBlock({ node, children }: DivProps) {
  const p = node?.properties || {};
  const options = tabOptions({
    orientation: p.dataTabsOrientation,
    variant: p.dataTabsVariant,
    spacing: p.dataTabsSpacing,
    initial: p.dataTabsInitial,
    accent: p.dataTabsAccent,
    radius: p.dataTabsRadius,
  });
  return (
    <ContentTabs
      {...options}
      title={String(p.dataTabsTitle || "Tabbed content")}
    >
      {children}
    </ContentTabs>
  );
}
function CarouselBlock({ node, children }: DivProps) {
  const p = node?.properties || {};
  return (
    <ImageCarousel
      title={String(p.dataCarouselTitle || "Image gallery")}
      fit={p.dataCarouselFit === "cover" ? "cover" : "contain"}
    >
      {children}
    </ImageCarousel>
  );
}
function fontStyle(value: unknown) {
  const font = resolveFont(String(value || ""));
  return font
    ? {
        fontFamily: typography[font].family,
        "--article-font": typography[font].family,
      }
    : {};
}
function StyledDiv({ node, className, children }: DivProps) {
  const height = Number(node?.properties.dataWidgetHeight);
  const style =
    className?.split(" ").includes("widget-frame") &&
    Number.isInteger(height) &&
    height >= 200 &&
    height <= 800
      ? { "--widget-height": `${height}px` }
      : {};
  return (
    <div
      className={className}
      style={
        { ...style, ...fontStyle(node?.properties.dataFont) } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
