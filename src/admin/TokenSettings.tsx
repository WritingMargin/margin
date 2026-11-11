import { useState } from "react";
import InnerTabs from "../components/InnerTabs";
import MCPSetup from "./MCPSetup";
import Select from "../components/Select";
import { Copy, Plus, Terminal, Trash2 } from "lucide-react";
import { sitePath } from "../base-path";
import CLISetup from "./CLISetup";
import SettingsDisclosure from "../settings/SettingsDisclosure";
import { date } from "../admin/post-utils";
import type { SettingsPanelController } from "./useSettings";
const tokenRoles = [
  {
    id: "reader",
    label: "Reader",
    detail: "Read all posts and media, including drafts and archives.",
  },
  {
    id: "writer",
    label: "Writer",
    detail:
      "Read all posts, create or edit drafts, and upload article images and videos.",
  },
  {
    id: "publisher",
    label: "Publisher",
    detail:
      "Read, create, edit, publish, archive, restore, and delete posts; upload article images and videos.",
  },
  {
    id: "owner",
    label: "Owner",
    detail:
      "Full access, including settings, integrations, and token management.",
  },
];
type Props = {
  state: Pick<
    SettingsPanelController,
    | "revokeToken"
    | "copyToken"
    | "createToken"
    | "tokenRole"
    | "setTokenRole"
    | "changeTokenRole"
    | "notify"
    | "tokens"
    | "token"
    | "setToken"
    | "tokenName"
    | "setTokenName"
    | "busy"
    | "setBusy"
    | "refresh"
  >;
};
const connectionTabs = [
  { id: "mcp", label: "MCP" },
  { id: "cli", label: "CLI" },
  { id: "tokens", label: "API tokens" },
] as const;
type ConnectionTab = (typeof connectionTabs)[number]["id"];
export default function TokenSettings({ state }: Props) {
  const [tab, setTab] = useState<ConnectionTab>("mcp");
  const {
    revokeToken,
    copyToken,
    createToken,
    tokenRole,
    setTokenRole,
    changeTokenRole,
    tokens,
    token,
    tokenName,
    setTokenName,
    busy,
  } = state;
  return (
    <SettingsDisclosure
      className="cli-settings"
      title="MCP, CLI & API tokens"
      description="Connect AI clients, copy your MCP URL, and manage access."
      icon={<Terminal />}
      status={
        token
          ? "New token ready. Expand to copy it before leaving."
          : `${tokens.length} API tokens`
      }
    >
      <InnerTabs
        label="Agent connections"
        numbered={false}
        idPrefix="agent-tab"
        panelId={(value) => `agent-panel-${value}`}
        tabs={connectionTabs.map((item) => ({
          value: item.id,
          label: item.label,
        }))}
        value={tab}
        onChange={setTab}
      />
      <div
        className="agent-connection-panel"
        role="tabpanel"
        id={`agent-panel-${tab}`}
        aria-labelledby={`agent-tab-${tab}`}
        tabIndex={0}
      >
        {tab === "mcp" && <MCPSetup openTokens={() => setTab("tokens")} />}
        {tab === "cli" && <CLISetup />}
        {tab === "tokens" && (
          <>
            <p>
              Choose the access each automation needs. Existing connections keep
              their roles until you change or revoke them below.
            </p>
            <p>
              <a href={sitePath("/swagger/")} target="_blank" rel="noreferrer">
                Explore the API in Swagger UI
              </a>
            </p>
            <div className="token-form">
              <input
                aria-label="Token name"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="Token name"
              />
              <Select
                aria-label="New token role"
                value={tokenRole}
                onChange={(e) => setTokenRole(e.target.value)}
                disabled={busy}
              >
                {tokenRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </Select>
              <button
                className="button primary"
                disabled={busy || !tokenName.trim()}
                onClick={createToken}
              >
                <Plus size={14} />
                Create API token
              </button>
            </div>
            <p>{tokenRoles.find((role) => role.id === tokenRole)?.detail}</p>
            {token && (
              <div className="token-result">
                <strong>Copy this token now. It is only shown once.</strong>
                <code>{token}</code>
                <button className="button" onClick={copyToken}>
                  <Copy size={14} />
                  Copy token
                </button>
              </div>
            )}
            {tokens.map((t) => (
              <div className="token-row" key={t.id}>
                <Terminal size={15} />
                <span>{t.name}</span>
                <Select
                  aria-label={`Role for ${t.name}`}
                  value={t.role}
                  disabled={busy}
                  onChange={(e) => void changeTokenRole(t.id, e.target.value)}
                >
                  {tokenRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </Select>
                <small>{date(t.createdAt)}</small>
                <button
                  title="Revoke token"
                  onClick={() => void revokeToken(t)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </SettingsDisclosure>
  );
}
