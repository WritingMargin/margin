import Select from "../components/Select";
import { Check,Copy,Link2,Loader2,WandSparkles } from "lucide-react";
import {
aiInputLimits,
bloggingPlatforms,
platformCharacterLimits,
platformLabels,
type SocialPlatform,
type SummaryTone,
} from "../../shared/ai";
import { shortArticleCode, swapSummaryArticleURL } from "../blog/share";
import "../ai.css";
import { platformNotes,stamp } from "./helpers";
import type { AIPanelController } from "./useAIStudio";
type Props = {
  state: Pick<
    AIPanelController,
    | "post"
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
      {result && <SummaryResults state={state} />}
    </>
  );
}

function SummaryResults({ state }: Props) {
  const { post, result, texts, setTexts, copied, setCopied, copy } = state;
  if (!result) return null;
  const code = shortArticleCode(post.id);
  function toggleShortLink(platform: SocialPlatform) {
    const current = texts[platform] || "";
    const usingShort = Boolean(code && new RegExp(`/s/${code}\\b`, "i").test(current));
    setTexts({
      ...texts,
      [platform]: swapSummaryArticleURL(current, post.id, post.slug, !usingShort),
    });
    setCopied("");
  }
  return (
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
        <SummaryCard
          key={s.platform}
          platform={s.platform}
          text={texts[s.platform] || ""}
          code={code}
          copied={copied === s.platform}
          onChange={(value) => {
            setTexts({ ...texts, [s.platform]: value });
            setCopied("");
          }}
          onToggleShortLink={() => toggleShortLink(s.platform)}
          onCopy={() => copy(texts[s.platform] || "", s.platform)}
        />
      ))}
      <button
        className="button"
        onClick={() =>
          copy(
            result.summaries
              .map((s) => `${platformLabels[s.platform]}\n\n${texts[s.platform]}`)
              .join("\n\n---\n\n"),
            "all",
          )
        }
      >
        <Copy size={14} />
        {copied === "all" ? "All copied" : "Copy all summaries"}
      </button>
    </section>
  );
}

function SummaryCard({
  platform,
  text,
  code,
  copied,
  onChange,
  onToggleShortLink,
  onCopy,
}: {
  platform: SocialPlatform;
  text: string;
  code: string;
  copied: boolean;
  onChange: (value: string) => void;
  onToggleShortLink: () => void;
  onCopy: () => void;
}) {
  const count = Array.from(text).length;
  const limit = platformCharacterLimits[platform];
  const usingShort = Boolean(code && new RegExp(`/s/${code}\\b`, "i").test(text));
  const hasArticleURL = Boolean(code && /https?:\/\/[^\s)]+\/(?:post|s)\/[^\s)]+/i.test(text));
  return (
    <div className="ai-summary">
      <header>
        <strong>{platformLabels[platform]}</strong>
        <span className={count > limit ? "ai-over-limit" : ""}>
          {count} / {limit} characters
          {bloggingPlatforms.includes(platform) ? " suggested" : ""}
        </span>
      </header>
      <textarea
        aria-label={`${platformLabels[platform]} summary`}
        value={text}
        rows={platform === "x" ? 3 : 5}
        onChange={(e) => onChange(e.target.value)}
      />
      <footer>
        <span>{platformNotes[platform]}</span>
        <div className="ai-summary-actions">
          {hasArticleURL && (
            <button
              type="button"
              className="button"
              aria-pressed={usingShort}
              onClick={onToggleShortLink}
            >
              <Link2 size={13} />
              {usingShort ? "Use full link" : "Use short link"}
            </button>
          )}
          <button type="button" className="button" onClick={onCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
            {copied ? "Copied" : "Copy text"}
          </button>
        </div>
      </footer>
    </div>
  );
}
