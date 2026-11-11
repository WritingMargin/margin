import type { Theme } from "../../shared/types";
import { fontIds, typography } from "../../shared/typography";
import { X } from "lucide-react";
import Select from "../components/Select";
import { FooterTitleControls } from "./LabelControls";
import { PublicationColorInput } from "./PublicationAppearance";
import { Toggle } from "./controls";
import CustomizeTabs from "./CustomizeTabs";
import "./footer-controls.css";

export default function FooterControls({ theme, onChange }: { theme: Theme; onChange: (patch: Partial<Theme>) => void }) {
  const links = theme.footerLinks || [];
  return <>
    <div className="design-control-heading"><span className="eyebrow">THE LAST WORD</span><h3>Your footer</h3><p>A closing note and useful places for readers to go.</p></div>
    <CustomizeTabs layout={<>
      <label>Footer layout<Select value={theme.footerLayout || "split"} onChange={event => onChange({ footerLayout: event.target.value as Theme["footerLayout"] })}>
        <option value="split">Title and links side by side</option><option value="stacked">Stacked</option><option value="centered">Centered</option>
      </Select></label>
      <p className="small-text">The footer appears on the homepage, articles, and other public pages.</p>
    </>} content={<>
      <FooterTitleControls theme={theme} onChange={onChange} />
      <Toggle label="Show footer logo" description="Use the publication logo, or the Margin mark when no logo is set." value={theme.showFooterLogo ?? false} onChange={showFooterLogo => onChange({ showFooterLogo })} />
      <label>Footer description<textarea rows={3} maxLength={500} value={theme.footerDescription || ""} onChange={event => onChange({ footerDescription: event.target.value })} placeholder="A short note about your publication" /></label>
      <div className="footer-link-controls">
        <div className="footer-link-heading"><h4>Links</h4><button type="button" className="button" disabled={links.length >= 8} onClick={() => onChange({ footerLinks: [...links, { label: "", url: "" }] })}>Add link</button></div>
        <p className="small-text">Add up to eight links. Use a full web address or a path such as /post/your-slug. Privacy and RSS stay available.</p>
        {links.length > 0 && <div className="footer-link-columns" aria-hidden="true"><span>Name</span><span>URL</span></div>}
        {links.map((link, index) => <div className="footer-link-row" key={index}>
          <input aria-label={`Link ${index + 1} name`} maxLength={60} value={link.label} onChange={event => onChange({ footerLinks: links.map((item, position) => position === index ? { ...item, label: event.target.value } : item) })} placeholder="About" />
          <input aria-label={`Link ${index + 1} URL`} maxLength={2048} value={link.url} onChange={event => onChange({ footerLinks: links.map((item, position) => position === index ? { ...item, url: event.target.value } : item) })} placeholder="/post/your-slug or https://example.com" />
          <button type="button" className="footer-link-remove" aria-label={`Remove link ${index + 1}`} title={`Remove link ${index + 1}`} onClick={() => onChange({ footerLinks: links.filter((_, position) => position !== index) })}><X size={16} /></button>
        </div>)}
      </div>
    </>} style={<>
      <Toggle label="Custom background" value={!!theme.footerBackground} onChange={enabled => onChange({ footerBackground: enabled ? theme.background : "" })} />
      {theme.footerBackground && <PublicationColorInput label="Footer background" value={theme.footerBackground} onChange={footerBackground => onChange({ footerBackground })} />}
      <Toggle label="Custom text color" value={!!theme.footerText} onChange={enabled => onChange({ footerText: enabled ? theme.text : "" })} />
      {theme.footerText && <PublicationColorInput label="Footer text" value={theme.footerText} onChange={footerText => onChange({ footerText })} />}
      <label>Typeface<Select value={theme.footerFont || "inherit"} onChange={event => onChange({ footerFont: event.target.value as Theme["footerFont"] })}>
        <option value="inherit">Match the page</option>{fontIds.map(font => <option key={font} value={font}>{typography[font].name}</option>)}
      </Select></label>
    </>} />
  </>;
}
