import AccountGate from "../auth/AccountGate";
import { type AIConfig } from "../../shared/ai";
import "../ai.css";
import { api } from "../api";
import AICredits from "./AICredits";
import AIDisclosure from "./AIDisclosure";
import AIHistoryPanel from "./AIHistoryPanel";
import AIInputStatus from "./AIInputStatus";
import AISaveDraft from "./AISaveDraft";
import AIStudioHeader from "./AIStudioHeader";
import ImageComposer from "./ImageComposer";
import SocialComposer from "./SocialComposer";
import { useAIStudio } from "./useAIStudio";
function ConnectedAIPanel(props: Parameters<typeof useAIStudio>[0]) {
  const state = useAIStudio(props);
  const { post, published, tab, scrollArea, config, setConfig, setError } =
    state;
  return (
    <div className="ai-studio">
      <AIStudioHeader state={state} />
      <div
        className="ai-scroll"
        ref={scrollArea}
        tabIndex={0}
        role="region"
        aria-label="AI studio options and results"
      >
        {config && (
          <AICredits
            config={config}
            onRefresh={() =>
              api<AIConfig>("/ai/config")
                .then(setConfig)
                .catch((e) => setError(e.message))
            }
          />
        )}
        {!post.id && <AISaveDraft state={state} />}
        <AIInputStatus state={state} />
        {published && tab === "social" && <SocialComposer state={state} />}
        {tab === "images" && <ImageComposer state={state} />}
        {tab === "history" && <AIHistoryPanel state={state} />}
      </div>
      <AIDisclosure />
    </div>
  );
}

export default function AIPanel(props: Parameters<typeof useAIStudio>[0]) {
  return <AccountGate feature="AI tools"><ConnectedAIPanel {...props} /></AccountGate>;
}
