import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { sitePath } from "../base-path";
import "./mcp-setup.css";

export default function MCPSetup({ openTokens }: { openTokens?: () => void }) {
  const address = location.origin + sitePath("/mcp");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }
  return (
    <div className="mcp-setup">
      <h3>Connect your AI client</h3>
      <p>Use this URL to connect an MCP client to this publication.</p>
      <label htmlFor="margin-mcp-url">MCP server URL</label>
      <div className="mcp-address">
        <input
          id="margin-mcp-url"
          type="url"
          readOnly
          value={address}
          onFocus={(event) => event.currentTarget.select()}
          spellCheck={false}
        />
        <button
          type="button"
          className="button"
          onClick={() => void copyAddress()}
          aria-label="Copy MCP URL"
        >
          {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
          {copyState === "copied" ? "Copied" : "Copy URL"}
        </button>
      </div>
      {copyState === "copied" && (
        <p className="mcp-copy-status" role="status">
          MCP URL copied.
        </p>
      )}
      {copyState === "error" && (
        <p className="mcp-copy-status" role="alert">
          Select the URL above and copy it manually.
        </p>
      )}
      <dl className="mcp-connection-details">
        <div>
          <dt>Transport</dt>
          <dd>Streamable HTTP</dd>
        </div>
        <div>
          <dt>Authentication</dt>
          <dd>{openTokens ? "OAuth or API token" : "OAuth"}</dd>
        </div>
      </dl>
      <p>
        For clients that support OAuth, add this URL and follow the sign-in
        prompt. Sign in with your Margin account, select the permissions to grant,
        and approve the connection. You can revoke access in OAuth connections.
      </p>
      <p>
        For peer review, your client must request the OAuth scope <code>review:assigned</code>.
        Choose “Review assigned articles” when approving the connection. The app can
        access only the articles assigned to you at approval. Connect again to include
        newly assigned articles.
      </p>
      {openTokens && <>
      <p>
        To connect with an API token, create one and enter it in your client’s
        bearer token field. If your client uses headers, set:
      </p>
      <code className="mcp-auth-header">
        Authorization: Bearer YOUR_API_TOKEN
      </code>
      <p>
        Use a Writer token for drafts, Publisher for publishing, or Owner for
        blog customisation.
      </p>
      <button type="button" className="button" onClick={openTokens}>
        Manage API tokens
      </button>
      </>}
    </div>
  );
}
