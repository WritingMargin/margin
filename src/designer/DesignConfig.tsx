import type { DesignerController } from "./useDesigner";
import DesignJSONEditor from "./DesignJSONEditor";
import "./design-config.css";

export function DesignMode({ state }: { state: DesignerController }) {
  const { config, saving, uploadingLogo, section } = state;
  const mode = (section === "comments" || section === "footer") && config.mode === "templates" ? "controls" : config.mode;
  return (
    <div className="design-mode">
      <span>{config.pending ? "Preview or discard your JSON edits before switching modes." : "Edit your design"}</span>
      <div role="group" aria-label="Configuration mode" className="design-mode-buttons">
        {section !== "comments" && section !== "footer" && <button type="button" aria-pressed={mode === "templates"} disabled={config.pending || saving || uploadingLogo} onClick={() => config.setMode("templates")}>Templates</button>}
        <button type="button" aria-pressed={mode === "controls"} disabled={config.pending} onClick={() => config.setMode("controls")}>Customize</button>
        <button type="button" aria-pressed={config.mode === "json"} disabled={saving || uploadingLogo} onClick={() => config.setMode("json")}>JSON</button>
      </div>
    </div>
  );
}

export default function DesignConfig({ state }: { state: DesignerController }) {
  const { config, saving } = state;
  return (
    <div className="design-config">
      <h3>Design configuration</h3>
      <p id="design-json-help">Expand an object to edit its options. Add optional objects to show them; remove them to hide them. Preview your edits, then choose Save design to publish them.</p>
      <DesignJSONEditor value={config.text} onChange={config.edit} disabled={saving} invalid={!!config.error} />
      <p id="design-json-status" role="status" className={config.error ? "error-box" : "muted"}>
        {config.error || (config.pending ? "Valid JSON. Preview changes to update your design." : "This configuration matches the preview.")}
      </p>
      <div className="design-config-actions">
        <button type="button" className="button" disabled={!config.pending || saving} onClick={config.discard}>Discard JSON edits</button>
        <button type="button" className="button primary" disabled={!config.pending || !!config.error || saving} onClick={config.apply}>Preview changes</button>
      </div>
    </div>
  );
}
