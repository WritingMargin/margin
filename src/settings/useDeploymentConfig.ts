import { useState } from "react";
import { api, json } from "../api";

type GeneratedConfig = { config: string; filename: string };
export function useDeploymentConfig(publicUrl: string) {
  const [server, setServer] = useState("nginx");
  const [upstream, setUpstream] = useState("http://127.0.0.1:3001");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ key: string; data?: GeneratedConfig; error?: string } | null>(null);
  const [message, setMessage] = useState("");
  const key = JSON.stringify([server, publicUrl, upstream]);
  const current = result?.key === key ? result : null;
  async function generate() {
    setBusy(true);
    setMessage("");
    setResult(null);
    const address = publicUrl.includes("://") ? publicUrl.trim() : `https://${publicUrl.trim()}`;
    try {
      const data = await api<GeneratedConfig>("/settings/deployment", json("POST", { server, publicUrl: address, upstream }));
      setResult({ key, data });
    } catch (error) {
      setResult({ key, error: error instanceof Error ? error.message : "Could not generate the configuration." });
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!current?.data) return;
    try {
      await navigator.clipboard.writeText(current.data.config);
      setMessage("Configuration copied.");
    } catch {
      setMessage("Could not copy. Select the configuration below and copy it manually.");
    }
  }
  function download() {
    if (!current?.data) return;
    const url = URL.createObjectURL(new Blob([current.data.config], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = current.data.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { server, setServer, upstream, setUpstream, busy, current, message, generate, copy, download };
}
