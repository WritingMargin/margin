import type { PWASettings } from "../../shared/pwa";
import type { PublicationSettings, PublicationType } from "../../shared/publication";
import { useEffect, useState } from "react";
import type { DomainSettings, SEOSettings } from "../../shared/seo";
import { api, json } from "../api";
import { basePath } from "../base-path";
import { domainOverride } from "./domain-url";

export function usePublicationSettings(
  notify: (message: string) => void,
  onDirtyChange: (dirty: boolean) => void,
  onPublicationChange: (type: PublicationType) => void,
) {
  const [saved, setSaved] = useState<{
    publication: PublicationSettings;
    domain: DomainSettings;
    seo: SEOSettings;
    pwa: PWASettings;
  } | null>(null);
  const [publicationType, setPublicationType] = useState<PublicationType>("blog");
  const [url, setUrl] = useState("");
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
        setUrl(domain.effectiveUrl);
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
  const domainDirty = Boolean(saved && url !== saved.domain.effectiveUrl);
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
        const domain = await api<DomainSettings>(
          "/settings/domain",
          json("PUT", { url: domainOverride(url, basePath) }),
        );
        setSaved((current) => current && { ...current, domain });
        setUrl(domain.effectiveUrl);
      } else {
        const settings = await api<SEOSettings>(
          "/settings/seo",
          json("PUT", seo),
        );
        setSaved((current) => current && { ...current, seo: settings });
        setSEO(settings);
      }
      notify(
        section === "domain" ? "Blog domain saved." : "SEO settings saved.",
      );
    } catch (e) {
      setError((e as Error).message);
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
    domainDirty,
    seoDirty,
    save,
    retry: () => setAttempt((value) => value + 1),
  };
}
export type PublicationSettingsController = ReturnType<
  typeof usePublicationSettings
>;
