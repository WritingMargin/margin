import { aiInputLimits } from "../../shared/ai";
import "../ai.css";
import type { AIPanelController } from "./useAIStudio";
type Props = {
  state: Pick<
    AIPanelController,
    "config" | "prompt" | "setPrompt" | "busy" | "image" | "disabled"
  >;
};
export default function ImageBrief({ state }: Props) {
  const { config, prompt, setPrompt, busy } = state;
  return (
    <label>
      Your image brief{" "}
      <span className="muted">
        {config?.features?.imageBrief ? "optional" : "required"}
      </span>
      <textarea
        placeholder={
          config?.features?.imageBrief
            ? "Leave this blank and AI will find a visual idea in your article. Or describe what you have in mind…"
            : "Describe the image you want to create…"
        }
        rows={3}
        maxLength={aiInputLimits.prompt}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={!!busy}
      />
    </label>
  );
}
