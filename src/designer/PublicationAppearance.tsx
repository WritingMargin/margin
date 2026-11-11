import { contentTypeLabel } from "../../shared/content-types";
import Select from "../components/Select";
import { useEffect, useState } from "react";
import type { Theme } from "../../shared/types";
import { sectionColors, type DesignSurface, type Palette } from "../../shared/design-presets";

type Props = { theme: Theme; onChange: (patch: Partial<Theme>) => void };

export function PublicationColors({ theme, section, onChange }: { theme: Theme; section: DesignSurface; onChange: (patch: Partial<Palette>) => void }) {
  const colors = sectionColors(theme, section);
  return <section className="publication-colors">
    <h3>{section === "homepage" ? "Homepage colors" : `${contentTypeLabel(section, theme.publicationType)} colors`}</h3>
    <p className="small-text">{section === "homepage" ? "Used on your homepage." : `Used on every ${contentTypeLabel(section, theme.publicationType).toLowerCase()} and in the writer preview.`}</p>
    {([
      ["background", "Background", "#ffffff"],
      ["text", "Text", "#242424"],
      ["accent", "Links & accent", "#202020"],
    ] as const).map(([key, label, fallback]) => <label key={key}>
      {label}
      <PublicationColorInput label={label} value={colors[key] || fallback}
        onChange={value => onChange({ [key]: value })} />
    </label>)}
  </section>;
}

export function PublicationMedia({ theme, onChange }: Props) {
  return <section className="publication-media">
    <h3>Automatic media borders</h3>
    <p className="small-text">Applies to covers and content without an explicit frame. A frame set in an image or video tag takes priority.</p>
    {([ ["imageBorder", "Images"], ["videoBorder", "Videos"] ] as const).map(([key, label]) => <label key={key}>
      {label}
      <Select aria-label={`${label} default border`} value={theme[key] || "subtle"}
        onChange={event => onChange({ [key]: event.target.value as Theme[typeof key] })}>
        <option value="none">No border</option>
        <option value="subtle">Subtle border</option>
        <option value="bold">Bold border</option>
      </Select>
    </label>)}
    <p className="small-text">Corners follow the article’s corner radius. Remove frame="…" from a content tag to use these defaults.</p>
  </section>;
}

export function PublicationColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <div className="color-field publication-color-field">
    <input type="color" aria-label={`${label} color`} value={value}
      onInput={event => onChange(event.currentTarget.value)} />
    <input type="text" aria-label={`${label} hex color`} value={draft} maxLength={7}
      spellCheck={false} placeholder="#ffffff"
      onChange={event => {
        const next = event.target.value;
        setDraft(next);
        if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next);
      }}
      onBlur={() => setDraft(value)} />
  </div>;
}
