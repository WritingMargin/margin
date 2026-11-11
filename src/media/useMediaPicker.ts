import { linkURL } from "../../shared/link-preview";
import { audioHelp, resolveAudio } from "../../shared/audio";
import { tagAttributes } from "../../shared/content-tags";
import { useCallback,useEffect,useRef,useState } from "react";
import { newMediaTag, type MediaDefaults } from "../../shared/media-defaults";
import { useMediaDefaults } from "./useMediaDefaults";
import { resolveVideo,videoHelp } from "../../shared/video";
import { type MediaTab } from "../admin-route";
import { api,json } from "../api";
import { safeMediaUrl } from "../media";
type InsertKind = "image" | "video" | "audio" | "link";
const mediaResolvers = { image: safeMediaUrl, video: resolveVideo, audio: resolveAudio, link: linkURL };
function insertKind(kind: string): InsertKind { return kind in mediaResolvers ? kind as InsertKind : "image"; }
interface Asset {
  public_id: string;
  secure_url: string;
  resource_type: string;
  format: string;
}
export function useMediaPicker({
  onInsert,
  notify,
  activeTab,
  onTabChange,
}: {
  onInsert?: (s: string) => void;
  notify: (s: string) => void;
  activeTab?: MediaTab;
  onTabChange?: (tab: MediaTab) => void;
}) {
  const [localTab, setLocalTab] = useState<MediaTab>(onInsert ? "link" : "uploads");
  const requestedTab = activeTab || localTab;
  const tab = requestedTab === "link" && !onInsert ? "uploads" : requestedTab;
  const changeTab = onTabChange || setLocalTab;
  const setTab = (next: MediaTab) => { setError(""); changeTab(next); };
  const [url, setUrl] = useState("");
  const defaults = useMediaDefaults();
  const [selected, setSelected] = useState<{ src: string; kind: "image" | "video" | "audio" | "link" } | null>(null);
  const [stickyVideo, setStickyVideo] = useState(false);
  const [kind, setKind] = useState("image");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ configured: boolean; resources: Asset[] }>("/media", { signal });
      if (signal?.aborted) return;
      setConfigured(result.configured);
      setAssets(result.resources);
    } catch (error) {
      if (!signal?.aborted) setError((error as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (tab !== "library") return;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [tab, refresh]);
  const insert = (src = url, type = kind) => {
    const mediaKind = insertKind(type);
    if (!mediaResolvers[mediaKind](src)) {
      const help = { audio: audioHelp, video: videoHelp, image: "Use a complete http or https image URL.", link: "Use a complete http or https page URL." };
      setError(help[mediaKind]);
      return;
    }
    setStickyVideo(false);
    setSelected({ src, kind: mediaKind });
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setError("");
    try {
      const sign = await api("/media/sign", json("POST", { folder: "margin" }));
      const data = new FormData();
      data.append("file", f);
      data.append("api_key", sign.apiKey);
      data.append("timestamp", String(sign.timestamp));
      data.append("signature", sign.signature);
      data.append("folder", sign.folder);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`,
        { method: "POST", body: data },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message || "Upload failed.");
      await refresh();
      notify("Uploaded to Cloudinary. Select the asset to preview it.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };
  return {
    upload,

    onInsert,
    notify,
    tab,
    setTab,
    url,
    setUrl,
    selected,
    stickyVideo,
    setStickyVideo,
    defaults,
    tag: selectedMediaTag(selected, defaults.defaults, stickyVideo),
    kind,
    setKind,
    assets,
    configured,
    loading,
    uploading,
    setUploading,
    error,
    setError,
    file,
    refresh,
    insert,
  };
}
export type MediaPickerController = ReturnType<typeof useMediaPicker>;

function selectedMediaTag(selected: { kind: InsertKind; src: string } | null, defaults: MediaDefaults, sticky: boolean) {
  if (!selected) return "";
  if (selected.kind === "link") return `[Link${tagAttributes({ url: selected.src })}]`;
  if (selected.kind === "audio") return `[Audio${tagAttributes({ src: selected.src, title: "Listen to this article" })}]`;
  const layout = selected.kind === "video" && sticky ? { ...defaults, video: { ...defaults.video, sticky: "true" } } : defaults;
  return newMediaTag(selected.kind, selected.src, layout);
}
