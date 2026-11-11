import { themeForContentType } from "../../shared/content-types";
import { useEffect, useRef, useState } from "react";
import { X, Monitor, Smartphone } from "lucide-react";
import { BlogFrame, BlogHomepage, BlogArticle } from "../PublicBlog";
import { applySectionPreset, type DesignSurface, type PageTemplate } from "../../shared/design-presets";
import type { Theme } from "../../shared/types";
import { samplePosts } from "./samples";
import type { DesignSection } from "../admin-route";
import PublicationPreview, { PreviewPostChoice } from "./PublicationPreview";
import type { PublicationPreviewContent } from "./usePublicationPreview";
import "./design-presets.css";

// Keep the same sample content across layouts; a featured row would mask feed differences.
export const templatePosts = samplePosts.map(post => ({ ...post, featured: false }));
const previewArticle = { ...samplePosts[0], status: "draft" as const };
export function TemplatePage({ theme, section }: { theme: Theme; section: DesignSurface }) {
  return <BlogFrame theme={themeForContentType(theme, section === "homepage" ? "article" : section)} section={section === "homepage" ? "homepage" : "article"} preview>
    {section === "homepage" ? <BlogHomepage theme={theme} posts={templatePosts} preview /> : <BlogArticle theme={theme} post={{ ...previewArticle, contentType: section }} />}
  </BlogFrame>;
}

export default function TemplatePreview({ template, theme, section, content, onClose, onUse }: { template: PageTemplate; theme: Theme; section: DesignSurface; content: PublicationPreviewContent; onClose: () => void; onUse: () => void }) {
  return <FullDesignPreview theme={applySectionPreset(theme, section, template.design)} section={section} content={content} title={`${template.name} template preview`} onClose={onClose} onUse={onUse} />;
}

export function FullDesignPreview({ theme, section, content, title = "Publication preview", initialDevice = "desktop", onClose, onUse }: { theme: Theme; section: DesignSection; content: PublicationPreviewContent; title?: string; initialDevice?: "desktop" | "mobile"; onClose: () => void; onUse?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(initialDevice === "mobile");
  const [view, setView] = useState(section);
  useEffect(() => { canvas.current?.scrollTo({ top: 0 }); }, [view, content.selectedSlug]);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { trigger?.focus({ preventScroll: true }); };
  }, []);
  return <dialog className="template-preview-dialog" ref={dialog} aria-label={title} onClose={onClose}>
    <header><div><strong>{title}</strong><span>Your published content · unsaved design preview</span></div>
      <div className="template-preview-devices" role="group" aria-label="Preview screen size">
        <button type="button" aria-label="Desktop preview" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={17} /></button>
        <button type="button" aria-label="Mobile preview" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={17} /></button>
      </div>
      {onUse && <button type="button" className="button primary" onClick={onUse}>Use & customize</button>}
      <button type="button" className="template-preview-close" aria-label="Close preview" onClick={onClose}><X size={21} /></button>
    </header>
    <div className="publication-preview-tools">
      <nav aria-label="Preview page">
        {([ ["homepage", "Homepage"], ["article", "Article"], ["guide", "Guide"], ["comments", "Comments"], ["footer", "Footer"] ] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
      </nav>
      {view !== "homepage" && view !== "footer" && <PreviewPostChoice content={content} />}
    </div>
    <div className="template-preview-canvas" ref={canvas}><div className={`template-preview-page ${mobile ? "mobile" : ""}`}>
      <PublicationPreview theme={theme} section={view} content={content} onNavigate={setView} />
    </div></div>
  </dialog>;
}
