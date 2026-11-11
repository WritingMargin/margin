import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { sitePath } from "../base-path";
import "./cli-setup.css";

export default function CLISetup() {
  const address = location.origin + sitePath("");
  const login = `margin login --url '${address.replaceAll("'", "'\\''")}'`;
  return (
    <ol className="cli-setup">
      <li>
        <div className="cli-setup-heading">
          <span aria-hidden="true">1</span>
          <h3>Get the CLI</h3>
        </div>
        <p>
          Download the <code>margin-cli</code> archive for your computer and
          extract it. No Node.js or npm needed.
        </p>
        <a
          className="button cli-download"
          href="https://github.com/WritingMargin/margin/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download size={14} />
          Download CLI
        </a>
        <details>
          <summary>Which download, and where do I put it?</summary>
          <p>
            Choose <code>darwin_arm64</code> for Apple silicon,{" "}
            <code>darwin_amd64</code> for Intel Macs, <code>linux_amd64</code>{" "}
            or <code>linux_arm64</code> for Linux.
          </p>
          <p>Run these commands from the extracted folder:</p>
          <CLICommand
            label="Copy install commands"
            command={
              'mkdir -p "$HOME/.local/bin"\ninstall -m 755 ./margin "$HOME/.local/bin/margin"\nexport PATH="$HOME/.local/bin:$PATH"'
            }
          />
          <p>
            Add the <code>export PATH</code> line to your shell profile to keep
            it for future terminals.
          </p>
        </details>
      </li>
      <li>
        <div className="cli-setup-heading">
          <span aria-hidden="true">2</span>
          <h3>Log in to this blog</h3>
        </div>
        <p>
          Run this command, sign in as the blog owner if asked, then approve the
          matching code in your browser.
        </p>
        <CLICommand label="Copy login command" command={login} />
        <p>
          Wait for <strong>Connected</strong> in your terminal before
          continuing. Use <code>margin whoami</code> to check your connection.
        </p>
      </li>
      <li>
        <div className="cli-setup-heading">
          <span aria-hidden="true">3</span>
          <h3>Send your first draft</h3>
        </div>
        <p>
          Create <code>notes.md</code>, then run:
        </p>
        <CLICommand
          label="Copy draft command"
          command={
            'margin push --title "Field notes" --slug field-notes --file notes.md'
          }
        />
        <p>
          This creates a draft. Use <code>margin push --help</code> for
          publishing and updating options.
        </p>
      </li>
    </ol>
  );
}
function CLICommand({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setError(false);
    } catch {
      setError(true);
    }
  }
  return (
    <>
      <div className="cli-command">
        <pre>
          <code>{command}</code>
        </pre>
        <button
          type="button"
          aria-label={label}
          title={copied ? "Copied" : label}
          onClick={() => void copy()}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
      {copied && (
        <span className="cli-copy-status" role="status">
          Copied
        </span>
      )}
      {error && (
        <span className="cli-copy-status" role="alert">
          Select the command and copy it manually.
        </span>
      )}
    </>
  );
}
