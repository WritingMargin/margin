import { defaultTheme, type Post } from "../../shared/types";
import type { InteractionData } from "../../shared/interactions";
import type { PublicTheme } from "../../shared/frontend";
import { BlogFrame } from "../blog/BlogFrame";
import { ConversationToolsProvider, ConversationToolsSlot } from "../blog/ConversationTools";
import PassageInteractions from "../blog/PassageInteractions";
import "./dev-passage.css";

const quote = "Technical ideas are easier to understand when readers can explore them.";
const post: Post = {
  id: "preview", slug: "preview", title: "Ask more of what you read.", excerpt: "",
  status: "published", tags: [], cover: "", seo: { title: "", description: "", image: "" },
  createdAt: "2026-11-08", updatedAt: "2026-11-08", revision: "preview",
};
const interactions: InteractionData = {
  enabled: true,
  questionMode: "open",
  notesEnabled: true,
  subscriber: true,
  questions: [{ id: "preview-question", name: "Reader", body: "What can I explore here?", quote,
    answer: "Follow the idea that catches your attention.", anchor_status: "active", occurrence: 0, createdAt: "2026-11-08", canReply: true, followups: [] }],
  reactionsEnabled: true,
  reactions: [
    { quote, emoji: "💡", count: 2, anchor_status: "active", occurrence: 0 },
    { quote, emoji: "❤️", count: 1, anchor_status: "active", occurrence: 0 },
  ],
};

export default function PassagePreview() {
  return <BlogFrame theme={defaultTheme} preview section="article">
    <ConversationToolsProvider>
      <main className="public-article passage-preview" onSubmitCapture={(event) => { event.preventDefault(); event.stopPropagation(); }}>
        <div className="passage-preview-label">LOCAL DEVELOPMENT PREVIEW</div>
        <h1>Ask more of what you read.</h1>
        <p className="passage-preview-deck">Click the highlighted sentence or its margin bubble to see the conversation. Drag over the text to select it and open the passage actions.</p>
        <div className="passage-preview-content">
          <PassageInteractions post={post} theme={defaultTheme as PublicTheme} initialData={interactions}>
            <p>Some stories invite a second look. {quote}</p>
            <p>Margin makes room for the question that follows. These actions follow each publication’s reader settings. Readers can save a private note to revisit later.</p>
          </PassageInteractions>
        </div>
        <section className="passage-preview-comments">
          <span>IN THE MARGINS</span>
          <h2>Join the conversation.</h2>
          <ConversationToolsSlot />
        </section>
        <p className="passage-preview-footnote">This page uses sample conversations. It does not save replies, notes, or reactions.</p>
      </main>
    </ConversationToolsProvider>
  </BlogFrame>;
}
