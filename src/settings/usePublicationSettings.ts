import type { PWASettings } from "../../shared/pwa";
import type { PublicationSettings, PublicationType } from "../../shared/publication";
import { useEffect, useState } from "react";
import type { DomainSettings, SEOSettings } from "../../shared/seo";
import { api, json } from "../api";
import { basePath } from "../base-path";
import { domainOverride, setupAddress } from "./domain-url";

export function usePublicationSettings(
  notify: (message: string) => void,
  onDirtyChange: (dirty: boolean) => void,
  onPublicationChange: (type: PublicationType) => void,
  cloudManaged = false,
) {
  const [saved, setSaved] = useState<{
    publication: PublicationSettings;
    domain: DomainSettings;
    seo: SEOSettings;
    pwa: PWASettings;
  } | null>(null);
  const [publicationType, setPublicationType] = useState<PublicationType>("blog");
  const [url, setAddress] = useState("");
  const [domainMode, setDomainMode] = useState<"dns" | "proxy">("dns");
  function setUrl(value: string) {
    setAddress(value);
    const currentUrl = saved?.domain.effectiveUrl || "";
    const nextMode = addressMode(setupAddress(value, currentUrl));
    if (nextMode !== addressMode(setupAddress(url, currentUrl))) setDomainMode(nextMode);
  }
  function updateDomain(domain: DomainSettings, preserveInput = false) {
    setSaved(current => current && { ...current, domain });
    if (preserveInput) return;
    setAddress(domainAddress(domain));
    setDomainMode(domain.hosting?.mode || addressMode(domain.effectiveUrl));
  }
  const [seo, setSEO] = useState<SEOSettings | null>(null);
  const [pwa, setPWA] = useState<PWASettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([
      api<PublicationSettings>("/settings/publication"),
      api<DomainSettings>("/settings/domain"),
      api<SEOSettings>("/settings/seo"),
      api<PWASettings>("/settings/pwa"),
    ])
      .then(([publication, domain, settings, pwaSettings]) => {
        if (!active) return;
        setSaved({ publication, domain, seo: settings, pwa: pwaSettings });
        setPWA(pwaSettings);
        setPublicationType(publication.type);
        setAddress(domainAddress(domain));
        setDomainMode(domain.hosting?.mode || addressMode(domain.effectiveUrl));
        setSEO(settings);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const publicationDirty = Boolean(saved && publicationType !== saved.publication.type);
  const { normalizedUrl, domainDirty, domainPathChanged } = domainChanges(saved?.domain, url, domainMode, cloudManaged);
  const seoDirty = Boolean(
    saved && JSON.stringify(seo) !== JSON.stringify(saved.seo),
  );
  const pwaDirty = Boolean(saved && JSON.stringify(pwa) !== JSON.stringify(saved.pwa));
  useEffect(() => {
    onDirtyChange(domainDirty || seoDirty || publicationDirty || pwaDirty);
    return () => onDirtyChange(false);
  }, [domainDirty, seoDirty, publicationDirty, pwaDirty, onDirtyChange]);

  async function savePublication() {
    setBusy(true);
    setError("");
    try {
      const publication = await api<PublicationSettings>("/settings/publication", json("PUT", { type: publicationType }));
      setSaved(current => current && { ...current, publication });
      setPublicationType(publication.type);
      onPublicationChange(publication.type);
      notify("Publication type saved. Your reader-facing labels are up to date.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(section: "domain" | "seo") {
    setBusy(true);
    setError("");
    try {
      if (section === "domain") {
        await saveDomain();
      } else {
        const settings = await api<SEOSettings>("/settings/seo", json("PUT", seo));
        setSaved(current => current && { ...current, seo: settings });
        setSEO(settings);
        notify("SEO settings saved.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDomain() {
    if (domainPathChanged) throw new Error("Apply the generated config and restart Margin, then save this address.");
    const input = cloudManaged
      ? { url: normalizedUrl, mode: domainMode }
      : { url: domainOverride(normalizedUrl, basePath) };
    const domain = await api<DomainSettings>("/settings/domain", json("PUT", input));
    updateDomain(domain);
    notify(domainSaveMessage(domain));
  }
  async function refreshDomain() {
    setBusy(true);
    setError("");
    try {
      updateDomain(await api<DomainSettings>("/settings/domain"), domainDirty);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePWA() {
    setBusy(true);
    setError("");
    try {
      const settings = await api<PWASettings>("/settings/pwa", json("PUT", pwa));
      setSaved(current => current && { ...current, pwa: settings });
      setPWA(settings);
      notify("PWA settings saved. Installed devices may take time to refresh their branding.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return {
    pwa, setPWA, pwaDirty, savePWA,
    publicationType, setPublicationType, publicationDirty, savePublication,
    saved,
    url,
    setUrl,
    seo,
    setSEO,
    busy,
    error,
    domainDirty, domainMode, setDomainMode, domainPathChanged, refreshDomain,
    seoDirty,
    save,
    retry: () => setAttempt((value) => value + 1),
  };
}
export type PublicationSettingsController = ReturnType<
  typeof usePublicationSettings
>;

function domainAddress(domain: DomainSettings) {
  return domain.hosting?.requestedUrl || domain.effectiveUrl;
}
function addressMode(value: string): "dns" | "proxy" {
  try { return new URL(value).pathname.replace(/\/+$/, "") ? "proxy" : "dns"; }
  catch { return "dns"; }
}
function changedMount(value: string) {
  if (!value) return false;
  try { return new URL(value).pathname.replace(/\/+$/, "") !== basePath; }
  catch { return false; }
}
function domainSaveMessage(domain: DomainSettings) {
  const hosting = domain.hosting;
  if (!hosting || hosting.status === "ready") return "Blog address saved.";
  if (hosting.message) return hosting.message;
  if (hosting.status === "pending_dns") return "Waiting for your DNS record. Check DNS after adding it.";
  if (hosting.status === "applying") return "Applying your address. Setup is still in progress.";
  return "Domain setup is currently unavailable.";
}

function domainChanges(domain: DomainSettings | undefined, url: string, mode: "dns" | "proxy", hosted: boolean) {
  const currentUrl = domain?.effectiveUrl || "";
  const normalizedUrl = setupAddress(url, currentUrl);
  const originalUrl = domain ? setupAddress(domainAddress(domain), currentUrl) : "";
  const changedMode = hosted && mode !== domain?.hosting?.mode;
  return { normalizedUrl, domainDirty: Boolean(domain && (normalizedUrl !== originalUrl || changedMode)), domainPathChanged: !hosted && changedMount(normalizedUrl) };
}
