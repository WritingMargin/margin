import { useId } from "react";
import type { Theme, HomepageDesign } from "../../shared/types";
import { publicationCopy } from "../../shared/publication";

type LabelFieldProps = {
  label: string;
  enabled: boolean;
  value: string;
  placeholder: string;
  hint: string;
  onToggle: (enabled: boolean) => void;
  onChange: (value: string) => void;
};

function LabelField({ label, enabled, value, placeholder, hint, onToggle, onChange }: LabelFieldProps) {
  const id = useId();
  return <div className="design-label-field">
    <div className="design-field-heading">
      <label htmlFor={enabled ? id : undefined}>{label}</label>
      <label className="design-toggle">
        <input type="checkbox" role="switch" aria-label={`Show ${label.toLowerCase()}`}
          checked={enabled} onChange={event => onToggle(event.target.checked)} />
        <i aria-hidden="true" />
      </label>
    </div>
    {enabled && <>
      <input id={id} maxLength={150} value={value} placeholder={placeholder} aria-describedby={`${id}-hint`}
        onChange={event => onChange(event.target.value)} />
      <small id={`${id}-hint`} className="small-text">{hint}</small>
    </>}
  </div>;
}

export function TaglineControls({ theme, onChange }: { theme: Theme; onChange: (patch: Partial<HomepageDesign>) => void }) {
  return <LabelField label="Homepage tagline" enabled={theme.homepage.showTagline !== false}
    value={theme.homepage.tagline || ""} placeholder={publicationCopy(theme.publicationType).eyebrow}
    hint="Leave blank for the default tagline."
    onToggle={showTagline => onChange({ showTagline })} onChange={tagline => onChange({ tagline })} />;
}

export function FooterTitleControls({ theme, onChange }: { theme: Theme; onChange: (patch: Partial<Theme>) => void }) {
  return <LabelField label="Footer title" enabled={theme.showFooterTitle !== false}
    value={theme.footerTitle || ""} placeholder={theme.name}
    hint="Shown on all pages. Blank uses your publication name."
    onToggle={showFooterTitle => onChange({ showFooterTitle })} onChange={footerTitle => onChange({ footerTitle })} />;
}
