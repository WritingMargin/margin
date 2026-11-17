import { Sparkles } from "lucide-react";
import InnerTabs, { type InnerTab } from "../components/InnerTabs";
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
  const tabs: InnerTab<typeof tab>[] = [
    ...(published ? [{ value: "social" as const, label: "Social summaries", shortLabel: "Social" }] : []),
    { value: "images", label: "Generate images", shortLabel: "Images" },
    { value: "history", label: "History", count: (published ? history.summaries.length : 0) + history.images.length },
  ];
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
      <InnerTabs
        label="AI studio"
        tabs={tabs}
        value={tab}
        onChange={setTab}
        numbered={false}
      />
    </header>
  );
}
