import { mediaPath } from "../base-path";
import { generatedImageTitle } from "../../shared/image-title";
import { ArrowUpRight,History,Sparkles } from "lucide-react";
import { platformLabels } from "../../shared/ai";
import "../ai.css";
import { stamp } from "./helpers";
import type { AIPanelController } from "./useAIStudio";
type Props = {
  state: Pick<
    AIPanelController,
    | "post"
    | "published"
    | "setTab"
    | "history"
    | "tone"
    | "size"
    | "prompt"
    | "setImage"
    | "historyLoading"
    | "loadSummary"
  >;
};
export default function AIHistoryPanel({ state }: Props) {
  const { published, setTab, history, setImage, historyLoading, loadSummary } =
    state;
  return (
    <div className="ai-history">
      {historyLoading ? (
        <p role="status" className="small-text">
          Loading your creative history…
        </p>
      ) : (!published || !history.summaries.length) &&
        !history.images.length ? (
        <div className="ai-history-empty">
          <History size={26} />
          <h3>A little creative archive.</h3>
          <p>
            Your generated summaries and images will be saved here for this
            post.
          </p>
        </div>
      ) : (
        <>
          {published && (
            <>
              <h3>Social drafts</h3>
              {history.summaries.map((s) => (
                <button
                  className="ai-history-row"
                  key={s.id}
                  onClick={() => loadSummary(s)}
                >
                  <Sparkles size={16} />
                  <span>
                    <strong>
                      {s.summaries
                        .map((v) => platformLabels[v.platform])
                        .join(" · ")}
                    </strong>
                    <small>
                      {stamp(s.createdAt)} · {s.tone}
                    </small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </>
          )}
          <h3>Generated images</h3>
          <div className="ai-history-images">
            {history.images.map((i) => (
              <button
                key={i.id}
                onClick={() => {
                  setImage(i);
                  setTab("images");
                }}
              >
                <img src={mediaPath(i.url)} alt={generatedImageTitle(i)} />
                <span>
                  {generatedImageTitle(i)}
                  <ArrowUpRight size={12} />
                </span>
                <small>{stamp(i.createdAt)}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
