import { History,ImagePlus,Sparkles } from "lucide-react";
import "../ai.css";
import type { AIPanelController } from "./useAIStudio";
type Props = {
  state: Pick<
    AIPanelController,
    "post" | "published" | "tab" | "setTab" | "history" | "size" | "image"
  >;
};
export default function AIStudioHeader({ state }: Props) {
  const { post, published, tab, setTab, history } = state;
  return (
    <header className="ai-studio-header">
      <span className="eyebrow">
        <Sparkles size={13} />A LITTLE CREATIVE COMPANY
      </span>
      <h2>One story. More possibilities.</h2>
      <p className="ai-intro">
        Give your words a new audience. Find the image that brings them to life.
      </p>
      <div className="ai-source">
        <span className="ai-source-icon">↗</span>
        <div>
          <span>
            {published
              ? "WORKING FROM YOUR CURRENT EDITOR TEXT"
              : "WORKING FROM YOUR DRAFT"}
          </span>
          <strong>{post.title || "Untitled"}</strong>
        </div>
        <span>
          {(post.content || "").trim().split(/\s+/).filter(Boolean).length}{" "}
          words
        </span>
      </div>
      <div className="section-tabs">
        {published && (
          <button
            aria-pressed={tab === "social"}
            className={tab === "social" ? "active" : ""}
            onClick={() => setTab("social")}
          >
            <Sparkles size={14} />
            Social summaries
          </button>
        )}
        <button
          aria-pressed={tab === "images"}
          className={tab === "images" ? "active" : ""}
          onClick={() => setTab("images")}
        >
          <ImagePlus size={14} />
          Generate images
        </button>
        <button
          aria-pressed={tab === "history"}
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          <History size={14} />
          History
          <span className="ai-count">
            {(published ? history.summaries.length : 0) + history.images.length}
          </span>
        </button>
      </div>
    </header>
  );
}
