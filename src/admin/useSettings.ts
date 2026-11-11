import { useEffect, useState } from "react";
import { api, json } from "../api";

export function useSettings({ notify }: { notify: (s: string) => void }) {
  const [storage, setStorage] = useState<any>(null);
  const [tokens, setTokens] = useState<any[]>([]);
  const [token, setToken] = useState("");
  const [tokenRole, setTokenRole] = useState("reader");
  const [tokenName, setTokenName] = useState("My CLI");
  const [busy, setBusy] = useState(false);
  const refresh = () => api<any[]>("/tokens").then(setTokens);
  useEffect(() => {
    api("/storage")
      .then(setStorage)
      .catch((e) => notify(e.message));
    void refresh().catch((e) => notify(e.message));
  }, []);
  const createToken = async () => {
    setBusy(true);
    try {
      const r = await api("/tokens", json("POST", { name: tokenName, role: tokenRole }));
      setToken(r.token);
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const changeTokenRole = async (id: string, role: string) => {
    setBusy(true);
    try {
      await api(`/tokens/${id}`, json("PATCH", { role }));
      await refresh();
      notify("Token role updated.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copyToken = () => {
    navigator.clipboard
      .writeText(token)
      .then(() => notify("Token copied."))
      .catch(() => notify("Select and copy the token manually."));
  };
  const revokeToken = async (t: { id: string; name: string }) => {
    if (!confirm(`Revoke ${t.name}?`)) return;
    try {
      await api(`/tokens/${t.id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return {
    revokeToken,
    copyToken,
    createToken,
    tokenRole,
    setTokenRole,
    changeTokenRole,

    notify,
    storage,
    tokens,
    token,
    setToken,
    tokenName,
    setTokenName,
    busy,
    setBusy,
    refresh,
  };
}
export type SettingsPanelController = ReturnType<typeof useSettings>;
