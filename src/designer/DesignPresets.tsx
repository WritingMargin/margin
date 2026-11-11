import { contentTemplatesFor } from "../../shared/template-catalog";
import { contentDesign } from "../../shared/content-types";
import { useState } from "react";
import { applySectionPreset, matchesPreset, sectionColors, type DesignSurface, type PageTemplate } from "../../shared/design-presets";
import { useTemplateCatalog } from "./useTemplateCatalog";
import type { Theme } from "../../shared/types";
import TemplatePreview, { TemplatePage } from "./TemplatePreview";
import type { DesignerController } from "./useDesigner";
import "./design-presets.css";

const sections = {
  homepage: { label: "Homepage", description: "Choose how readers discover your publication." },
  article: { label: "Article", description: "Choose how readers experience your writing." },
  guide: { label: "Guide", description: "Choose a design for user guides and playbooks." },
};

export default function DesignPresets({ state, section }: { state: DesignerController; section: DesignSurface }) {
  const { local, setLocal } = state;
  const [preview, setPreview] = useState<PageTemplate | null>(null);
  const [last, setLast] = useState<{ before: Theme; after: Theme; name: string } | null>(null);
  const { label, description } = sections[section];
  const catalog = useTemplateCatalog();
  const templates = section === "homepage" ? catalog.homepage : contentTemplatesFor(catalog, section);
  const current = { ...(section === "homepage" ? local.homepage : contentDesign(local, section)), ...sectionColors(local, section) };
  const active = templates.find(template => matchesPreset(current, { ...(section === "homepage" ? { sections: undefined } : {}), ...template.design }));
  const disabled = state.saving || state.uploadingLogo || state.config.pending;
  const apply = (template: PageTemplate) => {
    const after = applySectionPreset(local, section, template.design);
    setLast({ before: local, after, name: template.name });
    setLocal(after);
  };
  return <section className="template-gallery" id="design-controls-panel" role="tabpanel" aria-labelledby={`design-tab-${section}`}>
    <div className="template-gallery-heading">
      <div><h2>{label} templates</h2><p>{description} Each template includes layout, colors, and typography. Explore it with your published posts.</p></div>
      <button type="button" className="button" onClick={() => state.config.setMode("controls")}>Preview & customize</button>
    </div>
    <div className="template-gallery-status" role="status">
      <span>Current template: <strong>{active?.name ?? "Custom"}</strong></span>
      {last?.after === local && <><span>{last.name} selected. Save design to publish.</span><button type="button" className="text-link" disabled={disabled} onClick={() => { setLocal(last.before); setLast(null); }}>Undo template</button></>}
    </div>
    <div className="page-template-grid">
      {templates.map(template => <TemplateCard key={template.id} template={template} theme={local} section={section} compatibility={section === "homepage" ? "Homepage" : Object.keys(catalog.content?.find(item => item.id === template.id)?.designs ?? { article: true }).join(" · ")} selected={active?.id === template.id} disabled={disabled} onSelect={() => apply(template)} onPreview={() => setPreview(template)} />)}
    </div>
    {preview && <TemplatePreview template={preview} content={state.previewContent} theme={local} section={section} onClose={() => setPreview(null)} onUse={() => { apply(preview); state.config.setMode("controls"); }} />}
    <p className="template-gallery-note">{label} templates update only this section. Your publication name, text, and saved posts stay yours. Customize any template before saving.</p>
  </section>;
}

function TemplateCard({ template, theme, section, compatibility, selected, disabled, onSelect, onPreview }: { template: PageTemplate; theme: Theme; section: DesignSurface; compatibility: string; selected: boolean; disabled: boolean; onSelect: () => void; onPreview: () => void }) {
  const preview = applySectionPreset(theme, section, template.design);
  return <article className={`page-template-card ${selected ? "selected" : ""}`}>
    <div className="page-template-preview" aria-hidden="true" inert style={{ background: template.design.background }}>
      <div className="page-template-site">
        <TemplatePage theme={preview} section={section} />
      </div>
    </div>
    <div className="page-template-info">
      <div><h3>{template.name}</h3><p>{template.description}</p><small className="template-compatibility">Supports {compatibility}</small></div>
      <div className="page-template-actions"><button type="button" className="button" aria-label={`Preview ${template.name} template`} onClick={onPreview}>Explore layout</button>
      <button type="button" className="button" aria-label={`Use ${template.name} template`} aria-pressed={selected} disabled={disabled} onClick={onSelect}>{selected ? "Selected" : "Use template"}</button></div>
    </div>
  </article>;
}
