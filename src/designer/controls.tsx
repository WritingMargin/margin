import Select from "../components/Select";
import { type SectionAppearance } from "../../shared/types";
import "../blog-design.css";
import FontPicker from "../FontPicker";
export function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="design-toggle">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}
export function Appearance({
  font,
  width,
  border,
  radius,
  onChange,
}: {
  font?: SectionAppearance["font"];
  width?: SectionAppearance["width"];
  border: SectionAppearance["border"];
  radius: number;
  onChange: (t: Partial<SectionAppearance>) => void;
}) {
  return (
    <>
      {font && (
        <FontPicker
          value={font}
          onChange={(value) => onChange({ font: value })}
        />
      )}
      {width && (
        <label>
          Content width
          <Select
            value={width}
            onChange={(e) =>
              onChange({ width: e.target.value as SectionAppearance["width"] })
            }
          >
            <option value="narrow">Focused</option>
            <option value="wide">Spacious</option>
          </Select>
        </label>
      )}
      <label>
        Borders
        <Select
          value={border}
          onChange={(e) =>
            onChange({ border: e.target.value as SectionAppearance["border"] })
          }
        >
          <option value="subtle">Subtle & quiet</option>
          <option value="bold">Bold & defined</option>
        </Select>
      </label>
      <label>
        Corner radius<span className="muted">{radius}px</span>
        <input
          type="range"
          min="0"
          max="32"
          value={radius}
          onChange={(e) => onChange({ radius: Number(e.target.value) })}
        />
      </label>
    </>
  );
}

export function ContentWidth({ width, onChange }: { width: SectionAppearance["width"]; onChange: (patch: Partial<SectionAppearance>) => void }) {
  return <label>Content width<Select value={width} onChange={e => onChange({ width: e.target.value as SectionAppearance["width"] })}>
    <option value="narrow">Focused</option><option value="wide">Spacious</option>
  </Select></label>;
}
