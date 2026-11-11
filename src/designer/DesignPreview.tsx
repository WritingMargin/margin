import { contentTypeLabel } from "../../shared/content-types";
import { publicationCopy } from "../../shared/publication";
import { useState } from "react";
import { Expand,Monitor,Smartphone } from "lucide-react";
import "../blog-design.css";
import { FullDesignPreview } from "./TemplatePreview";
import PublicationPreview, { PreviewPostChoice } from "./PublicationPreview";
import type { DesignerController } from "./useDesigner";
type Props = {
  state: Pick<
    DesignerController,
    | "previewContent"
    | "config"
    | "theme"
    | "section"
    | "local"
    | "device"
    | "setDevice"
    | "article"
    | "comments"
  >;
};
export default function DesignPreview({ state }: Props) {
  const { section, local, device, setDevice, previewContent } = state;
  const [expanded, setExpanded] = useState<typeof section | null>(null);
  const words = publicationCopy(local.publicationType);
  const showComments = commentsPreviewEnabled(local);
  return (
    <div className="design-preview-shell" id="design-preview-panel">
      <a className="designer-mobile-jump" href="#design-controls-panel">↑ Back to settings</a>
      <div className="design-preview-top">
        <span>
          <span className="live-dot" />
          LIVE PREVIEW{" "}
          <span className="preview-sample-label">· PUBLISHED CONTENT</span>
        </span>
        <div>
          <button className="open-design-preview" aria-label="Open preview" title={state.config.pending ? "Apply your JSON changes before previewing" : "Preview your unsaved design"} disabled={state.config.pending} onClick={() => setExpanded(section)}><Expand size={16} /><span>Open preview</span></button>
          <button
            title="Desktop preview"
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
            className={device === "desktop" ? "active" : ""}
          >
            <Monitor size={17} />
          </button>
          <button
            title="Mobile preview"
            aria-pressed={device === "mobile"}
            onClick={() => setDevice("mobile")}
            className={device === "mobile" ? "active" : ""}
          >
            <Smartphone size={17} />
          </button>
        </div>
      </div>
      {section !== "homepage" && section !== "footer" && <PreviewPostChoice content={previewContent} />}
      {expanded && <FullDesignPreview theme={local} section={expanded} content={previewContent} initialDevice={device} onClose={() => setExpanded(null)} />}
      <div className={`design-preview-viewport ${device}`}>
        <PublicationPreview theme={local} section={section} content={previewContent} onNavigate={setExpanded} />
      </div>
      <div className="design-preview-caption">{designPreviewCaption(section, local, words.plural, showComments, state.config.pending)}</div>
    </div>
  );
}

function designPreviewCaption(section: Props["state"]["section"], theme: Props["state"]["local"], plural: string, showComments: boolean, pending: boolean) {
  if (pending) return "Showing the last applied design. Apply your JSON changes to preview them.";
  if (section === "homepage") return `Published ${plural} appear ${theme.homepage.pageSize} per page. Try searching or filtering by topic in this preview.`;
  if (section === "footer") return "The footer appears on every public page. Its Privacy and RSS links stay available.";
  if (section === "comments") return showComments ? "Email addresses stay private. New comments require CAPTCHA and approval." : "Comments are removed from all published pages.";
  return `This design applies to every ${contentTypeLabel(section, theme.publicationType).toLowerCase()}.`;
}

function commentsPreviewEnabled(theme: Props["state"]["local"]) {
  return theme.comments.visible && theme.comments.enabled;
}
