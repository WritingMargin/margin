import Select from "../components/Select";
import { Check,Copy,Loader2,WandSparkles } from "lucide-react";
import {
aiInputLimits,
bloggingPlatforms,
platformCharacterLimits,
platformLabels,
type SocialPlatform,
type SummaryTone,
} from "../../shared/ai";
import "../ai.css";
import { platformNotes,stamp } from "./helpers";
import type { AIPanelController } from "./useAIStudio";
type Props = {
  state: Pick<
    AIPanelController,
    | "history"
    | "selected"
    | "setSelected"
    | "tone"
    | "setTone"
    | "instructions"
    | "setInstructions"
    | "size"
    | "busy"
    | "result"
    | "texts"
    | "setTexts"
    | "copied"
    | "setCopied"
    | "disabled"
    | "summaryUnavailable"
    | "copy"
    | "generate"
  >;
};
export default function SocialComposer({ state }: Props) {
  const {
    selected,
    setSelected,
    tone,
    setTone,
    instructions,
    setInstructions,
    busy,
    result,
    texts,
    setTexts,
    copied,
    setCopied,
    disabled,
    summaryUnavailable,
    copy,
    generate,
  } = state;
  return (
    <>
      <label className="ai-label">Where will your words go?</label>
      <p className="small-text">Generate a summary with your article link, ready to copy and paste.</p>
      <div className="ai-platforms">
        {(Object.keys(platformLabels) as SocialPlatform[]).map((p) => (
          <button
            key={p}
            aria-pressed={selected.includes(p)}
            disabled={!!busy}
            className={selected.includes(p) ? "selected" : ""}
            onClick={() =>
              setSelected((s) =>
                s.includes(p) ? s.filter((v) => v !== p) : [...s, p],
              )
            }
          >
            <span className="ai-check">
              {selected.includes(p) && <Check size={11} />}
            </span>
            <strong>{platformLabels[p]}</strong>
            <small>{platformNotes[p]}</small>
          </button>
        ))}
      </div>
      <div className="ai-form-row">
        <label>
          Voice
          <Select
            value={tone}
            onChange={(e) => setTone(e.target.value as SummaryTone)}
            disabled={!!busy}
          >
            <option value="natural">Like you, on a good writing day</option>
            <option value="professional">Clear & professional</option>
            <option value="playful">Light & playful</option>
          </Select>
        </label>
        <label>
          A little direction <span className="muted">optional</span>
          <input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={aiInputLimits.instructions}
            placeholder="Focus on the practical takeaways…"
            disabled={!!busy}
          />
        </label>
      </div>
      <button
        className="button primary ai-generate"
        disabled={disabled || summaryUnavailable || !selected.length}
        onClick={() => generate("social")}
      >
        {busy === "social" ? (
          <Loader2 size={15} className="spin" />
        ) : (
          <WandSparkles size={15} />
        )}{" "}
        {busy === "social"
          ? "Finding the right words…"
          : `Generate ${selected.length || ""} ${selected.length === 1 ? "summary" : "summaries"}`}
      </button>
      {result && (
        <section className="ai-results">
          <div className="ai-result-heading">
            <h3>Ready for your finishing touch.</h3>
            <span>{stamp(result.createdAt)}</span>
          </div>
          <p className="small-text">
            Edit before copying. The original generated versions are kept in
            history.
          </p>
          {result.summaries.map((s) => (
            <div className="ai-summary" key={s.platform}>
              <header>
                <strong>{platformLabels[s.platform]}</strong>
                <span
                  className={
                    Array.from(texts[s.platform] || "").length >
                    platformCharacterLimits[s.platform]
                      ? "ai-over-limit"
                      : ""
                  }
                >
                  {Array.from(texts[s.platform] || "").length} /{" "}
                  {platformCharacterLimits[s.platform]} characters{bloggingPlatforms.includes(s.platform) ? " suggested" : ""}
                </span>
              </header>
              <textarea
                aria-label={`${platformLabels[s.platform]} summary`}
                value={texts[s.platform] || ""}
                rows={s.platform === "x" ? 3 : 5}
                onChange={(e) => {
                  setTexts({ ...texts, [s.platform]: e.target.value });
                  setCopied("");
                }}
              />
              <footer>
                <span>{platformNotes[s.platform]}</span>
                <button
                  className="button"
                  onClick={() => copy(texts[s.platform] || "", s.platform)}
                >
                  {copied === s.platform ? (
                    <Check size={13} />
                  ) : (
                    <Copy size={13} />
                  )}{" "}
                  {copied === s.platform ? "Copied" : "Copy text"}
                </button>
              </footer>
            </div>
          ))}
          <button
            className="button"
            onClick={() =>
              copy(
                result.summaries
                  .map(
                    (s) =>
                      `${platformLabels[s.platform]}\n\n${texts[s.platform]}`,
                  )
                  .join("\n\n---\n\n"),
                "all",
              )
            }
          >
            <Copy size={14} />
            {copied === "all" ? "All copied" : "Copy all summaries"}
          </button>
        </section>
      )}
    </>
  );
}
