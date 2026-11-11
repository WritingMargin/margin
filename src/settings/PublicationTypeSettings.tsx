import { BookOpen } from "lucide-react";
import PublicationTypeField from "./PublicationTypeField";
import type { PublicationSettingsController } from "./usePublicationSettings";

export default function PublicationTypeSettings({ state }: { state: PublicationSettingsController }) {
  return (
    <form className="settings-card publication-type-settings" onSubmit={event => { event.preventDefault(); void state.savePublication(); }}>
      <div className="settings-icon"><BookOpen /></div>
      <h2>What are you publishing?</h2>
      <p>Give your work the right labels across your homepage, search, and reading links.</p>
      <fieldset disabled={state.busy}>
        <PublicationTypeField value={state.publicationType} onChange={state.setPublicationType} />
        <div className="settings-actions">
          <button className="button primary" disabled={!state.publicationDirty}>{state.busy ? "Saving…" : "Save publication type"}</button>
          {state.publicationDirty && <span className="muted">Unsaved changes</span>}
        </div>
      </fieldset>
    </form>
  );
}
