import { contentDesign } from "../../shared/content-types";
import { usePublicationPreview } from "./usePublicationPreview";
import { useEffect,useState } from "react";
import {
type ArticleDesign,
type CommentsDesign,
type HomepageDesign,
type Theme,
} from "../../shared/types";
import type { DesignSection } from "../admin-route";
import { api,json } from "../api";
import "../blog-design.css";
import { useDesignConfig } from "./useDesignConfig";

export function useDesigner({
  theme,
  setTheme,
  notify,
  section,
  setSection,
  onDirtyChange,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
  notify: (s: string) => void;
  section: DesignSection;
  setSection: (section: DesignSection) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const previewContent = usePublicationPreview();
  const [local, setLocal] = useState(theme);
  const [saved, setSaved] = useState(() => JSON.stringify(theme));
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoSource, setLogoSource] = useState<"upload" | "url">(
    /^https?:/.test(theme.logo) ? "url" : "upload",
  );
  const [error, setError] = useState("");
  const config = useDesignConfig(local, setLocal);
  const changed = JSON.stringify(local) !== saved || config.pending;
  useEffect(() => {
    onDirtyChange(changed);
    return () => onDirtyChange(false);
  }, [changed, onDirtyChange]);
  const update = (t: Partial<Theme>) => setLocal((prev) => ({ ...prev, ...t }));
  const home = (t: Partial<HomepageDesign>) =>
    setLocal((prev) => ({ ...prev, homepage: { ...prev.homepage, ...t } }));
  const article = (t: Partial<ArticleDesign>) => {
    const surface = section === "guide" ? section : "article";
    setLocal((prev) => ({ ...prev, [surface]: { ...contentDesign(prev, surface), ...t } }));
  };
  const comments = (t: Partial<CommentsDesign>) =>
    setLocal((prev) => ({ ...prev, comments: { ...prev.comments, ...t } }));
  const saveDesign = async () => {
    if (config.pending) return;
    setSaving(true);
    setError("");
    const snapshot = local;
    try {
      const t = await api<Theme>("/settings", json("PUT", snapshot));
      setTheme(t);
      setSaved(JSON.stringify(t));
      setLocal((current) => (current === snapshot ? t : current));
      notify(
        "Design saved. Your publication is up to date.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const uploadDesignImage = async (e: React.ChangeEvent<HTMLInputElement>, artwork: boolean) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      file.size > 2 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        file.type,
      )
    ) {
      setError("Choose a PNG, JPEG, WebP, or GIF image up to 2 MB.");
      return;
    }
    setUploadingLogo(true);
    setError("");
    try {
      const result = await api<{ url: string }>("/settings/logo", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (artwork) home({ artworkImage: result.url });
      else update({ logo: result.url });
      notify("Image uploaded. Save your design to publish it.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setUploadingLogo(false);
    }
  };
  const uploadHeroVideo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["video/mp4", "video/webm"].includes(file.type) || file.size > 50 * 1024 * 1024) {
      setError("Choose an MP4 or WebM video up to 50 MiB.");
      return;
    }
    setUploadingVideo(true);
    setError("");
    try {
      const result = await api<{ url: string }>(`/media/videos?title=${encodeURIComponent(file.name.slice(0, 200))}`, {
        method: "POST", headers: { "Content-Type": file.type }, body: file,
      });
      setLocal(current => ({ ...current, homepage: { ...current.homepage, artworkVideo: result.url,
        sections: current.homepage.sections?.map(section => section.component === "hero" ? { ...section, props: { ...section.props, mediaType: "video", video: result.url } } : section),
      } }));
      notify("Video uploaded. Save your design to publish it.");
    } catch (error) { setError((error as Error).message); }
    finally { setUploadingVideo(false); }
  };
  const uploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => uploadDesignImage(e, false);
  const uploadArtwork = (e: React.ChangeEvent<HTMLInputElement>) => uploadDesignImage(e, true);
  return {
    previewContent,
    config,
    uploadLogo,
    uploadArtwork,
    uploadHeroVideo,
    uploadingVideo,

    saveDesign,
    theme,
    setTheme,
    notify,
    section,
    setSection,
    local,
    setLocal,
    saved,
    setSaved,
    device,
    setDevice,
    saving,
    setSaving,
    uploadingLogo,
    setUploadingLogo,
    logoSource,
    setLogoSource,
    error,
    setError,
    changed,
    update,
    home,
    article,
    comments,
  };
}
export type DesignerController = ReturnType<typeof useDesigner>;
