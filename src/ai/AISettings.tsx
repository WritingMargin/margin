import SettingsDisclosure from "../settings/SettingsDisclosure";
import AccountGate from "../auth/AccountGate";
import { Sparkles } from "lucide-react";
import { useEffect,useState } from "react";
import { type AIConfig } from "../../shared/ai";
import "../ai.css";
import { api } from "../api";
import AICredits from "./AICredits";
function ConnectedAISettings() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<AIConfig>("/ai/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div>
      <p>
        Turn an article into social copy and original images from the AI studio
        in your editor.
      </p>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {config ? (
        <AICredits
          config={config}
          onRefresh={() =>
            api<AIConfig>("/ai/config")
              .then(setConfig)
              .catch((e) => setError(e.message))
          }
        />
      ) : (
        <p>Checking AI connection…</p>
      )}
    </div>
  );
}

export default function AISettings() {
  return <SettingsDisclosure
    title="AI tools"
    description="Writing, research and creative help, alongside your own voice."
    icon={<Sparkles />}
  >
    <AccountGate feature="AI tools" embedded><ConnectedAISettings /></AccountGate>
  </SettingsDisclosure>;
}
