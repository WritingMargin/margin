import "../ai.css";
import type { AIPanelController } from "./useAIStudio";
type Props = {
  state: Pick<
    AIPanelController,
    "post" | "onSave" | "setError" | "busy" | "setBusy" | "disabled"
  >;
};
export default function AISaveDraft({ state }: Props) {
  const { onSave, setError, busy, setBusy } = state;
  return (
    <div className="ai-save-first">
      <p>
        Save this post once to keep its AI drafts and images together.
        Generation uses your current editor text, including later unsaved edits.
      </p>
      <button
        className="button"
        disabled={!!busy}
        onClick={async () => {
          setBusy("save");
          try {
            await onSave();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(null);
          }
        }}
      >
        {busy === "save" ? "Saving…" : "Save draft first"}
      </button>
    </div>
  );
}
