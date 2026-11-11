import { useEffect,useRef,useState } from "react";
import {
aiInputLimits,
type AIConfig,
type AIHistory,
type GeneratedImage,
type ImageSize,
type ImageStyle,
type SocialPlatform,
type SummaryGeneration,
type SummaryTone,
} from "../../shared/ai";
import type { Post } from "../../shared/types";
import "../ai.css";
import { api } from "../api";
import { generationRequest } from "./helpers";

export function useAIStudio({
  initialTab,
  post,
  onSave,
  onInsert,
  onUseImage,
  imagePurpose = "cover",
  notify,
}: {
  initialTab: "social" | "images";
  post: Post;
  onSave: () => Promise<unknown>;
  onInsert: (markdown: string) => void;
  onUseImage: (url: string) => void;
  imagePurpose?: "cover" | "sharing";
  notify: (text: string) => void;
}) {
  const published = Boolean(post.id) && post.status === "published";
  const [tab, setTab] = useState<"social" | "images" | "history">(
    initialTab === "social" && !published ? "images" : initialTab,
  );
  const scrollArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!published && tab === "social") setTab("images");
  }, [published, tab]);
  useEffect(() => {
    scrollArea.current?.scrollTo({ top: 0 });
  }, [tab]);
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [history, setHistory] = useState<AIHistory>({
    summaries: [],
    images: [],
  });
  const [selected, setSelected] = useState<SocialPlatform[]>([
    "linkedin",
    "x",
    "instagram",
  ]);
  const [tone, setTone] = useState<SummaryTone>("natural");
  const [instructions, setInstructions] = useState("");
  const [style, setStyle] = useState<ImageStyle>("editorial");
  const [size, setSize] = useState<ImageSize>("1536x1024");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"social" | "images" | "save" | null>(null);
  const [result, setResult] = useState<SummaryGeneration | null>(null);
  const [texts, setTexts] = useState<Partial<Record<SocialPlatform, string>>>(
    {},
  );
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [copied, setCopied] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const requestInFlight = useRef(false);
  const currentPostId = useRef(post.id);
  currentPostId.current = post.id;
  useEffect(() => {
    api<AIConfig>("/ai/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setHistory({ summaries: [], images: [] });
    setResult(null);
    setTexts({});
    setImage(null);
    setCopied("");
    if (!post.id) {
      setHistoryLoading(false);
      return () => controller.abort();
    }
    setHistoryLoading(true);
    api<AIHistory>(`/ai/history?postId=${encodeURIComponent(post.id)}`, {
      signal: controller.signal,
    })
      .then((saved) => {
        if (controller.signal.aborted) return;
        // Preserve a result generated while the initial history request was running.
        setHistory((current) => ({
          summaries: [
            ...current.summaries,
            ...saved.summaries.filter(
              (item) =>
                !current.summaries.some((entry) => entry.id === item.id),
            ),
          ],
          images: [
            ...current.images,
            ...saved.images.filter(
              (item) => !current.images.some((entry) => entry.id === item.id),
            ),
          ],
        }));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [post.id]);
  const loadSummary = (s: SummaryGeneration) => {
    if (!published) return;
    setResult(s);
    setTexts(Object.fromEntries(s.summaries.map((v) => [v.platform, v.text])));
    setCopied("");
    setTab("social");
  };
  const { disabled, summaryUnavailable, valid, validTitle } =
    generationAvailability(post, busy, config);
  const imageUnavailable = imageGenerationUnavailable(config, prompt);
  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the text directly.",
      );
    }
  };
  const generate = async (kind: "social" | "images") => {
    // State updates are asynchronous; a ref also guards rapid repeated clicks.
    if (
      generationBlocked(
        requestInFlight,
        disabled,
        kind,
        summaryUnavailable,
        imageUnavailable,
        published,
        selected,
      )
    )
      return;
    requestInFlight.current = true;
    const sourcePostId = post.id;
    setBusy(kind);
    setError("");
    setCopied("");
    try {
      const source = {
        postId: post.id,
        title: post.title,
        content: post.content,
      };
      if (kind === "social") {
        const s = await generationRequest("/ai/summaries", {
          ...source,
          platforms: selected,
          tone,
          instructions,
        });
        if (currentPostId.current !== sourcePostId) return;
        loadSummary(s);
        setHistory((h) => ({ ...h, summaries: [s, ...h.summaries] }));
      } else {
        const i = await generationRequest("/ai/images", {
          ...source,
          prompt,
          style,
          size,
        });
        if (currentPostId.current !== sourcePostId) return;
        setImage(i);
        setHistory((h) => ({ ...h, images: [i, ...h.images] }));
      }
    } catch (e) {
      if (currentPostId.current === sourcePostId)
        setError((e as Error).message);
    } finally {
      requestInFlight.current = false;
      setBusy(null);
      api<AIConfig>("/ai/config")
        .then(setConfig)
        .catch(() => {});
    }
  };
  return {
    post,
    onSave,
    onInsert,
    onUseImage,
    imagePurpose,
    notify,
    published,
    tab,
    setTab,
    scrollArea,
    config,
    setConfig,
    history,
    selected,
    setSelected,
    tone,
    setTone,
    instructions,
    setInstructions,
    style,
    setStyle,
    size,
    setSize,
    prompt,
    setPrompt,
    error,
    setError,
    busy,
    setBusy,
    result,
    texts,
    setTexts,
    image,
    setImage,
    copied,
    setCopied,
    historyLoading,
    loadSummary,
    valid,
    validTitle,
    disabled,
    summaryUnavailable,
    imageUnavailable,
    copy,
    generate,
  };
}
export type AIPanelController = ReturnType<typeof useAIStudio>;

function generationBlocked(
  requestInFlight: React.RefObject<boolean>,
  disabled: boolean,
  kind: string,
  summaryUnavailable: boolean,
  imageUnavailable: boolean,
  published: boolean,
  selected: SocialPlatform[],
) {
  return (
    requestInFlight.current ||
    disabled ||
    (kind === "social" ? summaryUnavailable : imageUnavailable) ||
    (kind === "social" && (!published || !selected.length))
  );
}

function generationAvailability(
  post: Post,
  busy: string | null,
  config: AIConfig | null,
) {
  const valid = validContent(post.content);
  const validTitle = Boolean(post.title.trim());
  const disabled =
    !!busy || !config?.configured || !post.id || !valid || !validTitle;
  const summaryUnavailable = !config?.features?.summaries;
  return { disabled, summaryUnavailable, valid, validTitle };
}

function validContent(content: string | undefined) {
  return !!content?.trim() && (content?.length || 0) <= aiInputLimits.content;
}

function imageGenerationUnavailable(config: AIConfig | null, prompt: string) {
  return !config?.features?.image || (!prompt.trim() && !config.features.imageBrief);
}
