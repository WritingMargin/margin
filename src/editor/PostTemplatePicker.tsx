import { writingTemplatesFor } from "../../shared/template-catalog";
import { contentTypeLabel, type ContentType } from "../../shared/content-types";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Check, Code2, FileText, ListChecks, Megaphone, Microscope, PenLine, X } from "lucide-react";
import { canUsePostTemplate, type PostTemplate } from "../../shared/post-templates";
import { useTemplateCatalog } from "../designer/useTemplateCatalog";
import type { Post } from "../../shared/types";
import "./post-templates.css";

const templateIcons = new Map<string, typeof FileText>([["essay", PenLine], ["research", Microscope], ["engineering", Code2], ["tutorial", ListChecks], ["release", Megaphone]]);

export default function PostTemplatePicker({ post, onChange, busy }: { post: Post; onChange: (patch: Partial<Post>) => void; busy: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  if (!canUsePostTemplate(post)) return null;
  return <>
    <button type="button" className="post-template-trigger" disabled={busy} aria-label="Browse writing templates" title="Browse writing templates" aria-haspopup="dialog" onClick={() => setOpen(true)}><FileText size={16} aria-hidden="true" /><span className="editor-control-label">Templates</span></button>
    <dialog className="writing-template-dialog" ref={dialog} aria-labelledby={titleId} onClose={() => setOpen(false)}>
      {open && <PostTemplateGallery contentType={post.contentType} titleId={titleId} busy={busy} onClose={() => dialog.current?.close()} onSelect={template => {
        if (busy || !canUsePostTemplate(post)) return;
        dialog.current?.close();
        onChange({ content: template.content });
      }} />}
    </dialog>
  </>;
}

export function PostTemplateGallery({ onSelect, onClose, busy = false, titleId, contentType = "article" }: { onSelect: (template: PostTemplate) => void; onClose?: () => void; busy?: boolean; titleId?: string; contentType?: ContentType }) {
  const postTemplates = writingTemplatesFor(useTemplateCatalog(), contentType);
  const [choice, setSelected] = useState<PostTemplate | null>(null);
  const selected = postTemplates.find(template => template.id === choice?.id) ?? postTemplates[0];
  if (!selected) return <section className="writing-template-gallery"><p>No outlines are available for this content type.</p>{onClose && <button type="button" onClick={onClose}>Close templates</button>}</section>;
  const sections = selected.content.split(/^## /m).filter(Boolean);
  return <section className="writing-template-gallery" aria-label="Writing templates">
    <header className="writing-template-heading">
      <div><span className="writing-template-eyebrow">A PLACE TO BEGIN</span><h2 id={titleId}>Good ideas start somewhere.</h2><p>Outlines for your next {contentTypeLabel(contentType).toLowerCase()}.</p></div>
      {onClose && <button type="button" className="writing-template-close" aria-label="Close templates" onClick={onClose}><X size={20} aria-hidden="true" /></button>}
    </header>
    <div className="writing-template-body">
      <div className="writing-template-options" role="group" aria-label="Choose an outline">
        {postTemplates.map(template => {
          const Icon = templateIcons.get(template.id) ?? FileText;
          return <button type="button" key={template.id} className="writing-template-option" aria-pressed={selected.id === template.id} onClick={() => setSelected(template)}>
            <span className={`writing-template-icon ${template.id}`}><Icon size={21} strokeWidth={1.5} aria-hidden="true" /></span>
            <span><strong>{template.name}</strong><small>{template.description}</small></span>
            <span className="writing-template-check" aria-hidden="true">{selected.id === template.id && <Check size={14} />}</span>
          </button>;
        })}
        <p className="writing-template-hint">Just a starting point. Every word is yours to change.</p>
      </div>
      <div className="writing-template-preview" role="region" aria-label={`${selected.name} outline preview`}>
        <div className="writing-template-preview-label"><span>OUTLINE PREVIEW</span><span>{sections.length} sections</span></div>
        <article className="writing-template-paper">
          <div className="writing-template-paper-meta">YOUR NEXT STORY <span>·</span> {selected.name}</div>
          <h3>{previewTitles.get(selected.id) ?? selected.name}</h3>
          <div className="writing-template-paper-rule" />
          {sections.map((section, index) => {
            const [heading, ...body] = section.trim().split("\n");
            return <section key={heading} className="writing-template-outline-section"><span>{String(index + 1).padStart(2, "0")}</span><div><h4>{heading}</h4><p>{body.join("\n").trim().replace(/^- /gm, "")}</p></div></section>;
          })}
        </article>
      </div>
    </div>
    <footer className="writing-template-footer">
      <p><PenLine size={15} aria-hidden="true" /> Opens in your draft. Edit the prompts, then save.</p>
      <button type="button" className="writing-template-use" disabled={busy} onClick={() => onSelect(selected)}>Use this outline <ArrowRight size={17} aria-hidden="true" /></button>
    </footer>
  </section>;
}

const previewTitles = new Map<string, string>([["essay", "An idea worth sharing."], ["research", "A question worth exploring."], ["engineering", "How it came together."], ["tutorial", "Something you can make."], ["release", "A new chapter."]]);
